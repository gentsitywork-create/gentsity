import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Minus, Plus, ShieldCheck, Truck, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { placePajamaOrder } from "@/lib/orders.functions";
import { trackPixel } from "@/components/FacebookPixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/pajama")({
  head: () => ({
    meta: [
      { title: "Gentsity — চায়না মাইক্রো স্ট্রেচ ফ্যাব্রিকের পায়জামা" },
      {
        name: "description",
        content:
          "চায়না মাইক্রো স্ট্রেচ ফ্যাব্রিকের পায়জামা — পছন্দের সাইজ ও রঙ থেকে যত খুশি পিস নিন। সারা বাংলাদেশে ফ্রি ডেলিভারি, ক্যাশ অন ডেলিভারি।",
      },
      { property: "og:title", content: "Gentsity — চায়না মাইক্রো স্ট্রেচ ফ্যাব্রিকের পায়জামা" },
      {
        property: "og:description",
        content: "সাইজ বাছুন, পছন্দের রঙ থেকে যত খুশি পিস নিন। ফ্রি ডেলিভারি সারা বাংলাদেশে।",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PajamaPage,
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

function PajamaPage() {
  const [size, setSize] = useState<Size | null>("M");
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ order_no: number; total: number } | null>(null);

  const submit = useServerFn(placePajamaOrder);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("key, value");
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => (map[r.key] = r.value ?? ""));
      return map;
    },
  });
  const price = Number(settings?.["pajama_price"] ?? 350) || 350;
  const logoPath = settings?.["logo_path"];

  const { data: logoUrl } = useQuery({
    queryKey: ["site-logo", logoPath],
    enabled: Boolean(logoPath),
    queryFn: async () => {
      const { data } = await supabase.storage.from("products").createSignedUrl(logoPath!, 3600);
      return data?.signedUrl ?? "";
    },
  });

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["pajama-variants", size],
    enabled: Boolean(size),
    queryFn: async () => {
      if (!size) return [] as Variant[];
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color_name, color_hex, image_url, stock")
        .eq("product_type", "pajama")
        .eq("size", size)
        .eq("is_active", true)
        .gt("stock", 0)
        .order("sort_order");
      if (error) throw error;
      return data as Variant[];
    },
  });

  const { data: images = {} } = useQuery({
    queryKey: ["pajama-variant-images", variants.map((v) => v.image_url).join(",")],
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
  const total = totalPicked * price;

  const chooseSize = (s: Size) => {
    setSize(s);
    setPicks({});
    setDone(null);
    trackPixel("ViewContent", { content_name: `Pajama ${s}` });
  };

  const changeQty = (v: Variant, delta: number) => {
    setPicks((prev) => {
      const cur = prev[v.id] ?? 0;
      const next = cur + delta;
      if (delta > 0 && cur >= v.stock) {
        toast.error(`এই রঙে ${v.stock} পিসের বেশি স্টক নেই।`);
        return prev;
      }
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[v.id];
        return copy;
      }
      return { ...prev, [v.id]: next };
    });
  };

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!size) {
      toast.error("আগে সাইজ বাছুন।");
      return;
    }
    if (totalPicked < 1) {
      toast.error("কমপক্ষে ১ পিস সিলেক্ট করুন।");
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
          items: Object.entries(picks).map(([variant_id, qty]) => ({ variant_id, qty })),
        },
      });
      trackPixel("Purchase", { value: res.total, currency: "BDT" });
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
        <div className="relative mx-auto flex max-w-5xl items-center justify-center px-4 py-4">
          <Link to="/" className="absolute left-4 rounded-md border px-3 py-1.5 text-sm font-semibold">
            পোলো শার্ট
          </Link>
          {logoUrl ? (
            <img src={logoUrl} alt="Gentsity" className="h-10 max-w-[200px] object-contain" />
          ) : (
            <span className="font-display text-2xl font-extrabold tracking-tight text-primary">
              Gentsity
            </span>
          )}
          <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
            ফ্রি ডেলিভারি
          </span>
        </div>
      </header>

      {done ? (
        <section className="mx-auto max-w-3xl px-4 py-12">
          <div className="rounded-xl border bg-card p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-2xl font-bold">অর্ডার সফল হয়েছে!</h1>
            <p className="mt-2 text-muted-foreground">
              আপনার অর্ডার নম্বর <strong>#{done.order_no}</strong>। মোট {done.total} টাকা, ডেলিভারি
              চার্জ ফ্রি। আমরা শীঘ্রই কল দিয়ে অর্ডার কনফার্ম করব।
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
              <span>চায়না মাইক্রো স্ট্রেচ ফ্যাব্রিকের পায়জামা </span>
              <span className="text-primary">মাত্র {price} টাকা / পিস </span>
              <span className="text-muted-foreground">(ফ্রী ডেলিভারি)</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              আরামদায়ক চায়না মাইক্রো স্ট্রেচ ফ্যাব্রিকের পায়জামা পিসপ্রতি মাত্র {price} টাকা।
              ডেলিভারি চার্জ সম্পূর্ণ ফ্রি এবং ক্যাশ অন ডেলিভারি — ডেলিভারি ম্যানের সামনে প্রডাক্ট
              চেক করে পেমেন্ট করতে পারবেন।
            </p>

            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> প্রিমিয়াম মাইক্রো স্ট্রেচ ফ্যাব্রিক
              </li>
              <li className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" /> সারা বাংলাদেশে ফ্রি ডেলিভারি
              </li>
              <li className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> হাতে পেয়ে টাকা দিন
              </li>
            </ul>
          </section>

          <section className="mx-auto max-w-3xl px-4 pb-16 pt-6">
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
                  <h2 className="text-lg font-bold">২. পছন্দের ডিজাইন ও পিস বাছুন</h2>
                  <span className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground">
                    {totalPicked} পিস
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  প্রতিটি ডিজাইন থেকে যত খুশি পিস নিতে পারবেন — পিসপ্রতি {price} টাকা।
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
                      const img = v.image_url ? images[v.image_url] : undefined;
                      return (
                        <div
                          key={v.id}
                          className={`overflow-hidden rounded-lg border-2 transition ${
                            qty > 0 ? "border-primary ring-2 ring-primary" : "border-border"
                          }`}
                        >
                          <div className="relative">
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
                              <span className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                                <Check className="h-5 w-5" />
                              </span>
                            )}
                          </div>
                          <div className="p-2">
                            <p className="truncate text-sm font-semibold">{v.color_name}</p>
                            <p className="text-xs text-muted-foreground">স্টক: {v.stock} পিস</p>
                            <div className="mt-2 flex items-center justify-between">
                              <button
                                type="button"
                                aria-label={`${v.color_name} এক পিস কমান`}
                                onClick={() => changeQty(v, -1)}
                                disabled={qty === 0}
                                className="flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="text-base font-bold">{qty}</span>
                              <button
                                type="button"
                                aria-label={`${v.color_name} এক পিস বাড়ান`}
                                onClick={() => changeQty(v, 1)}
                                className="flex h-8 w-8 items-center justify-center rounded-md border"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {size && totalPicked > 0 && (
              <form onSubmit={handleOrder} className="mt-5 rounded-xl border bg-card p-5">
                <h2 className="text-lg font-bold">
                  ৩. অর্ডার করতে আপনার তথ্যগুলো দিন
                </h2>
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="pj-name">আপনার নাম</Label>
                    <Input
                      id="pj-name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="যেমন: রাকিব হাসান"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pj-phone">মোবাইল নম্বর *</Label>
                    <Input
                      id="pj-phone"
                      required
                      inputMode="numeric"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="01XXXXXXXXX"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pj-address">আপনার সম্পূর্ণ ঠিকানা লিখুন, থানা, জেলাসহ</Label>
                    <Textarea
                      id="pj-address"
                      rows={3}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="বাসা/রোড, থানা, জেলা"
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-lg bg-secondary p-4 text-sm">
                  <div className="flex justify-between">
                    <span>পায়জামা ({size}) — {totalPicked} পিস × {price} টাকা</span>
                    <span className="font-semibold">{total} টাকা</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span>ডেলিভারি চার্জ</span>
                    <span className="font-semibold">ফ্রি</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold">
                    <span>মোট</span>
                    <span>{total} টাকা</span>
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
        © Gentsity — সারা বাংলাদেশে ফ্রি ডেলিভারি
      </footer>
    </div>
  );
}
