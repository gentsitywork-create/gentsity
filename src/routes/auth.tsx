import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  // "reset" = পাসওয়ার্ড রিসেট লিংক থেকে এসেছে, "forgot" = ভুলে গেছেন ফর্ম দেখানো হচ্ছে
  const [mode, setMode] = useState<"login" | "forgot" | "reset">("login");

  // রিসেট লিংকে ক্লিক করে এলে সেশন থাকে → নতুন পাসওয়ার্ড সেট করার ফর্ম দেখাই
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setMode("reset");
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
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

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success("পাসওয়ার্ড বদলানোর লিংক ইমেইলে পাঠানো হয়েছে। ইনবক্স (বা স্প্যাম) দেখুন।");
      setMode("login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "লিংক পাঠানো যায়নি।");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষর দিন।");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await claim({}).catch(() => null);
      toast.success("পাসওয়ার্ড বদলেছে। এখন লগইন করুন।");
      await supabase.auth.signOut();
      setMode("login");
      setPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "পাসওয়ার্ড বদলানো যায়নি।");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {mode === "login" && (
        <form onSubmit={handleLogin} className="w-full max-w-sm rounded-xl border bg-card p-6">
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
          <button
            type="button"
            className="mt-3 w-full text-center text-sm text-muted-foreground underline"
            onClick={() => setMode("forgot")}
          >
            পাসওয়ার্ড ভুলে গেছেন?
          </button>
        </form>
      )}

      {mode === "forgot" && (
        <form onSubmit={handleForgot} className="w-full max-w-sm rounded-xl border bg-card p-6">
          <h1 className="font-display text-2xl font-extrabold text-primary">পাসওয়ার্ড ভুলে গেছেন?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            আপনার ইমেইল দিন — পাসওয়ার্ড বদলানোর লিংক ইমেইলে পাঠানো হবে।
          </p>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="forgot-email">ইমেইল</Label>
              <Input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" className="mt-5 w-full" disabled={busy}>
            {busy ? "পাঠানো হচ্ছে…" : "রিসেট লিংক পাঠান"}
          </Button>
          <button
            type="button"
            className="mt-3 w-full text-center text-sm text-muted-foreground underline"
            onClick={() => setMode("login")}
          >
            লগইনে ফিরে যান
          </button>
        </form>
      )}

      {mode === "reset" && (
        <form onSubmit={handleReset} className="w-full max-w-sm rounded-xl border bg-card p-6">
          <h1 className="font-display text-2xl font-extrabold text-primary">নতুন পাসওয়ার্ড সেট করুন</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            নতুন পাসওয়ার্ড দিন (কমপক্ষে ৬ অক্ষর)। সেট করার পর নতুন পাসওয়ার্ড দিয়ে লগইন করুন।
          </p>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="new-password">নতুন পাসওয়ার্ড</Label>
              <Input
                id="new-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" className="mt-5 w-full" disabled={busy}>
            {busy ? "সেট হচ্ছে…" : "পাসওয়ার্ড সেট করুন"}
          </Button>
        </form>
      )}
    </div>
  );
}
