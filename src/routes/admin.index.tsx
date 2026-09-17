import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { sendToCourier } from "@/lib/orders.functions";
import { OrderDialog, type EditableOrder } from "@/components/admin/OrderDialog";
import { printCourierLabels } from "@/components/admin/printLabels";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  shipped: "bg-violet-100 text-violet-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
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
  order_items: { variant_id: string | null; size: string; color_name: string; qty: number }[];
};

function AdminOrders() {
  const qc = useQueryClient();
  const send = useServerFn(sendToCourier);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<EditableOrder | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_no, customer_name, phone, address, district, note, total_amount, status, courier_consignment_id, courier_tracking_code, created_at, order_items(variant_id, size, color_name, qty)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const dateFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const d = new Date(o.created_at);
      if (from && d < new Date(`${from}T00:00:00`)) return false;
      if (to && d > new Date(`${to}T23:59:59`)) return false;
      if (
        q &&
        !(
          o.customer_name.toLowerCase().includes(q) ||
          o.phone.includes(q) ||
          String(o.order_no).includes(q)
        )
      )
        return false;
      return true;
    });
  }, [orders, search, from, to]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: dateFiltered.length };
    for (const k of Object.keys(STATUS)) c[k] = 0;
    for (const o of dateFiltered) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [dateFiltered]);

  const rows = useMemo(
    () => (filter === "all" ? dateFiltered : dateFiltered.filter((o) => o.status === filter)),
    [dateFiltered, filter],
  );

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

  const selectedRows = useMemo(
    () => rows.filter((o) => selected.includes(o.id)),
    [rows, selected],
  );

  const toggleOne = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const allChecked = rows.length > 0 && rows.every((o) => selected.includes(o.id));
  const toggleAll = () => setSelected(allChecked ? [] : rows.map((o) => o.id));

  const bulkStatus = async (status: string) => {
    setBulkBusy(true);
    const { error } = await supabase.from("orders").update({ status }).in("id", selected);
    setBulkBusy(false);
    if (error) {
      toast.error("স্ট্যাটাস বদলানো যায়নি।");
      return;
    }
    toast.success(`${selected.length}টি অর্ডারের স্ট্যাটাস আপডেট হয়েছে।`);
    setSelected([]);
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const bulkCourier = async () => {
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const o of selectedRows) {
      if (o.courier_consignment_id) continue;
      try {
        await send({ data: { order_id: o.id } });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
    if (ok) toast.success(`${ok}টি অর্ডার Steadfast এ পাঠানো হয়েছে।`);
    if (fail) toast.error(`${fail}টি অর্ডার পাঠানো যায়নি।`);
  };

  const printLabels = async (list: OrderRow[]) => {
    if (list.length === 0) {
      toast.error("আগে অর্ডার সিলেক্ট করুন।");
      return;
    }
    await printCourierLabels(list);
  };

  const exportCsv = () => {
    const head = ["অর্ডার", "নাম", "মোবাইল", "ঠিকানা", "জেলা", "পণ্য", "টাকা", "স্ট্যাটাস", "তারিখ"];
    const lines = rows.map((o) =>
      [
        o.order_no,
        o.customer_name,
        o.phone,
        o.address,
        o.district ?? "",
        o.order_items.map((i) => `${i.size}-${i.color_name}x${i.qty}`).join(" | "),
        o.total_amount,
        STATUS[o.status] ?? o.status,
        new Date(o.created_at).toLocaleString("bn-BD"),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">অর্ডার ম্যানেজমেন্ট</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            অর্ডার দেখুন, স্ট্যাটাস বদলান ও কুরিয়ারে পাঠান।
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setEditOrder(null);
              setDialogOpen(true);
            }}
          >
            + ম্যানুয়াল অর্ডার
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            ⬇ এক্সপোর্ট
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="নাম, মোবাইল বা অর্ডার নম্বর খুঁজুন…"
          className="w-full sm:w-80"
        />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
          <span className="text-sm text-muted-foreground">থেকে</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", ...Object.keys(STATUS)] as string[]).map((k) => {
          const active = filter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-secondary"
              }`}
            >
              {k === "all" ? "সব" : STATUS[k]}
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs ${
                  active ? "bg-primary-foreground/20" : "bg-secondary"
                }`}
              >
                {counts[k] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">লোড হচ্ছে…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">কোনো অর্ডার পাওয়া যায়নি।</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="border-b bg-secondary/50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">অর্ডার তথ্য</th>
                <th className="px-4 py-3 font-semibold">পণ্য</th>
                <th className="px-4 py-3 font-semibold">মোট</th>
                <th className="px-4 py-3 font-semibold">স্ট্যাটাস</th>
                <th className="px-4 py-3 text-right font-semibold">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-4">
                    <p className="font-bold text-primary">#{o.order_no}</p>
                    <p className="font-semibold">{o.customer_name}</p>
                    <a href={`tel:${o.phone}`} className="text-muted-foreground underline">
                      {o.phone}
                    </a>
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      {o.address}
                      {o.district ? `, ${o.district}` : ""}
                    </p>
                    {o.note && (
                      <p className="mt-1 text-xs text-muted-foreground">নোট: {o.note}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("bn-BD")}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {o.order_items.map((it, i) => (
                        <span
                          key={i}
                          className="rounded-full border bg-secondary/60 px-2 py-1 text-xs font-medium"
                        >
                          {it.color_name} ({it.size}) ×{it.qty}
                        </span>
                      ))}
                    </div>
                    {o.courier_consignment_id && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Steadfast: {o.courier_consignment_id}
                        {o.courier_tracking_code ? ` · ${o.courier_tracking_code}` : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-bold">৳{o.total_amount}</p>
                    <p className="text-xs text-muted-foreground">ক্যাশ অন ডেলিভারি</p>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${
                        STATUS_CLASS[o.status] ?? "bg-secondary"
                      }`}
                    >
                      {STATUS[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-end gap-2">
                      <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                        <SelectTrigger className="w-40">
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
                        className="w-40"
                        onClick={() => toCourier(o.id)}
                        disabled={busyId === o.id || Boolean(o.courier_consignment_id)}
                      >
                        {o.courier_consignment_id
                          ? "কুরিয়ারে পাঠানো"
                          : busyId === o.id
                            ? "পাঠানো হচ্ছে…"
                            : "Steadfast এ পাঠাও"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
