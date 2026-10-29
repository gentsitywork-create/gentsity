/**
 * অসম্পূর্ণ কার্ট (Abandoned Cart) — পেজ-ভিত্তিক কনফিগারেশন।
 * ব্রাউজার-সেফ: সার্ভার ফাংশন ও টেস্ট দুই জায়গাতেই ব্যবহার হয়।
 */

export const ABANDONED_CART_PAGES = [
  "polo",
  "pajama",
  "sneakers",
  "sweatshirt",
  "sweatshirt_combo",
  "hoodie_combo",
] as const;

export type AbandonedCartPage = (typeof ABANDONED_CART_PAGES)[number];

/** ক্যাটালগ পেজের ডেলিভারি সেটিংস (pajama_products টেবিল ব্যবহার করে) */
export const CATALOG_DELIVERY_CONFIG: Record<
  "pajama" | "sneakers" | "sweatshirt",
  {
    freeKey: string;
    dhakaKey: string;
    outsideKey: string;
    dhakaFallback: number;
    outsideFallback: number;
  }
> = {
  pajama: {
    freeKey: "pajama_free_delivery",
    dhakaKey: "pajama_delivery_charge_dhaka",
    outsideKey: "pajama_delivery_charge_outside",
    dhakaFallback: 70,
    outsideFallback: 120,
  },
  sneakers: {
    freeKey: "sneakers_free_delivery",
    dhakaKey: "sneakers_delivery_charge_dhaka",
    outsideKey: "sneakers_delivery_charge_outside",
    dhakaFallback: 80,
    outsideFallback: 130,
  },
  sweatshirt: {
    freeKey: "sweatshirt_free_delivery",
    dhakaKey: "sweatshirt_delivery_charge_dhaka",
    outsideKey: "sweatshirt_delivery_charge_outside",
    dhakaFallback: 80,
    outsideFallback: 130,
  },
};

/** পোলো পেজের ডেলিভারি সেটিংস (ফ্রি ডেলিভারি ডিফল্ট) */
export const POLO_DELIVERY_CONFIG = {
  freeKey: "polo_free_delivery",
  dhakaKey: "polo_delivery_charge_dhaka",
  outsideKey: "polo_delivery_charge_outside",
  dhakaFallback: 80,
  outsideFallback: 150,
};

/** অ্যাডমিন প্যানেলে পেজের বাংলা নাম */
export const ABANDONED_PAGE_LABELS: Record<AbandonedCartPage, string> = {
  polo: "পোলো শার্ট",
  pajama: "পায়জামা",
  sneakers: "স্নিকার্স",
  sweatshirt: "সোয়েটশার্ট",
  sweatshirt_combo: "সোয়েটশার্ট কম্বো",
  hoodie_combo: "হুডি কম্বো",
};
