import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { orderPage } from "@/lib/admin-order-pages";
import { toast } from "sonner";
import { Users, ShoppingBag, ShoppingCart, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { sendToCourier, checkCourierRatio, refreshCourierStatuses } from "@/lib/orders.functions";
import { useAdminSession } from "@/hooks/useAdminSession";
import { sourceLabel } from "@/lib/traffic-source";
import { OrderDialog, type EditableOrder } from "@/components/admin/OrderDialog";
import { printCourierLabels } from "@/components/admin/printLabels";
import { toBn } from "@/components/LiveVisitors";
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
  head: () => ({ meta: [{ title: "অর্ডার — Gentsity" }, { name: "description", content: "Gentsity — অর্ডার ব্যবস্থাপনা।" }, { property: "og:title", content: "অর্ডার — Gentsity" }, { property: "og:description", content: "Gentsity — অর্ডার ব্যবস্থাপনা।" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }), 
  component: AdminOrders,
});

const STATUS: Record<string, string> = {
  pending: "নতুন",
  confirmed: "কনফার্ম",
  hold: "হোল্ড",
  shipped: "In Review",
  courier_pending: "Pending (কুরিয়ার)",
  partial_delivered: "Partial Delivered",
  delivered: "ডেলিভারি হয়েছে",
  cancelled: "বাতিল",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "admin-status text-admin-warning",
  confirmed: "admin-status text-admin-info",
  hold: "admin-status text-admin-neutral",
  shipped: "admin-status text-admin-review",
  courier_pending: "admin-status text-admin-orange",
  partial_delivered: "admin-status text-admin-teal",
  delivered: "admin-status text-admin-success",
  cancelled: "admin-status text-admin-danger",
};

const LIVE_PATHS: Record<string, string> = {
  "/": "পোলো শার্ট",
  "/pajama": "পায়জামা",
  "/sneakers": "স্নিকার্স",
  "/sweatshirt": "সোয়েটশার্ট",
  "/hoodie-combo": "হুডি কম্বো",
  "/sweatshirt-combo": "সোয়েটশার্ট কম্বো",
  "/auth": "লগইন পেজ",
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
  source: string | null;
  label_printed_at: string | null;
  created_at: string;
  order_items: { variant_id: string | null; pajama_product_id: string | null; size: string; color_name: string; qty: number }[];
};

type OrderSummary = Pick<OrderRow, "id" | "order_no" | "customer_name" | "phone" | "total_amount" | "status" | "courier_consignment_id" | "source" | "label_printed_at" | "created_at">;
const ORDER_DETAILS = "id, order_no, customer_name, phone, address, district, note, total_amount, status, courier_consignment_id, courier_tracking_code, customer_ip, product_type, source, label_printed_at, created_at, order_items(variant_id, pajama_product_id, size, color_name, qty)";

async function loadOrderDetails(ids: string[]) {
  const all: OrderRow[] = [];
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await supabase.from("orders").select(ORDER_DETAILS).in("id", ids.slice(start, start + 100));
    if (error) throw error;
    all.push(...((data ?? []) as OrderRow[]));
  }
  const byId = new Map(all.map((order) => [order.id, order]));
  return ids.flatMap((id) => { const order = byId.get(id); return order ? [order] : []; });
}

