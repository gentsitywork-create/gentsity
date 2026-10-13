/** Steadfast কুরিয়ার স্ট্যাটাস → ওয়েবসাইটের অর্ডার স্ট্যাটাস। */
export type CourierOrderStatus = "shipped" | "courier_pending" | "partial_delivered" | "delivered" | "cancelled";
export function mapCourierStatus(courierStatus: string): CourierOrderStatus {
  const s = courierStatus.toLowerCase();
  if (s.startsWith("partial_delivered")) return "partial_delivered";
  if (s.startsWith("delivered")) return "delivered";
  if (s.startsWith("cancelled") || s.includes("return")) return "cancelled";
  if (s === "in_review") return "shipped";
  return "courier_pending";
}

export async function applyCourierStatus(
  supabaseAdmin: any,
  match: { consignment_id?: string | undefined; invoice?: string | undefined },
  courierStatus: string,
) {
  let q = supabaseAdmin.from("orders").update({
    courier_status: courierStatus,
    status: mapCourierStatus(courierStatus),
  });
  if (match.consignment_id) q = q.eq("courier_consignment_id", match.consignment_id);
  else if (match.invoice && /^\d+$/.test(match.invoice)) q = q.eq("order_no", Number(match.invoice));
  else return 0;
  const { data } = await q.neq("status", "cancelled").select("id");
  return (data ?? []).length;
}

/** কুরিয়ারে থাকা সব অর্ডারের স্ট্যাটাস Steadfast থেকে এনে আপডেট করে। */
export async function syncSteadfastStatuses(supabaseAdmin: any) {
  const { data: rows } = await supabaseAdmin
    .from("settings")
    .select("key, value")
    .in("key", ["steadfast_api_key", "steadfast_secret_key"]);
  const map: Record<string, string> = {};
  (rows ?? []).forEach((r: any) => (map[r.key] = r.value ?? ""));
  const apiKey = map["steadfast_api_key"];
  const secretKey = map["steadfast_secret_key"];
  if (!apiKey || !secretKey) throw new Error("Steadfast API Key সেট করা নেই।");

  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, status, courier_consignment_id")
    .in("status", ["shipped", "courier_pending"])
    .not("courier_consignment_id", "is", null)
    .limit(300);

  let checked = 0;
  let updated = 0;
  for (const o of orders ?? []) {
    const cid = String(o.courier_consignment_id ?? "");
    if (!cid) continue;
    try {
      const res = await fetch(`https://portal.packzy.com/api/v1/status_by_cid/${encodeURIComponent(cid)}`, {
        headers: { "Api-Key": apiKey, "Secret-Key": secretKey, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        console.error(`Steadfast status failed [${res.status}]: ${await res.text()}`);
        continue;
      }
      const body = (await res.json()) as { delivery_status?: string };
      checked++;
      if (!body.delivery_status) continue;
      const status = mapCourierStatus(body.delivery_status);
      const prev = o.status;
      await supabaseAdmin
        .from("orders")
        .update({ courier_status: body.delivery_status, status })
        .eq("id", o.id);
      if (status !== prev) updated++;
    } catch (e) {
      console.error("Steadfast status error", e);
    }
  }
  return { checked, updated };
}
