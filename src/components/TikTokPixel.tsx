import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { tiktokBrowserEvent } from "@/lib/tiktok-events";

type TikTokQueue = unknown[] & {
  page: () => void;
  track: (event: string, params?: Record<string, unknown>, options?: { event_id: string }) => void;
  load: (id: string) => void;
  setAndDefer: (queue: TikTokQueue, method: string) => void;
  methods: string[];
};

declare global { interface Window { ttq?: TikTokQueue; TikTokAnalyticsObject?: string; } }

export function trackTikTok(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (typeof window === "undefined") return;
  const mapped = tiktokBrowserEvent(event);
  if (mapped && window.ttq) window.ttq.track(mapped, params, eventId ? { event_id: eventId } : undefined);
}

export default function TikTokPixel() {
  const pathname = useLocation({ select: (location) => location.pathname });
  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/auth")) return;
    let cancelled = false;
    const clickId = new URL(window.location.href).searchParams.get("ttclid");
    if (clickId) document.cookie = `gt_ttclid=${encodeURIComponent(clickId.slice(0, 500))}; Path=/; Max-Age=7776000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    void (async () => {
      const { data } = await supabase.from("settings").select("value").eq("key", "tiktok_pixel_id").maybeSingle();
      const pixelId = data?.value?.trim();
      if (cancelled || !pixelId || !/^[A-Za-z0-9]+$/.test(pixelId)) return;
      if (!window.ttq) {
        const queue = [] as unknown as TikTokQueue;
        window.TikTokAnalyticsObject = "ttq";
        window.ttq = queue;
        queue.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
        queue.setAndDefer = (target, method) => {
          Object.assign(target, { [method]: (...args: unknown[]) => target.push([method, ...args]) });
        };
        queue.methods.forEach((method) => queue.setAndDefer(queue, method));
        // Official base-code loader metadata lets the SDK adopt queued calls.
        const metadata = queue as unknown as Record<string, any>;
        metadata._i = { [pixelId]: Object.assign([], { _u: "https://analytics.tiktok.com/i18n/pixel/events.js" }) };
        metadata._t = { [pixelId]: Date.now() };
        metadata._o = { [pixelId]: {} };
        const script = document.createElement("script");
        script.id = "tiktok-pixel-script";
        script.async = true;
        script.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`;
        document.head.appendChild(script);
      }
      window.ttq?.page();
    })();
    return () => { cancelled = true; };
  }, [pathname]);
  return null;
}