function AdminOrders() {
  const qc = useQueryClient();
  const { session, isAdmin } = useAdminSession();
  const send = useServerFn(sendToCourier);
  const refreshStatus = useServerFn(refreshCourierStatuses);
  const [syncing, setSyncing] = useState(false);
  const checkRatio = useServerFn(checkCourierRatio);
  const [ratioBusy, setRatioBusy] = useState<string | null>(null);
  const [ratios, setRatios] = useState<
    Record<string, { total: number; success: number; cancelled: number; ratio: number }>
  >({});
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<EditableOrder | null>(null);

  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-orders"],
    enabled: Boolean(session),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const all: OrderSummary[] = [];
      const PAGE = 1000;
      for (let start = 0; ; start += PAGE) {
        const { data, error } = await supabase
          .from("orders")
          .select(
            "id, order_no, customer_name, phone, total_amount, status, courier_consignment_id, source, label_printed_at, created_at",
          )
          .order("created_at", { ascending: false })
          .order("id")
          .range(start, start + PAGE - 1);
        if (error) throw error;
        all.push(...((data ?? []) as OrderSummary[]));
        if (!data || data.length < PAGE) break;
      }
      return all;
    },
  });

  const { data: todaySummary } = useQuery({
    queryKey: ["today-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_summary_v1");
      if (error) throw error;
      return data as { visitors: number; orders: number; sales: number; left: number; byPath: Record<string, number>; liveByPath: Record<string, number> } | null;
    },
    enabled: Boolean(session),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  const liveByPath = todaySummary?.liveByPath ?? {};
  const liveVisitorCount = Object.values(liveByPath).reduce((sum, count) => sum + count, 0);

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

  /** কুরিয়ারে পাঠানো হয়েছে কিন্তু লেবেল এখনো প্রিন্ট হয়নি এমন অর্ডার */
  const isLabelPending = (o: OrderSummary) =>
    Boolean(o.courier_consignment_id) && !o.label_printed_at && o.status !== "cancelled";

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: dateFiltered.length };
    for (const k of Object.keys(STATUS)) c[k] = 0;
    c["label_pending"] = 0;
    for (const o of dateFiltered) {
      c[o.status] = (c[o.status] ?? 0) + 1;
      if (isLabelPending(o)) c["label_pending"]++;
    }
    return c;
  }, [dateFiltered]);

  const rows = useMemo(() => {
    if (filter === "all") return dateFiltered;
    if (filter === "label_pending") return dateFiltered.filter(isLabelPending);
    return dateFiltered.filter((o) => o.status === filter);
  }, [dateFiltered, filter]);

  const pagination = orderPage(rows, page);
  const pageIds = pagination.rows.map((order) => order.id);
  const { data: visibleOrders = [], isPending: detailsPending, isError: detailsError, refetch: refetchDetails } = useQuery({
    queryKey: ["admin-orders", "details", pageIds],
    queryFn: () => loadOrderDetails(pageIds),
    enabled: Boolean(session) && pageIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const selectedIds = useMemo(() => new Set(selected), [selected]);

  /** বর্তমান ফিল্টারের অর্ডারগুলোর মোট টাকার পরিমাণ */
  const totalAmount = useMemo(
    () => rows.reduce((sum, o) => sum + (o.total_amount ?? 0), 0),
    [rows],
  );

  /** আজকের অর্ডারগুলো কোন সোর্স (ফেসবুক/টিকটক/ইউটিউব…) থেকে এসেছে */
  const todayBySource = useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const map: Record<string, number> = {};
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      if (new Date(o.created_at) < dayStart) continue;
      const s = o.source || "direct";
      map[s] = (map[s] ?? 0) + 1;
    }
    return map;
  }, [orders]);

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

  const deleteOrders = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length}টি অর্ডার স্থায়ীভাবে ডিলিট করবেন?`)) return;
    setBulkBusy(true);
    await supabase.from("abandoned_carts").update({ order_id: null }).in("order_id", ids);
    const r1 = await supabase.from("order_items").delete().in("order_id", ids);
    const r2 = r1.error ? r1 : await supabase.from("orders").delete().in("id", ids);
    setBulkBusy(false);
    if (r2.error) {
      toast.error("ডিলিট করা যায়নি।");
      return;
    }
    toast.success(`${ids.length}টি অর্ডার ডিলিট হয়েছে।`);
    setSelected((p) => p.filter((x) => !ids.includes(x)));
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

  const printLabels = async (list: OrderSummary[]) => {
    if (list.length === 0) {
      toast.error("আগে অর্ডার সিলেক্ট করুন।");
      return;
    }
    await printCourierLabels(await loadOrderDetails(list.map((order) => order.id)));
    // প্রিন্ট হয়ে গেছে মার্ক করি — পরে "লেবেল বাকি" ফিল্টারে আর দেখাবে না
    const { error } = await supabase
      .from("orders")
      .update({ label_printed_at: new Date().toISOString() })
      .in("id", list.map((o) => o.id));
    if (!error) qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
    const exportRows = await loadOrderDetails(rows.map((order) => order.id));
    const head = ["অর্ডার", "নাম", "মোবাইল", "ঠিকানা", "জেলা", "পণ্য", "টাকা", "স্ট্যাটাস", "সোর্স", "তারিখ"];
    const lines = exportRows.map((o) =>
      [
        o.order_no,
        o.customer_name,
        o.phone,
        o.address,
        o.district ?? "",
        o.order_items.map((i) => `${i.size}-${i.color_name}x${i.qty}`).join(" | "),
        o.total_amount,
        STATUS[o.status] ?? o.status,
        sourceLabel(o.source),
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
    } catch { toast.error("এক্সপোর্ট করা যায়নি। আবার চেষ্টা করুন।"); }
    finally { setExporting(false); }
  };

  return (
    <div>
      {/* হেডার */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary">
            অর্ডার ম্যানেজমেন্ট
          </h1>
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
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0 || exporting}>
            {exporting ? "এক্সপোর্ট হচ্ছে…" : "⬇ এক্সপোর্ট"}
          </Button>
          <Button
            variant="outline"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                const r = await refreshStatus();
                toast.success(`${r.checked}টি চেক হয়েছে, ${r.updated}টির স্ট্যাটাস বদলেছে।`);
                qc.invalidateQueries({ queryKey: ["admin-orders"] });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "স্ট্যাটাস আপডেট হয়নি।");
              } finally {
                setSyncing(false);
              }
            }}
          >
            {syncing ? "আপডেট হচ্ছে…" : "🔄 কুরিয়ার স্ট্যাটাস"}
          </Button>
        </div>
      </div>

      {/* আজকের সামারি */}
      {todaySummary && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="admin-metric p-4 text-admin-info">
            <Users className="mb-3 size-5" aria-hidden="true" />
            <p className="text-2xl font-extrabold">{toBn(todaySummary.visitors)}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">আজকের ভিজিটর</p>
          </div>
          <div className="admin-metric p-4 text-admin-success">
            <ShoppingBag className="mb-3 size-5" aria-hidden="true" />
            <p className="text-2xl font-extrabold">{toBn(todaySummary.orders)}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">আজকের অর্ডার</p>
          </div>
          <div className="admin-metric p-4 text-admin-warning">
            <ShoppingCart className="mb-3 size-5" aria-hidden="true" />
            <p className="text-2xl font-extrabold">{toBn(todaySummary.left)}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">অর্ডার না করে চলে গেছে</p>
          </div>
          <div className="admin-metric p-4 text-admin-review">
            <Wallet className="mb-3 size-5" aria-hidden="true" />
            <p className="break-words text-2xl font-extrabold">৳{toBn(todaySummary.sales)}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">আজকের বিক্রি</p>
          </div>
        </div>
      )}

      {/* আজকের পেজ-ভিত্তিক ভিজিটর */}
      {todaySummary && Object.keys(todaySummary.byPath).length > 0 && (
        <div className="admin-band mt-3">
          <h3 className="text-sm font-bold text-primary">আজকের ভিজিটর — কোন পেজে কত জন</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(todaySummary.byPath)
              .sort((a, b) => b[1] - a[1])
              .map(([path, n]) => (
                <span
                  key={path}
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground"
                >
                  {LIVE_PATHS[path] ?? path}: {toBn(n)} জন
                </span>
              ))}
          </div>
        </div>
      )}

      {/* আজকের অর্ডার কোন বিজ্ঞাপন/সোর্স থেকে */}
      {Object.keys(todayBySource).length > 0 && (
        <div className="admin-band mt-3">
          <h3 className="text-sm font-bold text-primary">আজকের অর্ডার — কোথা থেকে এসেছে</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(todayBySource)
              .sort((a, b) => b[1] - a[1])
              .map(([s, n]) => (
                <span
                  key={s}
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground"
                >
                  {sourceLabel(s)}: {toBn(n)}টি
                </span>
              ))}
          </div>
        </div>
      )}

      {/* লাইভ ভিজিটর */}
      {liveVisitorCount > 0 && (
        <div className="admin-band mt-5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-admin-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-admin-success" />
            </span>
            <h2 className="text-sm font-bold text-primary">
              এখন {toBn(liveVisitorCount)} জন ভিজিটর লাইভ
            </h2>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(liveByPath).map(([path, n]) => (
              <span
                key={path}
                className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground"
              >
                {LIVE_PATHS[path] ?? path}: {toBn(n)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* সার্চ ও তারিখ */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="নাম, মোবাইল বা অর্ডার নম্বর খুঁজুন…"
          className="w-full bg-card sm:w-96"
        />
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:w-auto">
          <Input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="min-w-0 w-full bg-card sm:w-40"
          />
          <span className="text-sm text-muted-foreground">থেকে</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="min-w-0 w-full bg-card sm:w-40"
          />
        </div>
      </div>

      {/* স্ট্যাটাস ট্যাব */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", ...Object.keys(STATUS), "label_pending"] as string[]).map((k) => {
          const active = filter === k;
          return (
            <Button
              key={k}
              type="button"
              variant="outline"
              aria-pressed={active}
              onClick={() => { setFilter(k); setPage(1); }}
              className={`admin-status-tab gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${STATUS_CLASS[k] ?? "text-primary"}`}
            >
              {k === "all" ? "সব" : k === "label_pending" ? "🖨 লেবেল বাকি" : STATUS[k]}
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
                  "bg-card/70"
                }`}
              >
                {counts[k] ?? 0}
              </span>
            </Button>
          );
        })}
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary shadow-sm">
          মোট: ৳{new Intl.NumberFormat("bn-BD").format(totalAmount)}
        </div>
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
            {isAdmin && (
              <Button size="sm" variant="destructive" onClick={() => deleteOrders(selected)} disabled={bulkBusy}>
                🗑 ডিলিট
              </Button>
            )}
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
      {isError || detailsError ? (
        <div role="alert" className="mt-6 flex items-center gap-3 text-sm text-destructive">
          অর্ডার লোড করা যায়নি।
          <Button variant="outline" onClick={() => { void refetch(); void refetchDetails(); }}>আবার চেষ্টা করুন</Button>
        </div>
      ) : isLoading || (rows.length > 0 && detailsPending) ? (
        <p className="mt-6 text-sm text-muted-foreground">লোড হচ্ছে…</p>
      ) : rows.length === 0 ? (
        <div className="mt-5 rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          কোনো অর্ডার পাওয়া যায়নি।
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-lg border bg-card shadow-sm">
          {/* টেবিল হেড */}
          <div className="hidden items-center gap-4 border-b bg-secondary px-4 py-3 text-xs font-bold text-secondary-foreground xl:grid xl:grid-cols-[28px_minmax(0,1.3fr)_minmax(0,1fr)_70px_90px_110px_150px]">
            <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
            <span>অর্ডার তথ্য</span>
            <span>পণ্য</span>
            <span>মোট</span>
            <span>পেমেন্ট</span>
            <span>স্ট্যাটাস</span>
            <span className="text-right">অ্যাকশন</span>
          </div>

          {visibleOrders.map((o) => {
            const isSel = selectedIds.has(o.id);
            return (
              <div
                key={o.id}
                className={`admin-order-row admin-row-${o.status} grid gap-3 border-b px-4 py-4 last:border-b-0 transition xl:grid-cols-[28px_minmax(0,1.3fr)_minmax(0,1fr)_70px_90px_110px_150px] xl:items-start xl:gap-4 ${
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
                    {(o.product_type === "polo" || !o.product_type) && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        পোলো শার্ট
                      </span>
                    )}
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
                    {o.product_type === "sweatshirt" && (
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800">
                        সোয়েটশার্ট
                      </span>
                    )}
                    {o.product_type === "hoodie_combo" && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">হুডি কম্বো</span>
                    )}
                    {o.product_type === "sweatshirt_combo" && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">সোয়েটশার্ট কম্বো</span>
                    )}
                    {o.source && o.source !== "direct" && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">
                        {sourceLabel(o.source)}
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
                    {o.label_printed_at && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">
                        🖨 প্রিন্ট হয়েছে
                      </span>
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
                        (ratios[o.id]?.ratio ?? 0) >= 70
                          ? "text-emerald-600"
                          : (ratios[o.id]?.ratio ?? 0) >= 40
                            ? "text-amber-600"
                            : "text-rose-600"
                      }`}
                    >
                      {ratios[o.id]?.ratio}% Success · মোট {ratios[o.id]?.total} · বাতিল{" "}
                      {ratios[o.id]?.cancelled}
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
                      (o.status === "delivered" || o.status === "partial_delivered")
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {(o.status === "delivered" || o.status === "partial_delivered") ? "Paid" : "Pending"}
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
                <div className="flex flex-wrap gap-1.5 xl:justify-end">
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
                  {isAdmin && (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs"
                        onClick={() => deleteOrders([o.id])}
                      >
                        🗑 ডিলিট
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
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <nav aria-label="অর্ডার তালিকার পৃষ্ঠা" className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {toBn(pagination.offset + 1)}–{toBn(Math.min(pagination.offset + 50, rows.length))} / {toBn(rows.length)} অর্ডার
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={pagination.page === 1} onClick={() => setPage(pagination.page - 1)}>আগের</Button>
            <span className="text-sm">{toBn(pagination.page)} / {toBn(pagination.pageCount)}</span>
            <Button variant="outline" disabled={pagination.page === pagination.pageCount} onClick={() => setPage(pagination.page + 1)}>পরের</Button>
          </div>
        </nav>
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
