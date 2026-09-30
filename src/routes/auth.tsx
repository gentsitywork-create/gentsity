import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { claimAdmin } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "অ্যাডমিন লগইন — Gentsity" },
      { name: "description", content: "Gentsity স্টোরের অর্ডার ও স্টক ম্যানেজমেন্ট প্যানেলে ঢুকুন।" },
      { property: "og:title", content: "অ্যাডমিন লগইন — Gentsity" },
      { property: "og:description", content: "Gentsity ব্যাক-এন্ড প্যানেল।" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const claim = useServerFn(claimAdmin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      await claim({}).catch(() => null);
      toast.success("লগইন হয়েছে।");
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "লগইন করা যায়নি।");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={handle} className="w-full max-w-sm rounded-xl border bg-card p-6">
        <h1 className="font-display text-2xl font-extrabold text-primary">Gentsity</h1>
        <p className="mt-1 text-sm text-muted-foreground">অ্যাডমিন / স্টাফ প্যানেলে লগইন করুন</p>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">ইমেইল</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">পাসওয়ার্ড</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <Button type="submit" className="mt-5 w-full" disabled={busy}>
          {busy ? "অপেক্ষা করুন…" : "লগইন"}
        </Button>
      </form>
    </div>
  );
}
