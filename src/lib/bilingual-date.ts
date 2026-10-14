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