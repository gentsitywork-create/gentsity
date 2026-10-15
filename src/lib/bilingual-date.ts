export function formatBilingualDate(date: Date) {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Dhaka", weekday: "short", year: "numeric", month: "short",
    day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  };
  return {
    bn: new Intl.DateTimeFormat("bn-BD", options).format(date),
    en: new Intl.DateTimeFormat("en-GB", options).format(date),
  };
}

/** শুধু বাংলায় — তারিখ ও সময় আলাদা করে (লোগোর পাশের ঘড়ির জন্য) */
export function formatBengaliDate(date: Date) {
  const zone = { timeZone: "Asia/Dhaka" };
  const dateOptions: Intl.DateTimeFormatOptions = {
    ...zone, weekday: "long", year: "numeric", month: "long", day: "numeric",
  };
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { ...zone, hour: "numeric", hourCycle: "h23" }).format(date),
  );
  const period =
    hour < 4 ? "রাত" : hour < 6 ? "ভোর" : hour < 12 ? "সকাল" :
    hour < 16 ? "দুপুর" : hour < 18 ? "বিকাল" : hour < 20 ? "সন্ধ্যা" : "রাত";
  const parts = new Intl.DateTimeFormat("bn-BD", {
    ...zone, hour: "numeric", minute: "2-digit", hourCycle: "h12",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: new Intl.DateTimeFormat("bn-BD", dateOptions).format(date),
    time: `${period} ${pick("hour")}:${pick("minute")}`,
  };
}
