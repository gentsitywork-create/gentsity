import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTikTokSettings, saveTikTokSettings } from "@/lib/tiktok.functions";
import { supabase } from "@/integrations/supabase/client";

export default function TikTokSettings() {
  const queryClient = useQueryClient();
  const read = useServerFn(getTikTokSettings);
  const write = useServerFn(saveTikTokSettings);
  const [pixelId, setPixelId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-tiktok-settings"],
    queryFn: async () => {
      const [status, pixel] = await Promise.all([read(), supabase.from("settings").select("value").eq("key", "tiktok_pixel_id").maybeSingle()]);
      if (pixel.error) throw new Error("Pixel ID লোড হয়নি।");
      return { ...status, pixelId: pixel.data?.value ?? "" };
    },
  });
  const save = async (removeToken = false) => {
    setSaving(true);
    try {
      await write({ data: { pixelId: pixelId ?? data?.pixelId ?? "", accessToken: token || undefined, removeToken } });
      setToken("");
      await queryClient.invalidateQueries({ queryKey: ["admin-tiktok-settings"] });
      toast.success("TikTok সেটিংস সেভ হয়েছে।");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "TikTok সেটিংস সেভ হয়নি।");
    } finally { setSaving(false); }
  };
  return <section className="grid gap-3 rounded-lg border bg-card p-5">
    <h2 className="text-lg font-bold">TikTok Pixel ও Events API</h2>
    {error && <p className="text-sm text-destructive">TikTok সেটিংস লোড হয়নি। <Button type="button" variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-tiktok-settings"] })}>আবার চেষ্টা করুন</Button></p>}
    <Label htmlFor="tiktok-pixel">TikTok Pixel ID</Label>
    <Input id="tiktok-pixel" value={pixelId ?? data?.pixelId ?? ""} onChange={(e) => setPixelId(e.target.value)} disabled={isPending || Boolean(error)} placeholder="TikTok Events Manager-এর Pixel ID" />
    <Label htmlFor="tiktok-token">Events API Access Token</Label>
    <Input id="tiktok-token" type="password" autoComplete="new-password" value={token} onChange={(e) => setToken(e.target.value)} disabled={isPending || Boolean(error)} placeholder={data?.tokenConfigured ? "নতুন টোকেন দিয়ে পরিবর্তন করুন" : "TikTok Events Manager-এর Access Token"} />
    <p className="text-sm text-muted-foreground">{isPending ? "লোড হচ্ছে…" : data?.tokenConfigured ? "টোকেন সংরক্ষিত আছে।" : "টোকেন যোগ করা হয়নি।"}</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={() => save()} disabled={saving || isPending || Boolean(error)}>{saving ? "সেভ হচ্ছে…" : "TikTok সেটিংস সেভ করুন"}</Button>
      {data?.tokenConfigured && <Button type="button" variant="outline" disabled={saving} onClick={() => { if (window.confirm("TikTok Events API টোকেন সরাতে চান?")) void save(true); }}>টোকেন সরান</Button>}
    </div>
  </section>;
}