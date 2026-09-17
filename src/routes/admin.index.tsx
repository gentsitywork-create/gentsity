import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { sendToCourier } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/")({
  component: AdminOrders,
});

const STATUS: Record<string, string> = {
  pending: "নতুন",
  confirmed: "কনফার্ম",
  shipped: "কুরিয়ারে",
  delivered: "ডেলিভারি হয়েছে",
  cancelled: "বাতিল",
};

type OrderRow = {
  id: string;
  order_no: number;
  customer_name: string;
  phone: string;
  address: string;
  district: string | null;
  note: string | null;
  total_amount: number;
  status: string;
  courier_consignment_id: string | null;
  courier_tracking_code: string | null;
  created_at: string;
  order_items: { size: string; color_name: string; qty: number }[];
};

function AdminOrders() {
  const qc = useQueryClient();
  const send = useServerFn(sendToCourier);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-orders", filter],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id, order_no, customer_name, phone, address, district, note, total_amount, status, courier_consignment_id, courier_tracking_code, created_at, order_items(size, color_name, qty)",
        )
        .order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) {
      toast.error("স্ট্যাটাস বদলানো যায়নি।");
      return;
    }
    toast.success("স্ট্যাটাস আপডেট হয়েছে।");
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const toCourier = async (id: string) => {
    setBusyId(id);
    try {
      const res = await send({ data: { order_id: id } });
      toast.success(`Steadfast এ পাঠানো হয়েছে (${res.consignment_id})`);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "কুরিয়ারে পাঠানো যায়নি।");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">অর্ডার ({orders.length})</h1>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">সব অর্ডার</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">লোড হচ্ছে…</p>
      ) : orders.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">এখনো কোনো অর্ডার নেই।</p>
      ) : (
        <div className="mt-5 grid gap-4">
          {orders.map((o) => (
            <div key={o.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">
                    #{o.order_no} — {o.customer_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {o.phone} · {new Date(o.created_at).toLocaleString("bn-BD")}
                  </p>
                  <p className="mt-1 text-sm">
                    {o.address}
                    {o.district ? `, ${o.district}` : ""}
                  </p>
                  {o.note && <p className="mt-1 text-sm text-muted-foreground">নোট: {o.note}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{o.total_amount} টাকা</p>
                  <p className="text-xs text-muted-foreground">ডেলিভারি ফ্রি</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {o.order_items.map((it, i) => (
                  <span key={i} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                    {it.size} · {it.color_name} × {it.qty}
                  </span>
                ))}
              </div>

              {o.courier_consignment_id && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Steadfast: {o.courier_consignment_id}
                  {o.courier_tracking_code ? ` · ট্র্যাকিং ${o.courier_tracking_code}` : ""}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => toCourier(o.id)}
                  disabled={busyId === o.id || Boolean(o.courier_consignment_id)}
                >
                  {o.courier_consignment_id
                    ? "কুরিয়ারে পাঠানো হয়েছে"
                    : busyId === o.id
                      ? "পাঠানো হচ্ছে…"
                      : "Steadfast এ পাঠাও"}
                </Button>
                <a
                  href={`tel:${o.phone}`}
                  className="rounded-md border px-3 py-2 text-sm font-medium"
                >
                  কল করুন
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
