import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
    _fbq?: unknown;
  }
}

export function trackPixel(event: string, params?: Record<string, unknown>) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", event, params);
  }
}

export default function FacebookPixel() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "fb_pixel_id")
        .maybeSingle();

      const pixelId = (data?.value ?? "").trim();
      if (cancelled || !pixelId || document.getElementById("fb-pixel-script")) return;

      const script = document.createElement("script");
      script.id = "fb-pixel-script";
      script.innerHTML = `
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'PageView');
      `;
      document.head.appendChild(script);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
