import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ShieldCheck, Truck, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { markCartOrdered, placeOrder, saveAbandonedCart } from "@/lib/orders.functions";
import { trackPixel } from "@/components/FacebookPixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import comboImage from "@/assets/polo-combo.jpg";
import gentsityLogo from "@/assets/gentsity-header-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gentsity — ৬ পিস পোলো শার্ট ৯৯৯ টাকা" },
      {
        name: "description",
        content:
          "পছন্দের সাইজ ও রঙ থেকে ৬ পিস পোলো শার্ট নিন মাত্র ৯৯৯ টাকায়। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।",
      },
      { property: "og:title", content: "Gentsity — ৬ পিস পোলো শার্ট ৯৯৯ টাকা" },
      {
        property: "og:description",
        content: "সাইজ বাছুন, স্টকে থাকা রঙ থেকে ৬ পিস নিন। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।",
      },
    ],
  }),
  component: Home,
});

const SIZES = ["M", "L", "XL", "XXL"] as const;
type Size = (typeof SIZES)[number];

type Variant = {
  id: string;
  size: string;
  color_name: string;
  color_hex: string;
  image_url: string | null;
  stock: number;
};


function Home() {
  const [size, setSize] = useState<Size | null>("M");
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [deliveryArea, setDeliveryArea] = useState<"dhaka" | "outside">("dhaka");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ order_no: number; total: number } | null>(null);

  const submit = useServerFn(placeOrder);
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

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("key, value");
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => (map[r.key] = r.value ?? ""));
      return map;
    },
  });
  const price = Number(settings?.["combo_price"] ?? 999) || 999;
  const comboQty = Number(settings?.["combo_qty"] ?? 6) || 6;
  const deliveryCharge =
    deliveryArea === "dhaka"
      ? Number(settings?.["polo_delivery_charge_dhaka"] ?? 80) || 80
      : Number(settings?.["polo_delivery_charge_outside"] ?? 150) || 150;
  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["variants", size],
    enabled: Boolean(size),
    queryFn: async () => {
      if (!size) return [] as Variant[];
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color_name, color_hex, image_url, stock")
        .eq("product_type", "polo")
        .eq("size", size)
        .eq("is_active", true)
        .gt("stock", 0)
        .order("sort_order");
      if (error) throw error;
      return data as Variant[];
    },
  });

  const { data: images = {} } = useQuery({
    queryKey: ["variant-images", variants.map((v) => v.image_url).join(",")],
    enabled: variants.length > 0,
    queryFn: async () => {
      const paths = variants.map((v) => v.image_url).filter((p): p is string => Boolean(p));
      const map: Record<string, string> = {};
      if (paths.length === 0) return map;
      const { data } = await supabase.storage.from("products").createSignedUrls(paths, 3600);
      (data ?? []).forEach((d) => {
        if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      });
      return map;
    },
  });


  const totalPicked = useMemo(
    () => Object.values(picks).reduce((s, n) => s + n, 0),
    [picks],
  );

  const prevPicked = useRef(0);
  useEffect(() => {
    if (totalPicked === comboQty && prevPicked.current === comboQty - 1) {
      setTimeout(() => {
        document
          .getElementById("checkout")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
    prevPicked.current = totalPicked;
  }, [totalPicked, comboQty]);

  /** মোবাইল নম্বর দিলে অসম্পূর্ণ কার্ট ব্যাক-এন্ডে সেভ হয় (অর্ডার শেষ না করলেও) */
  useEffect(() => {
    if (done || !size) return;
    const phone = form.phone.trim();
    if (!/^01[3-9]\d{8}$/.test(phone)) return;
    const timer = setTimeout(() => {
      saveCart({
        data: {
          session_key: sessionKey.current,
          customer_name: form.name.trim(),
          phone,
          address: form.address.trim(),
          size,
          items: Object.entries(picks).map(([variant_id, qty]) => ({
            variant_id,
            qty,
            color_name: variants.find((v) => v.id === variant_id)?.color_name ?? "",
          })),
        },
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [form, picks, size, done, saveCart, variants]);


  const chooseSize = (s: Size) => {
    setSize(s);
    setPicks({});
    setDone(null);
    trackPixel("ViewContent", { content_name: `Polo ${s}` });
  };

  const togglePick = (v: Variant) => {
    setPicks((prev) => {
      if (prev[v.id]) {
        const copy = { ...prev };
        delete copy[v.id];
        return copy;
      }
      if (totalPicked >= comboQty) {
        toast.error(`সর্বোচ্চ ${comboQty} পিস নেওয়া যাবে।`);
        return prev;
      }
      return { ...prev, [v.id]: 1 };
    });
  };

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!size) {
      toast.error("আগে সাইজ বাছুন।");
      return;
    }
    if (totalPicked !== comboQty) {
      toast.error(`ঠিক ${comboQty} পিস সিলেক্ট করুন।`);
      return;
    }
    if (!/^01[3-9]\d{8}$/.test(form.phone.trim())) {
      toast.error("সঠিক মোবাইল নম্বর দিন (যেমন ০১৭xxxxxxxx)।");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submit({
        data: {
          customer_name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          size,
          delivery_area: deliveryArea,
          items: Object.entries(picks).map(([variant_id, qty]) => ({ variant_id, qty })),
        },
      });
      trackPixel("Purchase", { value: res.total, currency: "BDT" });
      clearCart({ data: { session_key: sessionKey.current } }).catch(() => {});
      setDone(res);
      setPicks({});
      setForm({ name: "", phone: "", address: "" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "অর্ডার জমা হয়নি, আবার চেষ্টা করুন।");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="relative mx-auto flex min-h-20 max-w-5xl items-center justify-center px-4 py-3 sm:min-h-24">
          <img
            src={gentsityLogo}
            alt="Gentsity"
            className="max-h-16 w-48 object-contain sm:max-h-20 sm:w-72"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
            ক্যাশ অন ডেলিভারি
          </span>
        </div>
      </header>

      <nav className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 overflow-x-auto px-4 py-2.5">
          <Link to="/" activeOptions={{ exact: true }} className="rounded-full border px-4 py-1.5 text-sm font-semibold" activeProps={{ className: "rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground" }}>পোলো শার্ট</Link>
          <Link to="/pajama" className="rounded-full border px-4 py-1.5 text-sm font-semibold" activeProps={{ className: "rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground" }}>পায়জামা</Link>
          <Link to="/sneakers" className="rounded-full border px-4 py-1.5 text-sm font-semibold" activeProps={{ className: "rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground" }}>স্নিকার্স</Link>
        </div>
      </nav>

      {done ? (
        <section className="mx-auto max-w-3xl px-4 py-12">
          <div className="rounded-xl border bg-card p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-2xl font-bold">অর্ডার সফল হয়েছে!</h1>
            <p className="mt-2 text-muted-foreground">
              আপনার অর্ডার নম্বর <strong>#{done.order_no}</strong>। মোট {done.total} টাকা (ডেলিভারি
              চার্জসহ)। আমরা শীঘ্রই কল দিয়ে অর্ডার কনফার্ম করব।
            </p>
            <Button className="mt-6" onClick={() => setDone(null)}>
              আরেকটি অর্ডার করুন
            </Button>
          </div>
        </section>
      ) : (
        <>
          <section className="mx-auto max-w-3xl px-4 pt-10 text-center">
            <h1 className="font-display text-3xl font-extrabold leading-tight md:text-4xl">
              <span>১০০% পিকে কটন কাপড়ের ৬ পিস পোলো শার্ট </span>
              <span className="text-primary">{price} টাকা </span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                ১০০% কটন কাপড়ের ছেলেদের ৬ পিস পোলো টি-শার্ট মাত্র {price} টাকা। ক্যাশ অন ডেলিভারি — ১ টাকাও আগে দেওয়া লাগবে না, ডেলিভারি ম্যান এর সামনে প্রডাক্ট চেক করে পেমেন্ট করতে পারবেন। ডেলিভারি চার্জ: ঢাকার ভিতরে ৮০ টাকা, ঢাকার বাইরে ১৫০ টাকা।
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-card p-4">
                <p className="font-display text-2xl font-extrabold text-primary">{price}</p>
                <p className="text-sm text-muted-foreground">টাকায়</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="font-display text-2xl font-extrabold text-primary">৫</p>
                <p className="text-sm text-muted-foreground">টি প্রডাক্ট</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="font-display text-2xl font-extrabold text-muted-foreground line-through">
                  ৳১,৫০০
                </p>
                <p className="text-sm text-muted-foreground">রেগুলার দাম</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="font-display text-2xl font-extrabold text-primary">৳৫০০+</p>
                <p className="text-sm text-muted-foreground">সেভ করুন</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="font-display text-2xl font-extrabold text-primary">
                  <Truck className="mx-auto h-6 w-6" />
                </p>
                <p className="text-sm text-muted-foreground">সারা বাংলাদেশে ডেলিভারি</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="font-display text-2xl font-extrabold text-primary">
                  <Wallet className="mx-auto h-6 w-6" />
                </p>
                <p className="text-sm text-muted-foreground">ক্যাশ অন ডেলিভারি</p>
              </div>
            </div>

            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> ১০০% এক্সপোর্ট কোয়ালিটি কটন
              </li>
              <li className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" /> সারা বাংলাদেশে ক্যাশ অন ডেলিভারি
              </li>
              <li className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> হাতে পেয়ে টাকা দিন
              </li>
            </ul>

            <img
              src={comboImage}
              alt="৬ পিস প্রিমিয়াম পোলো শার্ট কম্বো"
              width={1200}
              height={912}
              className="mt-8 w-full rounded-xl border object-cover"
            />

            <a
              href="#order"
              className="mt-6 inline-flex rounded-md bg-primary px-8 py-3 font-semibold text-primary-foreground"
            >
              অর্ডার করতে প্রথমে আপনার যে সাইজ লাগবে সেটা সিলেক্ট করুন
            </a>
          </section>

          <section id="order" className="mx-auto max-w-3xl px-4 pb-16">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-bold">১. সাইজ বাছুন</h2>
              <div className="mt-3 grid grid-cols-4 gap-3">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => chooseSize(s)}
                    className={`rounded-lg border py-3 text-lg font-bold transition ${
                      size === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:border-primary"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {size && (
              <div className="mt-5 rounded-xl border bg-card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">২. পছন্দের ৬টি ডিজাইন বাছুন</h2>
                  <span className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground">
                    {totalPicked} / {comboQty}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  নিচের ছবিগুলো থেকে আপনার পছন্দের ৬টি {size} সাইজ এর পোলো শার্ট সিলেক্ট করুন (ছবিতে ট্যাপ করুন) 👇
                </p>

                {isLoading ? (
                  <p className="mt-4 text-sm text-muted-foreground">ছবি লোড হচ্ছে…</p>
                ) : variants.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    এই সাইজে এখন কোনো ডিজাইন স্টকে নেই। অন্য সাইজ দেখুন।
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {variants.map((v) => {
                      const qty = picks[v.id] ?? 0;
                      const selectionNumber = Object.keys(picks).indexOf(v.id) + 1;
                      const img = v.image_url ? images[v.image_url] : undefined;
                      return (
                        <div
                          key={v.id}
                          className={`overflow-hidden rounded-lg border-2 transition ${
                            qty > 0 ? "border-primary ring-2 ring-primary" : "border-border"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => togglePick(v)}
                            aria-pressed={qty > 0}
                            aria-label={`${v.color_name} ${qty > 0 ? "বাদ দিন" : "সিলেক্ট করুন"}`}
                            className="relative block w-full"
                          >
                            {img ? (
                              <img
                                src={img}
                                alt={v.color_name}
                                className="aspect-square w-full object-cover"
                              />
                            ) : (
                              <span
                                className="block aspect-square w-full"
                                style={{ backgroundColor: v.color_hex }}
                              />
                            )}
                            {qty > 0 && (
                              <>
                                <span className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                                  <Check className="h-5 w-5" />
                                </span>
                                <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-sm">
                                  {selectionNumber}
                                </span>
                                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm">
                                  <Check className="h-4 w-4" /> সিলেক্টেড
                                </span>
                              </>
                            )}
                          </button>
                          <div className="p-2">
                            <p className="truncate text-sm font-semibold">{v.color_name}</p>
                            <p className="text-xs text-muted-foreground">স্টক: {v.stock} পিস</p>
                            <p className={`mt-2 text-xs font-semibold ${qty > 0 ? "text-primary" : "text-muted-foreground"}`}>
                              {qty > 0 ? `${selectionNumber} নম্বর পছন্দ` : "ছবিতে ট্যাপ করে সিলেক্ট করুন"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                )}
              </div>
            )}

            {size && totalPicked === comboQty && (
              <form id="checkout" onSubmit={handleOrder} className="mt-5 rounded-xl border bg-card p-5">
                <h2 className="text-lg font-bold">আপনার পছন্দের ছয়টি কালার অর্ডার করতে আপনার তথ্যগুলো দিন</h2>
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">আপনার নাম</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="যেমন: রাকিব হাসান"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">মোবাইল নম্বর *</Label>
                    <Input
                      id="phone"
                      required
                      inputMode="numeric"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="01XXXXXXXXX"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="address">আপনার সম্পূর্ণ ঠিকানা লিখুন, থানা, জেলাসহ</Label>
                    <Textarea
                      id="address"
                      rows={3}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="বাসা/রোড, থানা, জেলা"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>ডেলিভারি এরিয়া *</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setDeliveryArea("dhaka")}
                        className={`rounded-lg border py-3 text-sm font-bold transition ${
                          deliveryArea === "dhaka"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background hover:border-primary"
                        }`}
                      >
                        ঢাকার ভিতরে (৮০ টাকা)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeliveryArea("outside")}
                        className={`rounded-lg border py-3 text-sm font-bold transition ${
                          deliveryArea === "outside"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background hover:border-primary"
                        }`}
                      >
                        ঢাকার বাইরে (১৫০ টাকা)
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-lg bg-secondary p-4 text-sm">
                  <div className="flex justify-between">
                    <span>৬ পিস পোলো শার্ট ({size})</span>
                    <span className="font-semibold">{price} টাকা</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span>ডেলিভারি চার্জ ({deliveryArea === "dhaka" ? "ঢাকার ভিতরে" : "ঢাকার বাইরে"})</span>
                    <span className="font-semibold">{deliveryCharge} টাকা</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold">
                    <span>মোট</span>
                    <span>{price + deliveryCharge} টাকা</span>
                  </div>
                </div>

                <Button type="submit" className="mt-5 w-full py-6 text-base" disabled={submitting}>
                  {submitting ? "জমা হচ্ছে…" : "অর্ডার কনফার্ম করুন"}
                </Button>
              </form>
            )}
          </section>
        </>
      )}

      <footer className="border-t bg-card py-6 text-center text-sm text-muted-foreground">
        © Gentsity — সারা বাংলাদেশে ক্যাশ অন ডেলিভারি
      </footer>
    </div>
  );
}
