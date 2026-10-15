import { useEffect, useState } from "react";
import { formatBengaliDate } from "@/lib/bilingual-date";

/** বাংলা তারিখ ও সময় — লোগোর বাম পাশে বসার জন্য কমপ্যাক্ট ও রঙিন।
 *  মোবাইলে তারিখ ছোট সংখ্যায় (১৬/১০/২০২৬) দেখায় যাতে লোগোর ওপর না চড়ে। */
export function BilingualClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const formatted = now ? formatBengaliDate(now) : null;
  return (
    <div className="absolute left-2 top-1/2 flex -translate-y-1/2 flex-col items-start whitespace-nowrap leading-tight sm:left-4">
      <time
        lang="bn"
        dateTime={now?.toISOString()}
        className="bg-gradient-to-r from-primary via-accent to-destructive bg-clip-text text-[11px] font-bold text-transparent sm:text-base"
      >
        <span className="sm:hidden">{formatted?.dateShort ?? "তারিখ"}</span>
        <span className="hidden sm:inline">{formatted?.date ?? "তারিখ"}</span>
      </time>
      <time
        lang="bn"
        dateTime={now?.toISOString()}
        className="bg-gradient-to-r from-destructive via-accent to-primary bg-clip-text text-[11px] font-bold text-transparent sm:text-base"
      >
        {formatted?.time ?? "সময়"}
      </time>
    </div>
  );
}
