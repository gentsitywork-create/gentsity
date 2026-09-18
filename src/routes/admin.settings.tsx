import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const [values, setValues] = useState({
    combo_price: "999",
    combo_qty: "5",
    fb_pixel_id: "",
    steadfast_api_key: "",
    steadfast_secret_key: "",
    bdcourier_api_key: "",
    logo_path: "",
    pajama_delivery_charge_dhaka: "70",
    pajama_delivery_charge_outside: "120",
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
        combo_qty: data["combo_qty"] ?? "5",
        fb_pixel_id: data["fb_pixel_id"] ?? "",
        steadfast_api_key: data["steadfast_api_key"] ?? "",
        steadfast_secret_key: data["steadfast_secret_key"] ?? "",
        bdcourier_api_key: data["bdcourier_api_key"] ?? "",
        logo_path: data["logo_path"] ?? "",
        pajama_delivery_charge: data["pajama_delivery_charge"] ?? "100",
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
    <form onSubmit={save} className="max-w-lg rounded-xl border bg-card p-5">
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
        <div className="grid gap-2">
          <Label htmlFor="pjdelivery">পায়জামার ডেলিভারি চার্জ (টাকা)</Label>
          <Input
            id="pjdelivery"
            type="number"
            min={0}
            value={values.pajama_delivery_charge}
            onChange={(e) => setValues({ ...values, pajama_delivery_charge: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pixel">Facebook Pixel ID</Label>
          <Input
            id="pixel"
            value={values.fb_pixel_id}
            onChange={(e) => setValues({ ...values, fb_pixel_id: e.target.value })}
            placeholder="যেমন: 1234567890"
          />
          <p className="text-xs text-muted-foreground">
            আইডি বসালেই ওয়েবসাইটে পিক্সেল চালু হয়ে যাবে (PageView, ViewContent, Purchase)।
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
  );
}
