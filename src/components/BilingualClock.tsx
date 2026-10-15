import { useEffect, useState } from "react";
import { formatBengaliDate } from "@/lib/bilingual-date";

/** বাংলা তারিখ ও সময় — লোগোর বাম পাশে বসার জন্য কমপ্যাক্ট ও রঙিন */
export function BilingualClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.setInterval === undefined ? undefined : window.clearInterval(timer);
  }, []);
  const formatted = now ? formatBengaliDate(now) : null;
  return (
    <div className="absolute left-2 top-1/2 flex -translate-y-1/2 flex-col items-start leading-tight max-w-[42%] sm:left-4">
      <time
        lang="bn"
        dateTime={now?.toISOString()}
        className="bg-gradient-to-r from-primary via-accent to-destructive bg-clip-text text-sm font-bold text-transparent sm:text-base"
      >
        {formatted?.date ?? "তারিখ"}
      </time>
      <time
        lang="bn"
        dateTime={now?.toISOString()}
        className="bg-gradient-to-r from-destructive via-accent to-primary bg-clip-text text-sm font-bold text-transparent sm:text-base"
      >
        {formatted?.time ?? "সময়"}
      </time>
    </div>
  );
}
