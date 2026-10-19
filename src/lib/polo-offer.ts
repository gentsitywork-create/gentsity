/** পোলো পেজের নতুন ভিজিটর অফার — ব্রাউজার ও সার্ভার দুই জায়গাতেই নিরাপদ */
export const POLO_OFFER_ENABLED = false;
export const POLO_OFFER_MINUTES = 10;
export const POLO_OFFER_DISCOUNT = 51;
/** নেটওয়ার্ক দেরির জন্য সার্ভারে সামান্য বাড়তি সময় */
export const POLO_OFFER_GRACE_MS = 60_000;

export function poloOfferValid(startedAt: number, now: number, graceMs = 0): boolean {
  if (!POLO_OFFER_ENABLED) return false;
  if (!Number.isFinite(startedAt) || startedAt > now + 5_000) return false;
  return now - startedAt <= POLO_OFFER_MINUTES * 60_000 + graceMs;
}

export function poloOfferPrice(price: number, active: boolean): number {
  return active ? Math.max(0, price - POLO_OFFER_DISCOUNT) : price;
}
