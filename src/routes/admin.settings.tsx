import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { createStaff, listStaff, removeStaff } from "@/lib/orders.functions";
import { AdminOnly } from "./admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  return (
    <AdminOnly>
      <AdminSettingsInner />
    </AdminOnly>
  );
}

function AdminSettingsInner() {
  const [values, setValues] = useState({
    combo_price: "999",
    combo_qty: "6",
    fb_pixel_id: "",
    fb_access_token: "",
    steadfast_api_key: "",
    steadfast_secret_key: "",
    bdcourier_api_key: "",
    logo_path: "",
    pajama_delivery_charge_dhaka: "70",
    pajama_delivery_charge_outside: "120",
    polo_delivery_charge_dhaka: "80",
    polo_delivery_charge_outside: "150",
    sneakers_delivery_charge_dhaka: "80",
    sneakers_delivery_charge_outside: "130",
    whatsapp_number: "",
    whatsapp_message: "",
    free_delivery: "off",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("key, value");
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => (map[r.key] = r.value ?? ""));
      return map;
    },
  });

  useEffect(() => {
    if (data) {
      setValues({
        combo_price: data["combo_price"] ?? "999",
        combo_qty: data["combo_qty"] ?? "6",
        fb_pixel_id: data["fb_pixel_id"] ?? "",
        fb_access_token: data["fb_access_token"] ?? "",
        steadfast_api_key: data["steadfast_api_key"] ?? "",
        steadfast_secret_key: data["steadfast_secret_key"] ?? "",
        bdcourier_api_key: data["bdcourier_api_key"] ?? "",
        logo_path: data["logo_path"] ?? "",
        pajama_delivery_charge_dhaka: data["pajama_delivery_charge_dhaka"] ?? "70",
        pajama_delivery_charge_outside: data["pajama_delivery_charge_outside"] ?? "120",
        polo_delivery_charge_dhaka: data["polo_delivery_charge_dhaka"] ?? "80",
        polo_delivery_charge_outside: data["polo_delivery_charge_outside"] ?? "150",
        sneakers_delivery_charge_dhaka: data["sneakers_delivery_charge_dhaka"] ?? "80",
        sneakers_delivery_charge_outside: data["sneakers_delivery_charge_outside"] ?? "130",
        whatsapp_number: data["whatsapp_number"] ?? "",
        whatsapp_message: data["whatsapp_message"] ?? "",
        free_delivery: data["free_delivery"] ?? "off",
      });
    }
  }, [data]);

  const { data: logoUrl } = useQuery({
    queryKey: ["admin-logo-url", values.logo_path],
    enabled: Boolean(values.logo_path),
    queryFn: async () => {
      const { data } = await supabase.storage.from("products").createSignedUrl(values.logo_path, 3600);
      return data?.signedUrl ?? "";
    },
  });

  const handleLogoChange = async (file: File | null) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `site/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("products").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        toast.error("লোগো আপলোড হয়নি।");
        return;
      }
      setValues((prev) => ({ ...prev, logo_path: path }));
      toast.success("লোগো আপলোড হয়েছে। সেভ করতে ভুলবেন না।");
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = async () => {
    if (values.logo_path) {
      await supabase.storage.from("products").remove([values.logo_path]);
    }
    setValues((prev) => ({ ...prev, logo_path: "" }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const rows = Object.entries(values).map(([key, value]) => ({ key, value }));
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("সেভ হয়নি।");
      return;
    }
    toast.success("সেভ হয়েছে।");
  };

  return (
    <div className="grid max-w-lg gap-6">
    <form onSubmit={save} className="rounded-xl border bg-card p-5">
      <h1 className="text-lg font-bold">সেটিংস</h1>
      <div className="mt-4 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="price">কম্বো দাম (টাকা)</Label>
          <Input
            id="price"
            type="number"
            min={1}
            value={values.combo_price}
            onChange={(e) => setValues({ ...values, combo_price: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="qty">কত পিস কম্বো</Label>
          <Input
            id="qty"
            type="number"
            min={1}
            value={values.combo_qty}
            onChange={(e) => setValues({ ...values, combo_qty: e.target.value })}
          />
        </div>
        <div className="grid gap-2 rounded-lg border p-3">
          <h2 className="font-semibold">সব পেজে ফ্রি ডেলিভারি</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={values.free_delivery === "on" ? "default" : "outline"}
              className="flex-1 font-bold"
              onClick={() => setValues({ ...values, free_delivery: "on" })}
            >
              চালু
            </Button>
            <Button
              type="button"
              variant={values.free_delivery === "on" ? "outline" : "default"}
              className="flex-1 font-bold"
              onClick={() => setValues({ ...values, free_delivery: "off" })}
            >
              বন্ধ
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            চালু করলে পায়জামা ও স্নিকার্স পেজে ডেলিভারি চার্জ ০ হয়ে যাবে এবং কাস্টমার "ফ্রি ডেলিভারি" দেখবে। বন্ধ করলে নিচের চার্জগুলোই কার্যকর থাকবে।
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="poldelivery-dhaka">পোলো শার্টের ডেলিভারি চার্জ — ঢাকার ভিতরে (টাকা)</Label>
          <Input
            id="poldelivery-dhaka"
            type="number"
            min={0}
            value={values.polo_delivery_charge_dhaka}
            onChange={(e) => setValues({ ...values, polo_delivery_charge_dhaka: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="poldelivery-outside">পোলো শার্টের ডেলিভারি চার্জ — ঢাকার বাইরে (টাকা)</Label>
          <Input
            id="poldelivery-outside"
            type="number"
            min={0}
            value={values.polo_delivery_charge_outside}
            onChange={(e) => setValues({ ...values, polo_delivery_charge_outside: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pjdelivery-dhaka">পায়জামার ডেলিভারি চার্জ — ঢাকার ভিতরে (টাকা)</Label>
          <Input
            id="pjdelivery-dhaka"
            type="number"
            min={0}
            value={values.pajama_delivery_charge_dhaka}
            onChange={(e) => setValues({ ...values, pajama_delivery_charge_dhaka: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pjdelivery-outside">পায়জামার ডেলিভারি চার্জ — ঢাকার বাইরে (টাকা)</Label>
          <Input
            id="pjdelivery-outside"
            type="number"
            min={0}
            value={values.pajama_delivery_charge_outside}
            onChange={(e) => setValues({ ...values, pajama_delivery_charge_outside: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sndelivery-dhaka">স্নিকার্সের ডেলিভারি চার্জ — ঢাকার ভিতরে (টাকা)</Label>
          <Input
            id="sndelivery-dhaka"
            type="number"
            min={0}
            value={values.sneakers_delivery_charge_dhaka}
            onChange={(e) => setValues({ ...values, sneakers_delivery_charge_dhaka: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sndelivery-outside">স্নিকার্সের ডেলিভারি চার্জ — ঢাকার বাইরে (টাকা)</Label>
          <Input
            id="sndelivery-outside"
            type="number"
            min={0}
            value={values.sneakers_delivery_charge_outside}
            onChange={(e) => setValues({ ...values, sneakers_delivery_charge_outside: e.target.value })}
          />
        </div>
        <div className="grid gap-2 rounded-lg border p-3">
          <h2 className="font-semibold">WhatsApp চ্যাট বোতাম</h2>
          <Label htmlFor="wa-number">WhatsApp নম্বর</Label>
          <Input
            id="wa-number"
            value={values.whatsapp_number}
            onChange={(e) => setValues({ ...values, whatsapp_number: e.target.value })}
            placeholder="যেমন: 01712345678"
          />
          <Label htmlFor="wa-msg">শুরুর মেসেজ (ঐচ্ছিক)</Label>
          <Input
            id="wa-msg"
            value={values.whatsapp_message}
            onChange={(e) => setValues({ ...values, whatsapp_message: e.target.value })}
            placeholder="হ্যালো Gentsity, আমি একটি প্রোডাক্ট সম্পর্কে জানতে চাই।"
          />
          <p className="text-xs text-muted-foreground">
            নম্বর বসালে সব পেজের নিচে ডানদিকে সবুজ WhatsApp বোতাম দেখা যাবে। খালি রাখলে বোতাম লুকানো থাকবে।
          </p>
        </div>
        <div className="grid gap-2 rounded-lg border p-3">
          <h2 className="font-semibold">Facebook Pixel</h2>
          <Label htmlFor="pixel">Pixel ID</Label>
          <Input
            id="pixel"
            value={values.fb_pixel_id}
            onChange={(e) => setValues({ ...values, fb_pixel_id: e.target.value })}
            placeholder="যেমন: 1234567890"
          />
          <Label htmlFor="pixel-token">Conversions API Access Token</Label>
          <Input
            id="pixel-token"
            type="password"
            value={values.fb_access_token}
            onChange={(e) => setValues({ ...values, fb_access_token: e.target.value })}
            placeholder="Facebook Events Manager থেকে Access Token বসান"
          />
          <p className="text-xs text-muted-foreground">
            Pixel ID বসালেই ব্রাউজার পিক্সেল চালু হবে (PageView, ViewContent, Purchase)। Access Token বসালে অর্ডার হলে সার্ভার থেকেও Purchase ইভেন্ট যাবে (Conversions API) — iOS ব্লক করলেও ইভেন্ট হারাবে না। টোকেনটি গোপন থাকে, কাস্টমার দেখতে পায় না।
          </p>
        </div>

        <div className="grid gap-2 rounded-lg border p-3">
          <h2 className="font-semibold">Steadfast Courier API</h2>
          <div className="grid gap-2">
            <Label htmlFor="steadfast_api_key">API Key</Label>
            <Input
              id="steadfast_api_key"
              type="password"
              value={values.steadfast_api_key}
              onChange={(e) => setValues({ ...values, steadfast_api_key: e.target.value })}
              placeholder="Steadfast API Key বসান"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="steadfast_secret_key">Secret Key</Label>
            <Input
              id="steadfast_secret_key"
              type="password"
              value={values.steadfast_secret_key}
              onChange={(e) => setValues({ ...values, steadfast_secret_key: e.target.value })}
              placeholder="Steadfast Secret Key বসান"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            এই দুটি কী বসালে অর্ডার প্যানেল থেকে সরাসরি Steadfast-এ পাঠানো যাবে।
          </p>
        </div>

        <div className="grid gap-2 rounded-lg border p-3">
          <h2 className="font-semibold">BD Courier API (কুরিয়ার রেশিও চেক)</h2>
          <Label htmlFor="bdcourier_api_key">API Key</Label>
          <Input
            id="bdcourier_api_key"
            type="password"
            value={values.bdcourier_api_key}
            onChange={(e) => setValues({ ...values, bdcourier_api_key: e.target.value })}
            placeholder="BD Courier API Key বসান"
          />
          <p className="text-xs text-muted-foreground">
            কী বসালে অর্ডার প্যানেলে "রেশিও চেক" বোতাম দিয়ে কাস্টমারের ডেলিভারি সাকসেস রেশিও দেখা যাবে।
          </p>
        </div>

        <div className="grid gap-2 rounded-lg border p-3">
          <h2 className="font-semibold">ওয়েবসাইট লোগো</h2>
          <Label htmlFor="logo">হোম পেজ হেডারের লোগো</Label>
          <Input
            id="logo"
            type="file"
            accept="image/*"
            disabled={uploadingLogo}
            onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
          />
          {logoUrl && (
            <div className="mt-2 flex items-center gap-3">
              <img src={logoUrl} alt="লোগো প্রিভিউ" className="h-12 rounded border object-contain" />
              <Button type="button" variant="outline" size="sm" onClick={removeLogo}>
                লোগো সরান
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            ছবি আপলোড করলে হোম পেজের হেডারের মাঝখানে লোগোটি দেখা যাবে। কিছু না দিলে "Gentsity" লেখা থাকবে।
          </p>
        </div>
      </div>
      <Button type="submit" className="mt-5" disabled={saving}>
        {saving ? "সেভ হচ্ছে…" : "সেভ করুন"}
      </Button>
    </form>
    <StaffManager />
    </div>
  );
}

/** অফিস স্টাফ অ্যাকাউন্ট ম্যানেজমেন্ট — শুধু অ্যাডমিন। */
function StaffManager() {
  const qc = useQueryClient();
  const createFn = useServerFn(createStaff);
  const listFn = useServerFn(listStaff);
  const removeFn = useServerFn(removeStaff);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: () => listFn({}),
  });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createFn({ data: { email: email.trim(), password } });
      toast.success("স্টাফ অ্যাকাউন্ট তৈরি হয়েছে।");
      setEmail("");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["staff-list"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "স্টাফ তৈরি হয়নি।");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("এই স্টাফ অ্যাকাউন্টটি মুছে ফেলবেন?")) return;
    try {
      await removeFn({ data: { user_id: id } });
      toast.success("স্টাফ সরানো হয়েছে।");
      qc.invalidateQueries({ queryKey: ["staff-list"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সরানো যায়নি।");
    }
  };

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-lg font-bold">অফিস স্টাফ</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        স্টাফ অর্ডার ও স্টক ম্যানেজ করতে পারবে; ডিলিট, সেটিংস, আইপি ব্লক ও অসম্পূর্ণ অর্ডার পাবে না।
      </p>

      <form onSubmit={add} className="mt-4 grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="staff-email">স্টাফের ইমেইল</Label>
          <Input
            id="staff-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@example.com"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="staff-pass">পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)</Label>
          <Input
            id="staff-pass"
            type="text"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "তৈরি হচ্ছে…" : "স্টাফ অ্যাকাউন্ট তৈরি করুন"}
        </Button>
      </form>

      <div className="mt-4 grid gap-2">
        {staff.length === 0 && (
          <p className="text-sm text-muted-foreground">এখনো কোনো স্টাফ নেই।</p>
        )}
        {staff.map((s) => (
          <div
            key={s.user_id}
            className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
          >
            <span>{s.email}</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => remove(s.user_id)}
            >
              সরান
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
