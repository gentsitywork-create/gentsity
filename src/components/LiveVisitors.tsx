import { useEffect, useSyncExternalStore } from "react";

/** লাইভ ভিজিটর স্টোর — এক জায়গায় হার্টবিট, সব ব্যাজ একই সংখ্যা দেখে */
let liveCount = 0;
let hasData = false;
const listeners = new Set<() => void>();

function setLive(n: number) {
  liveCount = n;
  hasData = true;
  for (const l of listeners) l();
}

export function useLiveVisitors(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (hasData ? liveCount : -1),
    () => -1,
  );
}

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export function toBn(n: number): string {
  return String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

function getVisitorId(): string {
  try {
    const existing = sessionStorage.getItem("gt_visitor_id");
    if (existing) return existing;
    const raw =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const id = raw.replace(/[^A-Za-z0-9_-]/g, "");
    sessionStorage.setItem("gt_visitor_id", id);
    return id;
  } catch {
    return `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** প্রতি পেজে একবার মাউন্ট হয় (__root) — ৩০ সেকেন্ড পরপর হার্টবিট পাঠায় */
export function LiveVisitorTracker() {
  useEffect(() => {
    const visitorId = getVisitorId();
    let stopped = false;

    const beat = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/public/visitor-heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitorId, path: window.location.pathname }),
        });
        if (!res.ok || stopped) return;
        const data = (await res.json()) as { live?: number };
        setLive(typeof data.live === "number" ? data.live : 0);
      } catch {
        // নেটওয়ার্ক সমস্যা হলে পরের হার্টবিটে আবার চেষ্টা হবে
      }
    };

    void beat();
    const timer = setInterval(() => void beat(), 30_000);
    const onVisible = () => void beat();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

/** কাস্টমার পেজে "এখন দেখছেন" ব্যাজ */
export function LiveViewersBadge() {
  const live = useLiveVisitors();
  if (live < 1) return null;
  return (
    <div className="mt-4 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-bold shadow-sm">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <span className="text-foreground">{toBn(live)} জন এখন দেখছেন</span>
    </div>
  );
}
