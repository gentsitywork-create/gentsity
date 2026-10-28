import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTikTokSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!allowed) throw new Error("অনুমতি নেই।");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("tracking_credentials").select("provider").eq("provider", "tiktok").maybeSingle();
    if (error) throw new Error("TikTok সেটিংস লোড হয়নি।");
    return { tokenConfigured: Boolean(data) };
  });

export const saveTikTokSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    pixelId: z.string().trim().max(100).regex(/^[A-Za-z0-9]*$/),
    accessToken: z.string().trim().max(4096).optional(),
    removeToken: z.boolean().default(false),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: allowed } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!allowed) throw new Error("অনুমতি নেই।");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: pixelError } = await supabaseAdmin.from("settings").upsert({ key: "tiktok_pixel_id", value: data.pixelId }, { onConflict: "key" });
    if (pixelError) throw new Error("TikTok Pixel ID সেভ হয়নি।");
    if (data.removeToken) {
      const { error } = await supabaseAdmin.from("tracking_credentials").delete().eq("provider", "tiktok");
      if (error) throw new Error("TikTok টোকেন সরানো যায়নি।");
    } else if (data.accessToken) {
      const { error } = await supabaseAdmin.from("tracking_credentials").upsert({ provider: "tiktok", access_token: data.accessToken, updated_at: new Date().toISOString() });
      if (error) throw new Error("TikTok টোকেন সেভ হয়নি।");
    }
    return { saved: true };
  });