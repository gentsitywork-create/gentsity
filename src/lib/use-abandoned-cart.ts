import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";

import { markCartOrdered, saveAbandonedCart } from "@/lib/orders.functions";
import type { AbandonedCartPage } from "@/lib/abandoned-cart-pages";

export type AbandonedCartItem = { variant_id: string; qty: number; color_name?: string };

/**
 * মোবাইল নম্বর দিলে অসম্পূর্ণ কার্ট ব্যাক-এন্ডে সেভ হয় (অর্ডার শেষ না করলেও)।
 * প্রতিটি প্রোডাক্ট পেজে একবার কল করলেই যথেষ্ট। অর্ডার সফল হলে কার্ট মুছে যায়।
 */
export function useAbandonedCartCapture(opts: {
  page: AbandonedCartPage;
  size: string | null;
  items: AbandonedCartItem[];
  form: { name: string; phone: string; address: string };
  deliveryArea?: "dhaka" | "outside";
  done: boolean;
}) {
  const { page, size, items, form, deliveryArea, done } = opts;
  const saveCart = useServerFn(saveAbandonedCart);
  const clearCart = useServerFn(markCartOrdered);

  /** ব্রাউজারে একটি স্থায়ী কী — একই ভিজিটরের অসম্পূর্ণ কার্ট একটাই থাকে */
  const sessionKey = useRef<string>("");
  if (!sessionKey.current && typeof window !== "undefined") {
    let k = window.localStorage.getItem("gentsity_cart_key");
    if (!k) {
      k = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem("gentsity_cart_key", k);
    }
    sessionKey.current = k;
  }

  const clearedRef = useRef(false);
  useEffect(() => {
    if (done) {
      if (!clearedRef.current && sessionKey.current) {
        clearedRef.current = true;
        clearCart({ data: { session_key: sessionKey.current } }).catch(() => {});
      }
      return;
    }
    clearedRef.current = false;

    const phone = form.phone.trim();
    if (!/^01[3-9]\d{8}$/.test(phone)) return;
    const timer = setTimeout(() => {
      saveCart({
        data: {
          session_key: sessionKey.current,
          page,
          size: size ?? "M",
          customer_name: form.name.trim(),
          phone,
          address: form.address.trim(),
          delivery_area: deliveryArea,
          items,
        },
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, items, size, page, deliveryArea, done, saveCart, clearCart]);
}
