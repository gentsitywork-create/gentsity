import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function clientIp(): string {
  const fwd = getRequestHeader("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return first || getRequestIP({ xForwardedFor: true }) || "";
}

const orderSchema = z.object({
  customer_name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^01[3-9]\d{8}$/),
  address: z.string().trim().min(10).max(400),
  district: z.string().trim().max(60).optional().default(""),
  note: z.string().trim().max(300).optional().default(""),
  size: z.enum(["M", "L", "XL", "XXL"]),
  items: z
    .array(z.object({ variant_id: z.string().uuid(), qty: z.number().int().min(1).max(5) }))
    .min(1)
    .max(5),
});

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((data) => orderSchema.parse(data))
  .handler(async ({ data }) => {
    const totalQty = data.items.reduce((s, i) => s + i.qty, 0);
    if (totalQty !== 5) throw new Error("অনুগ্রহ করে ঠিক ৫ পিস সিলেক্ট করুন।");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ip = clientIp();
    if (ip) {
      const { data: blocked } = await supabaseAdmin
        .from("blocked_ips")
        .select("id")
        .eq("ip", ip)
        .maybeSingle();
      if (blocked) {
        throw new Error("দুঃখিত, এই মুহূর্তে অর্ডার নেওয়া যাচ্ছে না। সহায়তার জন্য যোগাযোগ করুন।");
      }
    }

    const ids = data.items.map((i) => i.variant_id);
    const { data: variants, error: vErr } = await supabaseAdmin
      .from("product_variants")
      .select("id, size, color_name, stock, is_active")
      .in("id", ids);
    if (vErr) throw new Error("স্টক যাচাই করা যায়নি, আবার চেষ্টা করুন।");

    for (const item of data.items) {
      const v = variants?.find((x) => x.id === item.variant_id);
      if (!v || !v.is_active || v.size !== data.size) {
        throw new Error("নির্বাচিত রঙ এখন আর পাওয়া যাচ্ছে না।");
      }
      if (v.stock < item.qty) {
        throw new Error(`${v.color_name} রঙে পর্যাপ্ত স্টক নেই।`);
      }
    }

    const { data: priceRow } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "combo_price")
      .maybeSingle();
    const total = Number(priceRow?.value ?? 999) || 999;

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_name: data.customer_name,
        phone: data.phone,
        address: data.address,
        district: data.district || null,
        note: data.note || null,
        total_amount: total,
        delivery_charge: 0,
        customer_ip: clientIp() || null,
      })
      .select("id, order_no")
      .single();
    if (oErr || !order) throw new Error("অর্ডার জমা হয়নি, আবার চেষ্টা করুন।");

    const rows = data.items.map((item) => {
      const v = variants!.find((x) => x.id === item.variant_id)!;
      return {
        order_id: order.id,
        variant_id: v.id,
        size: v.size,
        color_name: v.color_name,
        qty: item.qty,
      };
    });
    const { error: iErr } = await supabaseAdmin.from("order_items").insert(rows);
    if (iErr) throw new Error("অর্ডারের তথ্য সেভ হয়নি, আবার চেষ্টা করুন।");

    for (const item of data.items) {
      const v = variants!.find((x) => x.id === item.variant_id)!;
      await supabaseAdmin
        .from("product_variants")
        .update({ stock: v.stock - item.qty })
        .eq("id", v.id);
    }

    return { order_no: order.order_no, total };
  });

const adminItemSchema = z.object({
  variant_id: z.string().uuid().nullable().optional(),
  size: z.enum(["M", "L", "XL", "XXL"]),
  color_name: z.string().trim().min(1).max(60),
  qty: z.number().int().min(1).max(20),
});

const adminOrderSchema = z.object({
  customer_name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^01[3-9]\d{8}$/),
  address: z.string().trim().min(5).max(400),
  district: z.string().trim().max(60).optional().default(""),
  note: z.string().trim().max(300).optional().default(""),
  total_amount: z.number().int().min(0).max(1000000),
  delivery_charge: z.number().int().min(0).max(10000).optional().default(0),
  status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]).optional(),
  items: z.array(adminItemSchema).min(1).max(20),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("অনুমতি নেই।");
}

export const adminCreateOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => adminOrderSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_name: data.customer_name,
        phone: data.phone,
        address: data.address,
        district: data.district || null,
        note: data.note || null,
        total_amount: data.total_amount,
        delivery_charge: data.delivery_charge ?? 0,
        status: data.status ?? "confirmed",
      })
      .select("id, order_no")
      .single();
    if (error || !order) throw new Error("অর্ডার তৈরি হয়নি।");

    const { error: iErr } = await supabaseAdmin.from("order_items").insert(
      data.items.map((it) => ({
        order_id: order.id,
        variant_id: it.variant_id ?? null,
        size: it.size,
        color_name: it.color_name,
        qty: it.qty,
      })),
    );
    if (iErr) throw new Error("অর্ডারের পণ্য সেভ হয়নি।");

    for (const it of data.items) {
      if (!it.variant_id) continue;
      const { data: v } = await supabaseAdmin
        .from("product_variants")
        .select("stock")
        .eq("id", it.variant_id)
        .maybeSingle();
      if (v) {
        await supabaseAdmin
          .from("product_variants")
          .update({ stock: Math.max(0, v.stock - it.qty) })
          .eq("id", it.variant_id);
      }
    }

    return { order_no: order.order_no };
  });

