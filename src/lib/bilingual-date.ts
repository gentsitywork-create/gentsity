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
  const dateOptions: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Dhaka", weekday: "long", year: "numeric", month: "long", day: "numeric",
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: true,
  };
  return {
    date: new Intl.DateTimeFormat("bn-BD", dateOptions).format(date),
    time: new Intl.DateTimeFormat("bn-BD", timeOptions).format(date),
  };
}
