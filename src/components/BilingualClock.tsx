import { useEffect, useState } from "react";
import { formatBilingualDate } from "@/lib/bilingual-date";

export function BilingualClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const formatted = now ? formatBilingualDate(now) : null;
  return <div className="border-b bg-secondary text-secondary-foreground">
    <div className="mx-auto flex min-h-12 max-w-6xl flex-col items-center justify-center gap-0.5 px-3 py-2 text-center text-xs font-semibold sm:flex-row sm:gap-5">
      <time lang="bn" dateTime={now?.toISOString()}>{formatted?.bn ?? "বাংলাদেশ সময়"}</time>
      <time lang="en" dateTime={now?.toISOString()}>{formatted?.en ?? "Bangladesh time"} · BST (UTC+6)</time>
    </div>
  </div>;
}