export const adminUpdateOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    adminOrderSchema.extend({ order_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: uErr } = await supabaseAdmin
      .from("orders")
      .update({
        customer_name: data.customer_name,
        phone: data.phone,
        address: data.address,
        district: data.district || null,
        note: data.note || null,
        total_amount: data.total_amount,
        delivery_charge: data.delivery_charge ?? 0,
        ...(data.status ? { status: data.status } : {}),
      })
      .eq("id", data.order_id);
    if (uErr) throw new Error("অর্ডার আপডেট হয়নি।");

    // পুরনো পণ্যের স্টক ফেরত দিয়ে নতুন তালিকা বসানো হয়
    const { data: oldItems } = await supabaseAdmin
      .from("order_items")
      .select("variant_id, qty")
      .eq("order_id", data.order_id);

    for (const it of oldItems ?? []) {
      if (!it.variant_id) continue;
      const { data: v } = await supabaseAdmin
        .from("product_variants")
        .select("stock")
        .eq("id", it.variant_id)
        .maybeSingle();
      if (v) {
        await supabaseAdmin
          .from("product_variants")
          .update({ stock: v.stock + it.qty })
          .eq("id", it.variant_id);
      }
    }

    await supabaseAdmin.from("order_items").delete().eq("order_id", data.order_id);

    const { error: iErr } = await supabaseAdmin.from("order_items").insert(
      data.items.map((it) => ({
        order_id: data.order_id,
        variant_id: it.variant_id ?? null,
        size: it.size,
        color_name: it.color_name,
        qty: it.qty,
      })),
    );
    if (iErr) throw new Error("অর্ডারের পণ্য আপডেট হয়নি।");

    for (const it of data.items) {
      if (!it.variant_id) continue;
      const { data: v } = await supabaseAdmin
        .from("product_variants")
        .select("stock")
        .eq("id", it.variant_id)
        .maybeSingle();
      if (v) {
        await supabaseAdmin
          .from("product_variants")
          .update({ stock: Math.max(0, v.stock - it.qty) })
          .eq("id", it.variant_id);
      }
    }

    return { ok: true };
  });

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = String((context.claims as { email?: string }).email ?? "").toLowerCase();
    const allowed = ["gentsitybd@gmail.com"];
    if (!allowed.includes(email)) return { admin: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    return { admin: true };
  });

async function getSetting(supabaseAdmin: any, key: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

export const sendToCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ order_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("অনুমতি নেই।");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [apiKey, secretKey] = await Promise.all([
      getSetting(supabaseAdmin, "steadfast_api_key"),
      getSetting(supabaseAdmin, "steadfast_secret_key"),
    ]);
    if (!apiKey || !secretKey) {
      throw new Error("Steadfast এর API Key এখনো সেট করা হয়নি। সেটিংসে Key গুলো বসান।");
    }

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", data.order_id)
      .single();
    if (error || !order) throw new Error("অর্ডার পাওয়া যায়নি।");
    if (order.courier_consignment_id) {
      return { consignment_id: order.courier_consignment_id, already: true };
    }

    const res = await fetch("https://portal.packzy.com/api/v1/create_order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": apiKey,
        "Secret-Key": secretKey,
      },
      body: JSON.stringify({
        invoice: String(order.order_no),
        recipient_name: order.customer_name,
        recipient_phone: order.phone,
        recipient_address: `${order.address}${order.district ? ", " + order.district : ""}`,
        cod_amount: order.total_amount,
        note: order.note ?? "",
      }),
    });

    const payload = (await res.json().catch(() => null)) as
      | { consignment?: { consignment_id?: number | string; tracking_code?: string; status?: string }; message?: string }
      | null;

    if (!res.ok || !payload?.consignment) {
      throw new Error(payload?.message || "Steadfast এ অর্ডার পাঠানো যায়নি।");
    }

    await supabaseAdmin
      .from("orders")
      .update({
        courier_consignment_id: String(payload.consignment.consignment_id ?? ""),
        courier_tracking_code: payload.consignment.tracking_code ?? null,
        courier_status: payload.consignment.status ?? "in_review",
        status: "shipped",
      })
      .eq("id", order.id);

    return {
      consignment_id: String(payload.consignment.consignment_id ?? ""),
      tracking_code: payload.consignment.tracking_code ?? "",
    };
  });

/** BD Courier দিয়ে কাস্টমারের ডেলিভারি সাকসেস রেশিও যাচাই */
export const checkCourierRatio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ phone: z.string().trim().regex(/^01[3-9]\d{8}$/) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const key = await getSetting(supabaseAdmin, "bdcourier_api_key");
    if (!key) {
      throw new Error("BD Courier এর API Key সেট করা হয়নি। সেটিংসে Key বসান।");
    }

    const res = await fetch(
      `https://bdcourier.com/api/courier-check?phone=${encodeURIComponent(data.phone)}`,
      { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
    );

    const payload = (await res.json().catch(() => null)) as any;
    if (!res.ok || !payload) {
      throw new Error(payload?.message || "BD Courier থেকে তথ্য আনা যায়নি।");
    }

    const cd = payload.courierData ?? payload.data?.courierData ?? payload;
    const summary = cd?.summary ?? {};
    const couriers: { name: string; total: number; success: number; cancelled: number }[] = [];
    for (const [name, v] of Object.entries(cd ?? {})) {
      if (name === "summary" || typeof v !== "object" || v === null) continue;
      const o = v as any;
      couriers.push({
        name,
        total: Number(o.total_parcel ?? 0),
        success: Number(o.success_parcel ?? 0),
        cancelled: Number(o.cancelled_parcel ?? 0),
      });
    }

    const total = Number(summary.total_parcel ?? 0);
    const success = Number(summary.success_parcel ?? 0);
    const cancelled = Number(summary.cancelled_parcel ?? 0);
    const ratio = Number(summary.success_ratio ?? (total ? Math.round((success / total) * 100) : 0));

    return { phone: data.phone, total, success, cancelled, ratio, couriers };
  });
