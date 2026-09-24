import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function clientIp(): string {
  const fwd = getRequestHeader("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return first || getRequestIP({ xForwardedFor: true }) || "";
}

/** একই মোবাইল নম্বর থেকে ৩০ মিনিটের মধ্যে দ্বিতীয় অর্ডার ব্লক করে। */
async function blockRecentOrder(supabaseAdmin: any, phone: string) {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("phone", phone)
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) {
    throw new Error("আপনি ইতিমধ্যে অর্ডার করেছেন। ৩০ মিনিট পর আবার অর্ডার করতে পারবেন।");
  }
}

/** Facebook Conversions API-তে সার্ভার থেকে Purchase ইভেন্ট পাঠায় (টোকেন সেট থাকলে)। */
async function sendPurchaseCapi(
  supabaseAdmin: any,
  opts: { orderNo: number | string; total: number; phone: string },
) {
  try {
    const { data: rows } = await supabaseAdmin
      .from("settings")
      .select("key, value")
      .in("key", ["fb_pixel_id", "fb_access_token"]);
    const map: Record<string, string> = {};
    (rows ?? []).forEach((r: any) => (map[r.key] = r.value ?? ""));
    const pixelId = map["fb_pixel_id"];
    const token = map["fb_access_token"];
    if (!pixelId || !token) return;

    const normalized = `88${opts.phone.replace(/\D/g, "")}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
    const ph = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            event_name: "Purchase",
            event_time: Math.floor(Date.now() / 1000),
            event_id: `order-${opts.orderNo}`,
            action_source: "website",
            user_data: {
              ph: [ph],
              client_ip_address: clientIp() || undefined,
              client_user_agent: getRequestHeader("user-agent") ?? undefined,
            },
            custom_data: { value: opts.total, currency: "BDT" },
          },
        ],
      }),
    });
  } catch {
    // পিক্সেল ইভেন্ট ব্যর্থ হলেও অর্ডার আটকাবে না
  }
}

const orderSchema = z.object({
  customer_name: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().regex(/^01[3-9]\d{8}$/),
  address: z.string().trim().max(400).optional().default(""),
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

    await blockRecentOrder(supabaseAdmin, data.phone);

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

/* ===================== পায়জামা/স্নিকার্স অর্ডার (পিস অনুযায়ী) ===================== */

type CatalogConfig = {
  page: "pajama" | "sneakers";
  dhakaKey: string;
  outsideKey: string;
  dhakaFallback: number;
  outsideFallback: number;
};

const catalogOrderSchema = (sizes: [string, ...string[]]) =>
  z.object({
    customer_name: z.string().trim().max(80).optional().default(""),
    phone: z.string().trim().regex(/^01[3-9]\d{8}$/),
    address: z.string().trim().max(400).optional().default(""),
    size: z.enum(sizes),
    delivery_area: z.enum(["dhaka", "outside"]).optional().default("outside"),
    items: z
      .array(z.object({ product_id: z.string().uuid(), qty: z.number().int().min(1).max(50) }))
      .min(1)
      .max(50),
  });

type CatalogOrderData = z.infer<ReturnType<typeof catalogOrderSchema>>;

async function handleCatalogOrder(config: CatalogConfig, data: CatalogOrderData) {
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

      await blockRecentOrder(supabaseAdmin, data.phone);

      const ids = data.items.map((i) => i.product_id);
      const [{ data: rawProducts, error: pErr }, { data: stocks, error: sErr }] = await Promise.all([
        (supabaseAdmin
          .from("pajama_products")
          .select("id, name, product_kind, pieces_per_unit, price, is_active") as any)
          .eq("page", config.page)
          .in("id", ids),
        supabaseAdmin
          .from("pajama_product_stock")
          .select("product_id, size, stock")
          .in("product_id", ids)
          .eq("size", data.size),
      ]);
      if (pErr || sErr) throw new Error("স্টক যাচাই করা যায়নি, আবার চেষ্টা করুন।");
      const products = rawProducts as
        | { id: string; name: string; product_kind: string; pieces_per_unit: number; price: number; is_active: boolean }[]
        | null;

      let subtotal = 0;
      for (const item of data.items) {
        const product = products?.find((x) => x.id === item.product_id);
        const stock = stocks?.find((x) => x.product_id === item.product_id);
        if (!product || !product.is_active) {
          throw new Error("নির্বাচিত ডিজাইন এখন আর পাওয়া যাচ্ছে না।");
        }
        if (!stock || stock.stock < item.qty) {
          throw new Error(`${product.name} প্রোডাক্টে নির্বাচিত সাইজের পর্যাপ্ত স্টক নেই।`);
        }
        subtotal += product.price * item.qty;
      }

      const [{ data: dhakaRow }, { data: outsideRow }] = await Promise.all([
        supabaseAdmin.from("settings").select("value").eq("key", config.dhakaKey).maybeSingle(),
        supabaseAdmin.from("settings").select("value").eq("key", config.outsideKey).maybeSingle(),
      ]);
      const areaRate = data.delivery_area === "dhaka" ? dhakaRow?.value : outsideRow?.value;
      const fallback = data.delivery_area === "dhaka" ? config.dhakaFallback : config.outsideFallback;
      const deliveryCharge = Math.max(0, Number(areaRate ?? fallback) || fallback);
      const total = subtotal + deliveryCharge;

      const { data: order, error: oErr } = await supabaseAdmin
        .from("orders")
        .insert({
          customer_name: data.customer_name,
          phone: data.phone,
          address: data.address,
          total_amount: total,
          delivery_charge: deliveryCharge,
          product_type: config.page,
          customer_ip: ip || null,
        })
        .select("id, order_no")
        .single();
      if (oErr || !order) throw new Error("অর্ডার জমা হয়নি, আবার চেষ্টা করুন।");

      const rows = data.items.map((item) => {
        const product = products?.find((x) => x.id === item.product_id);
        if (!product) throw new Error("নির্বাচিত প্রোডাক্ট পাওয়া যায়নি।");
        return {
          order_id: order.id,
          variant_id: null,
          pajama_product_id: product.id,
          size: data.size,
          color_name: `${product.name} (${product.product_kind === "combo" ? "২ পিস কম্বো" : "সিঙ্গেল পিস"})`,
          qty: item.qty,
          unit_price: product.price,
          pieces_per_unit: product.pieces_per_unit,
        };
      });
      const { error: iErr } = await supabaseAdmin.from("order_items").insert(rows);
      if (iErr) throw new Error("অর্ডারের তথ্য সেভ হয়নি, আবার চেষ্টা করুন।");

      for (const item of data.items) {
        const stock = stocks?.find((x) => x.product_id === item.product_id);
        if (!stock) continue;
        await supabaseAdmin
          .from("pajama_product_stock")
          .update({ stock: stock.stock - item.qty })
          .eq("product_id", item.product_id)
          .eq("size", data.size);
      }

      return { order_no: order.order_no, total, delivery_charge: deliveryCharge };
}

const pajamaSchema = catalogOrderSchema(["M", "L", "XL", "XXL"]);
const sneakersSchema = catalogOrderSchema(["40", "41", "42", "43", "44"]);

export const placePajamaOrder = createServerFn({ method: "POST" })
  .inputValidator((data) => pajamaSchema.parse(data))
  .handler(async ({ data }) =>
    handleCatalogOrder(
      { page: "pajama", dhakaKey: "pajama_delivery_charge_dhaka", outsideKey: "pajama_delivery_charge_outside", dhakaFallback: 70, outsideFallback: 120 },
      data as CatalogOrderData,
    ),
  );

export const placeSneakersOrder = createServerFn({ method: "POST" })
  .inputValidator((data) => sneakersSchema.parse(data))
  .handler(async ({ data }) =>
    handleCatalogOrder(
      { page: "sneakers", dhakaKey: "sneakers_delivery_charge_dhaka", outsideKey: "sneakers_delivery_charge_outside", dhakaFallback: 80, outsideFallback: 130 },
      data as CatalogOrderData,
    ),
  );

const adminItemSchema = z.object({
  variant_id: z.string().uuid().nullable().optional(),
  pajama_product_id: z.string().uuid().nullable().optional(),
  size: z.enum(["M", "L", "XL", "XXL", "40", "41", "42", "43", "44"]),
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
  status: z.enum(["pending", "confirmed", "hold", "shipped", "delivered", "cancelled"]).optional(),
  product_type: z.enum(["polo", "pajama", "sneakers"]).optional().default("polo"),
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
        product_type: data.product_type,
      })
      .select("id, order_no")
      .single();
    if (error || !order) throw new Error("অর্ডার তৈরি হয়নি।");

    const { error: iErr } = await supabaseAdmin.from("order_items").insert(
      data.items.map((it) => ({
        order_id: order.id,
        variant_id: it.variant_id ?? null,
        pajama_product_id: it.pajama_product_id ?? null,
        size: it.size,
        color_name: it.color_name,
        qty: it.qty,
      })),
    );
    if (iErr) throw new Error("অর্ডারের পণ্য সেভ হয়নি।");

    for (const it of data.items) {
      if (it.pajama_product_id) {
        const { data: stockRow } = await supabaseAdmin
          .from("pajama_product_stock")
          .select("stock")
          .eq("product_id", it.pajama_product_id)
          .eq("size", it.size)
          .maybeSingle();
        if (stockRow) {
          await supabaseAdmin
            .from("pajama_product_stock")
            .update({ stock: Math.max(0, stockRow.stock - it.qty) })
            .eq("product_id", it.pajama_product_id)
            .eq("size", it.size);
        }
        continue;
      }
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
        product_type: data.product_type,
        ...(data.status ? { status: data.status } : {}),
      })
      .eq("id", data.order_id);
    if (uErr) throw new Error("অর্ডার আপডেট হয়নি।");

    // পুরনো পণ্যের স্টক ফেরত দিয়ে নতুন তালিকা বসানো হয়
    const { data: oldItems } = await supabaseAdmin
      .from("order_items")
      .select("variant_id, pajama_product_id, size, qty")
      .eq("order_id", data.order_id);

    for (const it of oldItems ?? []) {
      if (it.pajama_product_id) {
        const { data: stockRow } = await supabaseAdmin
          .from("pajama_product_stock")
          .select("stock")
          .eq("product_id", it.pajama_product_id)
          .eq("size", it.size)
          .maybeSingle();
        if (stockRow) {
          await supabaseAdmin
            .from("pajama_product_stock")
            .update({ stock: stockRow.stock + it.qty })
            .eq("product_id", it.pajama_product_id)
            .eq("size", it.size);
        }
        continue;
      }
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
        pajama_product_id: it.pajama_product_id ?? null,
        size: it.size,
        color_name: it.color_name,
        qty: it.qty,
      })),
    );
    if (iErr) throw new Error("অর্ডারের পণ্য আপডেট হয়নি।");

    for (const it of data.items) {
      if (it.pajama_product_id) {
        const { data: stockRow } = await supabaseAdmin
          .from("pajama_product_stock")
          .select("stock")
          .eq("product_id", it.pajama_product_id)
          .eq("size", it.size)
          .maybeSingle();
        if (stockRow) {
          await supabaseAdmin
            .from("pajama_product_stock")
            .update({ stock: Math.max(0, stockRow.stock - it.qty) })
            .eq("product_id", it.pajama_product_id)
            .eq("size", it.size);
        }
        continue;
      }
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

/* ===================== অসম্পূর্ণ অর্ডার (Abandoned Cart) ===================== */

const cartSchema = z.object({
  session_key: z.string().trim().min(8).max(80),
  customer_name: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(20).optional().default(""),
  address: z.string().trim().max(400).optional().default(""),
  district: z.string().trim().max(60).optional().default(""),
  note: z.string().trim().max(300).optional().default(""),
  size: z.enum(["M", "L", "XL", "XXL"]),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        color_name: z.string().trim().max(60).optional().default(""),
        qty: z.number().int().min(1).max(5),
      }),
    )
    .max(5),
});

/** কাস্টমার সিলেক্ট/তথ্য দিলে অসম্পূর্ণ কার্ট সেভ হয় (অর্ডার না করলেও) */
export const saveAbandonedCart = createServerFn({ method: "POST" })
  .inputValidator((data) => cartSchema.parse(data))
  .handler(async ({ data }) => {
    if (!/^01[3-9]\d{8}$/.test(data.phone)) return { saved: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const total = Number((await getSetting(supabaseAdmin, "combo_price")) ?? 999) || 999;

    const { error } = await supabaseAdmin.from("abandoned_carts").upsert(
      {
        session_key: data.session_key,
        customer_name: data.customer_name || null,
        phone: data.phone,
        address: data.address || null,
        district: data.district || null,
        note: data.note || null,
        size: data.size,
        items: data.items,
        total_amount: total,
        customer_ip: clientIp() || null,
      },
      { onConflict: "session_key" },
    );
    if (error) return { saved: false };
    return { saved: true };
  });

/** অর্ডার সফল হলে কার্টটি "অর্ডার হয়েছে" হিসেবে চিহ্নিত করা */
export const markCartOrdered = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ session_key: z.string().trim().min(8).max(80) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("abandoned_carts").delete().eq("session_key", data.session_key);
    return { ok: true };
  });

/** অ্যাডমিন কল করে কনফার্ম করলে কার্ট থেকে সরাসরি অর্ডার তৈরি */
export const confirmAbandonedCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ cart_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cart, error } = await supabaseAdmin
      .from("abandoned_carts")
      .select("*")
      .eq("id", data.cart_id)
      .single();
    if (error || !cart) throw new Error("কার্ট পাওয়া যায়নি।");
    if (cart.order_id) throw new Error("এই কার্ট থেকে আগেই অর্ডার তৈরি হয়েছে।");
    if (!cart.phone || !cart.address) {
      throw new Error("মোবাইল ও ঠিকানা ছাড়া অর্ডার কনফার্ম করা যাবে না। আগে তথ্য এডিট করুন।");
    }

    const items = (cart.items as { variant_id: string; qty: number; color_name?: string }[]) ?? [];
    if (items.length === 0) throw new Error("কার্টে কোনো পণ্য নেই।");

    const ids = items.map((i) => i.variant_id);
    const { data: variants } = await supabaseAdmin
      .from("product_variants")
      .select("id, size, color_name, stock")
      .in("id", ids);

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_name: cart.customer_name || "কাস্টমার",
        phone: cart.phone,
        address: cart.address,
        district: cart.district,
        note: cart.note,
        total_amount: cart.total_amount || 999,
        delivery_charge: 0,
        status: "confirmed",
        customer_ip: cart.customer_ip,
      })
      .select("id, order_no")
      .single();
    if (oErr || !order) throw new Error("অর্ডার তৈরি হয়নি।");

    await supabaseAdmin.from("order_items").insert(
      items.map((it) => {
        const v = variants?.find((x) => x.id === it.variant_id);
        return {
          order_id: order.id,
          variant_id: v ? v.id : null,
          size: v?.size ?? cart.size ?? "M",
          color_name: v?.color_name ?? it.color_name ?? "—",
          qty: it.qty,
        };
      }),
    );

    for (const it of items) {
      const v = variants?.find((x) => x.id === it.variant_id);
      if (!v) continue;
      await supabaseAdmin
        .from("product_variants")
        .update({ stock: Math.max(0, v.stock - it.qty) })
        .eq("id", v.id);
    }

    await supabaseAdmin
      .from("abandoned_carts")
      .update({ status: "converted", order_id: order.id })
      .eq("id", cart.id);

    return { order_no: order.order_no };
  });
