import { describe, expect, it } from "vitest";

import {
  ABANDONED_CART_PAGES,
  ABANDONED_PAGE_LABELS,
  CATALOG_DELIVERY_CONFIG,
  POLO_DELIVERY_CONFIG,
} from "@/lib/abandoned-cart-pages";

describe("অসম্পূর্ণ কার্ট পেজ কনফিগারেশন", () => {
  it("সব প্রোডাক্ট পেজ অসম্পূর্ণ কার্টে আছে", () => {
    expect(ABANDONED_CART_PAGES).toEqual([
      "polo",
      "pajama",
      "sneakers",
      "sweatshirt",
      "sweatshirt_combo",
      "hoodie_combo",
    ]);
  });

  it("ক্যাটালগ পেজগুলোর ডেলিভারি সেটিংস ও ফলব্যাক ঠিক আছে", () => {
    expect(CATALOG_DELIVERY_CONFIG.pajama.dhakaFallback).toBe(70);
    expect(CATALOG_DELIVERY_CONFIG.pajama.outsideFallback).toBe(120);
    expect(CATALOG_DELIVERY_CONFIG.sneakers.dhakaFallback).toBe(80);
    expect(CATALOG_DELIVERY_CONFIG.sneakers.outsideFallback).toBe(130);
    expect(CATALOG_DELIVERY_CONFIG.sweatshirt.dhakaFallback).toBe(80);
    expect(CATALOG_DELIVERY_CONFIG.sweatshirt.outsideFallback).toBe(130);
  });

  it("পোলোর ডেলিভারি ফলব্যাক ঢাকা ৮০ / বাইরে ১৫০", () => {
    expect(POLO_DELIVERY_CONFIG.dhakaFallback).toBe(80);
    expect(POLO_DELIVERY_CONFIG.outsideFallback).toBe(150);
  });

  it("প্রতিটি পেজের বাংলা নাম অ্যাডমিন প্যানেলের জন্য আছে", () => {
    for (const page of ABANDONED_CART_PAGES) {
      expect(ABANDONED_PAGE_LABELS[page].length).toBeGreaterThan(0);
    }
  });
});
