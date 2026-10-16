/**
 * বিজ্ঞাপনের সোর্স ট্র্যাকিং — টিকটক/ইউটিউব/ফেসবুক অ্যাডের লিংকে ?utm_source=... দিলে
 * সেটা ক্যাপচার করে কুকি ও sessionStorage-এ রাখে। অর্ডার হলে সার্ভার কুকি থেকে
 * সোর্স পড়ে অর্ডারের সাথে সেভ করে।
 */
const COOKIE_NAME = "gt_src";
const MAX_AGE = 60 * 60 * 24 * 7; // ৭ দিন

export function captureTrafficSource() {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    let source = (params.get("utm_source") ?? "").trim().toLowerCase().slice(0, 40);
    const campaign = (params.get("utm_campaign") ?? "").trim().slice(0, 80);
    // অ্যাড প্ল্যাটফর্মের ক্লিক আইডি থাকলে সোর্স আন্দাজ করা যায়
    if (!source && params.has("fbclid")) source = "facebook";
    if (!source && params.has("ttclid")) source = "tiktok";
    if (!source && params.has("gclid")) source = "google";
    if (!source) return;
    const value = encodeURIComponent(JSON.stringify({ s: source, c: campaign, t: Date.now() }));
    sessionStorage.setItem(COOKIE_NAME, value);
    document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${MAX_AGE}; samesite=Lax`;
  } catch {
    // ব্রাউজার স্টোরেজ ব্লক থাকলেও অর্ডার আটকাবে না
  }
}

/** অ্যাডমিন দেখার জন্য বাংলা লেবেল */
export function sourceLabel(source: string | null | undefined): string {
  const map: Record<string, string> = {
    facebook: "ফেসবুক",
    instagram: "ইনস্টাগ্রাম",
    tiktok: "টিকটক",
    youtube: "ইউটিউব",
    google: "গুগল",
    direct: "সরাসরি",
    admin: "ম্যানুয়াল",
  };
  if (!source) return "সরাসরি";
  return map[source] ?? source;
}
