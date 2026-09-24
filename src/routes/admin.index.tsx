import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { sendToCourier, checkCourierRatio } from "@/lib/orders.functions";
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
  hold: "হোল্ড",
  shipped: "কুরিয়ারে",
  delivered: "ডেলিভারি হয়েছে",
  cancelled: "বাতিল",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  hold: "bg-slate-200 text-slate-800",
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
  customer_ip: string | null;
  product_type: string;
  created_at: string;
  order_items: { variant_id: string | null; pajama_product_id: string | null; size: string; color_name: string; qty: number }[];
};

function AdminOrders() {
  const qc = useQueryClient();
  const send = useServerFn(sendToCourier);
  const checkRatio = useServerFn(checkCourierRatio);
  const [ratioBusy, setRatioBusy] = useState<string | null>(null);
  const [ratios, setRatios] = useState<
    Record<string, { total: number; success: number; cancelled: number; ratio: number }>
  >({});
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
          "id, order_no, customer_name, phone, address, district, note, total_amount, status, courier_consignment_id, courier_tracking_code, customer_ip, product_type, created_at, order_items(variant_id, pajama_product_id, size, color_name, qty)",
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

  /** একই মোবাইল নম্বরে কতগুলো অর্ডার আছে — ডুপ্লিকেট ইন্ডিকেটরের জন্য */
  const phoneCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      map[o.phone] = (map[o.phone] ?? 0) + 1;
    }
    return map;
  }, [orders]);

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

  const runRatio = async (id: string, phone: string) => {
    setRatioBusy(id);
    try {
      const r = await checkRatio({ data: { phone } });
      setRatios((p) => ({
        ...p,
        [id]: { total: r.total, success: r.success, cancelled: r.cancelled, ratio: r.ratio },
      }));
      toast.success(`সাকসেস রেশিও ${r.ratio}% (মোট ${r.total}টি পার্সেল)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "রেশিও চেক করা যায়নি।");
    } finally {
      setRatioBusy(null);
    }
  };

  const blockIp = async (ip: string | null, name: string) => {
    if (!ip) {
      toast.error("এই অর্ডারে কাস্টমারের আইপি সেভ হয়নি।");
      return;
    }
    const { error } = await supabase
      .from("blocked_ips")
      .insert({ ip, reason: `ভুয়া অর্ডার — ${name}` });
    if (error) {
      toast.error("ব্লক করা যায়নি (হয়তো আগেই ব্লক করা আছে)।");
      return;
    }
    toast.success(`${ip} ব্লক করা হয়েছে।`);
    qc.invalidateQueries({ queryKey: ["blocked-ips"] });
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
      {/* হেডার */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-primary">
            অর্ডার ম্যানেজমেন্ট
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            অর্ডার রিভিউ, ফুলফিলমেন্ট ও ট্র্যাকিং — সব এক জায়গায়।
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="shadow-sm"
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

      {/* সার্চ ও তারিখ */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="নাম, মোবাইল বা অর্ডার নম্বর খুঁজুন…"
          className="w-full bg-card sm:w-96"
        />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40 bg-card"
          />
          <span className="text-sm text-muted-foreground">থেকে</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40 bg-card"
          />
        </div>
      </div>

      {/* স্ট্যাটাস ট্যাব */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", ...Object.keys(STATUS)] as string[]).map((k) => {
          const active = filter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-secondary"
              }`}
            >
              {k === "all" ? "সব" : STATUS[k]}
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
                  active ? "bg-primary-foreground/20" : "bg-secondary"
                }`}
              >
                {counts[k] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* বাল্ক অ্যাকশন বার */}
      {selected.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-md">
          <span className="text-sm font-bold">{selected.length}টি অর্ডার সিলেক্ট করা হয়েছে</span>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-sm font-medium underline underline-offset-2 opacity-90 hover:opacity-100"
          >
            সব বাদ দিন
          </button>
          <div className="ms-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => printLabels(selectedRows)}
            >
              🖨 লেবেল প্রিন্ট (QR)
            </Button>
            <Button size="sm" variant="secondary" onClick={bulkCourier} disabled={bulkBusy}>
              {bulkBusy ? "কাজ চলছে…" : "🚚 Steadfast এ পাঠাও"}
            </Button>
            <Select onValueChange={bulkStatus}>
              <SelectTrigger className="h-9 w-40 border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground">
                <SelectValue placeholder="স্ট্যাটাস বদলান" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* অর্ডার তালিকা */}
      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">লোড হচ্ছে…</p>
      ) : rows.length === 0 ? (
        <div className="mt-5 rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          কোনো অর্ডার পাওয়া যায়নি।
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border bg-card shadow-sm">
          {/* টেবিল হেড */}
          <div className="hidden items-center gap-4 border-b bg-secondary/40 px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground lg:grid lg:grid-cols-[28px_minmax(240px,1.3fr)_minmax(200px,1fr)_90px_110px_110px_180px]">
            <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
            <span>অর্ডার তথ্য</span>
            <span>পণ্য</span>
            <span>মোট</span>
            <span>পেমেন্ট</span>
            <span>স্ট্যাটাস</span>
            <span className="text-right">অ্যাকশন</span>
          </div>

          {rows.map((o) => {
            const isSel = selected.includes(o.id);
            return (
              <div
                key={o.id}
                className={`grid gap-3 border-b px-4 py-4 last:border-0 transition lg:grid-cols-[28px_minmax(240px,1.3fr)_minmax(200px,1fr)_90px_110px_110px_180px] lg:items-start lg:gap-4 ${
                  isSel ? "bg-primary/5" : "hover:bg-secondary/30"
                }`}
              >
                <div className="pt-1">
                  <Checkbox checked={isSel} onCheckedChange={() => toggleOne(o.id)} />
                </div>

                {/* অর্ডার তথ্য */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-extrabold text-primary">#{o.order_no}</p>
                    {o.product_type === "pajama" && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
                        পায়জামা
                      </span>
                    )}
                    {o.product_type === "sneakers" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                        স্নিকার্স
                      </span>
                    )}
                    {(phoneCount[o.phone] ?? 0) > 1 && (
                      <button
                        type="button"
                        onClick={() => setSearch(o.phone)}
                        title="এই নম্বরে একাধিক অর্ডার আছে — ক্লিক করে সব দেখুন"
                        className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive"
                      >
                        ⚠ ডুপ্লিকেট ({phoneCount[o.phone]})
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 font-bold">{o.customer_name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <a href={`tel:${o.phone}`} className="font-medium hover:underline">
                      {o.phone}
                    </a>
                    <a
                      href={`https://wa.me/88${o.phone}`}
                      target="_blank"
                      rel="noreferrer"
                      title="WhatsApp এ মেসেজ করুন"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-white"
                    >
                      W
                    </a>
                  </div>
                  {ratios[o.id] ? (
                    <p
                      className={`mt-1 text-xs font-bold ${
                        ratios[o.id]!.ratio >= 70
                          ? "text-emerald-600"
                          : ratios[o.id]!.ratio >= 40
                            ? "text-amber-600"
                            : "text-rose-600"
                      }`}
                    >
                      {ratios[o.id]!.ratio}% Success · মোট {ratios[o.id]!.total} · বাতিল{" "}
                      {ratios[o.id]!.cancelled}
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={ratioBusy === o.id}
                      onClick={() => runRatio(o.id, o.phone)}
                      className="mt-1 text-xs font-semibold text-primary underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
                    >
                      {ratioBusy === o.id ? "রেশিও চেক হচ্ছে…" : "রেশিও চেক করুন"}
                    </button>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {o.address}
                    {o.district ? `, ${o.district}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("bn-BD", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {o.customer_ip ? ` · আইপি: ${o.customer_ip}` : ""}
                  </p>
                  {o.note && (
                    <p className="mt-1.5 inline-block rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                      নোট: {o.note}
                    </p>
                  )}
                </div>

                {/* পণ্য */}
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1">
                    {o.order_items.map((it, i) => (
                      <span
                        key={i}
                        className="rounded-md border bg-secondary/60 px-2 py-0.5 text-xs font-medium"
                      >
                        {it.color_name} ({it.size}) ×{it.qty}
                      </span>
                    ))}
                  </div>
                  {o.courier_consignment_id && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Steadfast: {o.courier_consignment_id}
                      {o.courier_tracking_code ? ` · ${o.courier_tracking_code}` : ""}
                    </p>
                  )}
                </div>

                {/* মোট */}
                <p className="pt-0.5 text-base font-extrabold">৳{o.total_amount}</p>

                {/* পেমেন্ট */}
                <div>
                  <span
                    className={`inline-block rounded-md px-2 py-1 text-xs font-bold ${
                      o.status === "delivered"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {o.status === "delivered" ? "Paid" : "Pending"}
                  </span>
                  <p className="mt-1 text-[11px] text-muted-foreground">ক্যাশ অন ডেলিভারি</p>
                </div>

                {/* স্ট্যাটাস */}
                <div>
                  <span
                    className={`inline-block rounded-md px-2 py-1 text-xs font-bold ${
                      STATUS_CLASS[o.status] ?? "bg-secondary"
                    }`}
                  >
                    {STATUS[o.status] ?? o.status}
                  </span>
                  <div className="mt-2">
                    <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                      <SelectTrigger className="h-8 w-28 text-xs">
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
                  </div>
                </div>

                {/* অ্যাকশন */}
                <div className="flex flex-wrap gap-1.5 lg:justify-end">
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => toCourier(o.id)}
                    disabled={
                      busyId === o.id || Boolean(o.courier_consignment_id) || o.status === "hold"
                    }
                  >
                    {o.courier_consignment_id
                      ? "পাঠানো ✅"
                      : busyId === o.id
                        ? "পাঠানো হচ্ছে…"
                        : "🚚 Steadfast"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      setEditOrder(o as EditableOrder);
                      setDialogOpen(true);
                    }}
                  >
                    এডিট
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    title="কুরিয়ার লেবেল প্রিন্ট"
                    onClick={() => printLabels([o])}
                  >
                    🖨
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`h-8 text-xs ${
                      o.status === "hold" ? "bg-slate-200 font-semibold text-slate-800" : ""
                    }`}
                    title={o.status === "hold" ? "হোল্ড থেকে সরান" : "অর্ডার হোল্ড করুন"}
                    onClick={() => setStatus(o.id, o.status === "hold" ? "pending" : "hold")}
                  >
                    {o.status === "hold" ? "▶ হোল্ড সরান" : "⏸ হোল্ড"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-rose-600 hover:bg-rose-50"
                    title="এই কাস্টমারের আইপি ব্লক করুন"
                    onClick={() => blockIp(o.customer_ip, o.customer_name)}
                  >
                    আইপি ব্লক
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <OrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        order={editOrder}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["admin-orders"] });
          qc.invalidateQueries({ queryKey: ["admin-variants-all"] });
        }}
      />
    </div>
  );
}
