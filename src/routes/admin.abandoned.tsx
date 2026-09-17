import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Phone } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { confirmAbandonedCart } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/abandoned")({
  component: AbandonedCarts,
});

type CartItem = { variant_id: string; qty: number; color_name?: string };

type Cart = {
  id: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  district: string | null;
  note: string | null;
  size: string | null;
  items: CartItem[];
  total_amount: number;
  customer_ip: string | null;
  status: string;
  admin_note: string | null;
  order_id: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: "নতুন",
  called: "কল করা হয়েছে",
  converted: "অর্ডার হয়েছে",
  cancelled: "বাতিল",
};

const STATUS_CLASS: Record<string, string> = {
  new: "bg-amber-100 text-amber-800",
  called: "bg-blue-100 text-blue-800",
  converted: "bg-primary/15 text-primary",
  cancelled: "bg-destructive/10 text-destructive",
};

function AbandonedCarts() {
  const qc = useQueryClient();
  const confirmCart = useServerFn(confirmAbandonedCart);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: carts = [], isLoading } = useQuery({
    queryKey: ["abandoned-carts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("abandoned_carts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Cart[];
    },
  });

  const counts = carts.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const q = search.trim().toLowerCase();
  const rows = carts.filter((c) => {
    if (tab !== "all" && c.status !== tab) return false;
    if (!q) return true;
    return `${c.customer_name ?? ""} ${c.phone ?? ""} ${c.address ?? ""}`.toLowerCase().includes(q);
  });

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("abandoned_carts").update({ status }).eq("id", id);
    if (error) {
      toast.error("অবস্থা বদলানো যায়নি।");
      return;
    }
    qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
  };

  const saveNote = async (id: string, admin_note: string) => {
    await supabase.from("abandoned_carts").update({ admin_note }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("abandoned_carts").delete().eq("id", id);
    if (error) {
      toast.error("মুছে ফেলা যায়নি।");
      return;
    }
    qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
  };

  const confirm = async (id: string) => {
    setBusy(id);
    try {
      const res = await confirmCart({ data: { cart_id: id } });
      toast.success(`অর্ডার তৈরি হয়েছে — #${res.order_no}`);
      qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "কনফার্ম করা যায়নি।");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">অসম্পূর্ণ অর্ডার</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            যারা কালার ও মোবাইল নম্বর দিয়েছেন কিন্তু অর্ডার শেষ করেননি। কল দিয়ে কথা বলে এখান থেকেই
            অর্ডার কনফার্ম করুন।
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="নাম / মোবাইল / ঠিকানা খুঁজুন"
          className="w-full max-w-xs"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {[
          ["all", `সব (${carts.length})`],
          ["new", `নতুন (${counts["new"] ?? 0})`],
          ["called", `কল করা হয়েছে (${counts["called"] ?? 0})`],
          ["converted", `অর্ডার হয়েছে (${counts["converted"] ?? 0})`],
          ["cancelled", `বাতিল (${counts["cancelled"] ?? 0})`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key as string)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              tab === key ? "border-primary bg-primary text-primary-foreground" : "bg-card"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">লোড হচ্ছে…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">এখানে কোনো অসম্পূর্ণ অর্ডার নেই।</p>
      ) : (
        <div className="mt-5 grid gap-3">
          {rows.map((c) => {
            const qty = (c.items ?? []).reduce((s, i) => s + i.qty, 0);
            return (
              <div key={c.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {c.customer_name || "নাম দেয়নি"}{" "}
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          STATUS_CLASS[c.status] ?? "bg-secondary"
                        }`}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {c.phone ?? "—"} · সাইজ {c.size ?? "—"} · {qty} পিস · {c.total_amount} টাকা
                    </p>
                    <p className="text-sm text-muted-foreground">{c.address || "ঠিকানা দেয়নি"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("bn-BD")}
                      {c.customer_ip ? ` · IP: ${c.customer_ip}` : ""}
                    </p>
                    {(c.items ?? []).length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        কালার:{" "}
                        {(c.items ?? [])
                          .map((i) => `${i.color_name || "—"} × ${i.qty}`)
                          .join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm font-semibold"
                      >
                        <Phone className="h-4 w-4" /> কল
                      </a>
                    )}
                    <Button
                      size="sm"
                      onClick={() => confirm(c.id)}
                      disabled={busy === c.id || Boolean(c.order_id)}
                    >
                      {c.order_id
                        ? "অর্ডার হয়েছে"
                        : busy === c.id
                          ? "কনফার্ম হচ্ছে…"
                          : "অর্ডার কনফার্ম"}
                    </Button>
                    {c.status === "new" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "called")}>
                        কল করা হয়েছে
                      </Button>
                    )}
                    {c.status !== "converted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus(c.id, "cancelled")}
                      >
                        বাতিল
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                      মুছুন
                    </Button>
                  </div>
                </div>

                <Input
                  defaultValue={c.admin_note ?? ""}
                  placeholder="কলের নোট লিখুন (যেমন: ফোন ধরেনি)"
                  className="mt-3"
                  onBlur={(e) => {
                    if (e.target.value !== (c.admin_note ?? "")) saveNote(c.id, e.target.value);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
