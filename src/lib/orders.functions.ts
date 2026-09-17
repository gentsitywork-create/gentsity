import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const sendToCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ order_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("অনুমতি নেই।");

    const apiKey = process.env["STEADFAST_API_KEY"];
    const secretKey = process.env["STEADFAST_SECRET_KEY"];
    if (!apiKey || !secretKey) {
      throw new Error("Steadfast এর API Key এখনো সেট করা হয়নি।");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
