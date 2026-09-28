import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "./admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/blocked")({
  component: BlockedIps,
});

type Row = { id: string; ip: string; reason: string | null; created_at: string };

function BlockedIps() {
  return (
    <AdminOnly>
      <BlockedIpsInner />
    </AdminOnly>
  );
}

function BlockedIpsInner() {
  const qc = useQueryClient();
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["blocked-ips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_ips")
        .select("id, ip, reason, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = ip.trim();
    if (!value) return;
    setBusy(true);
    const { error } = await supabase
      .from("blocked_ips")
      .insert({ ip: value, reason: reason.trim() || null });
    setBusy(false);
    if (error) {
      toast.error("যোগ করা যায়নি (হয়তো আগেই ব্লক করা আছে)।");
      return;
    }
    setIp("");
    setReason("");
    toast.success("আইপি ব্লক করা হয়েছে।");
    qc.invalidateQueries({ queryKey: ["blocked-ips"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("blocked_ips").delete().eq("id", id);
    if (error) {
      toast.error("আনব্লক করা যায়নি।");
      return;
    }
    toast.success("আনব্লক করা হয়েছে।");
    qc.invalidateQueries({ queryKey: ["blocked-ips"] });
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">আইপি ব্লক</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        ভুয়া কাস্টমারের আইপি এখানে যোগ করলে সে আর অর্ডার করতে পারবে না।
      </p>

      <form onSubmit={add} className="mt-5 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto]">
        <div className="grid gap-2">
          <Label htmlFor="ip">আইপি ঠিকানা</Label>
          <Input
            id="ip"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="যেমন: 103.108.12.45"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="reason">কারণ (ইচ্ছা হলে)</Label>
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="যেমন: বারবার ভুয়া অর্ডার"
          />
        </div>
        <Button type="submit" className="self-end" disabled={busy}>
          {busy ? "যোগ হচ্ছে…" : "ব্লক করুন"}
        </Button>
      </form>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">লোড হচ্ছে…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">এখনো কোনো আইপি ব্লক করা হয়নি।</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b bg-secondary/50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">আইপি</th>
                <th className="px-4 py-3 font-semibold">কারণ</th>
                <th className="px-4 py-3 font-semibold">তারিখ</th>
                <th className="px-4 py-3 text-right font-semibold">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-semibold">{r.ip}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.reason ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("bn-BD")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => remove(r.id)}>
                      আনব্লক
                    </Button>
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
