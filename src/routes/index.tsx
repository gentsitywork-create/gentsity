import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Minus, Plus, ShieldCheck, Truck, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { placeOrder } from "@/lib/orders.functions";
import { trackPixel } from "@/components/FacebookPixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import comboImage from "@/assets/polo-combo.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gentsity — ৫ পিস পোলো শার্ট ৯৯৯ টাকা" },
      {
        name: "description",
        content:
          "পছন্দের সাইজ ও রঙ থেকে ৫ পিস পোলো শার্ট নিন মাত্র ৯৯৯ টাকায়। সারা বাংলাদেশে ফ্রি ডেলিভারি, ক্যাশ অন ডেলিভারি।",
      },
      { property: "og:title", content: "Gentsity — ৫ পিস পোলো শার্ট ৯৯৯ টাকা" },
      {
        property: "og:description",
        content: "সাইজ বাছুন, স্টকে থাকা রঙ থেকে ৫ পিস নিন। ফ্রি ডেলিভারি সারা বাংলাদেশে।",
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
  stock: number;
};

function Home() {
  const [size, setSize] = useState<Size | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ name: "", phone: "", address: "", district: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ order_no: number; total: number } | null>(null);

  const submit = useServerFn(placeOrder);

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

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["variants", size],
    enabled: Boolean(size),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color_name, color_hex, stock")
        .eq("size", size!)
        .eq("is_active", true)
        .gt("stock", 0)
        .order("sort_order");
      if (error) throw error;
      return data as Variant[];
    },
  });

  const totalPicked = useMemo(
    () => Object.values(picks).reduce((s, n) => s + n, 0),
    [picks],
  );

  const chooseSize = (s: Size) => {
    setSize(s);
    setPicks({});
    setDone(null);
    trackPixel("ViewContent", { content_name: `Polo ${s}` });
  };

  const change = (v: Variant, delta: number) => {
    setPicks((prev) => {
      const current = prev[v.id] ?? 0;
      const next = current + delta;
      if (next < 0) return prev;
      if (next > v.stock) {
        toast.error(`${v.color_name} রঙে মাত্র ${v.stock} পিস আছে।`);
        return prev;
      }
      if (delta > 0 && totalPicked >= 5) {
        toast.error("সর্বোচ্চ ৫ পিস নেওয়া যাবে।");
        return prev;
      }
      const copy = { ...prev };
      if (next === 0) delete copy[v.id];
      else copy[v.id] = next;
      return copy;
    });
  };

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!size) {
      toast.error("আগে সাইজ বাছুন।");
      return;
    }
    if (totalPicked !== 5) {
      toast.error("ঠিক ৫ পিস সিলেক্ট করুন।");
      return;
    }
    if (!/^01[3-9]\d{8}$/.test(form.phone.trim())) {
      toast.error("সঠিক মোবাইল নম্বর দিন (যেমন ০১৭xxxxxxxx)।");
      return;
    }
    if (form.address.trim().length < 10) {
      toast.error("সম্পূর্ণ ঠিকানা লিখুন।");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submit({
        data: {
          customer_name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          district: form.district.trim(),
          note: form.note.trim(),
          size,
          items: Object.entries(picks).map(([variant_id, qty]) => ({ variant_id, qty })),
        },
      });
      trackPixel("Purchase", { value: res.total, currency: "BDT" });
      setDone(res);
      setPicks({});
      setForm({ name: "", phone: "", address: "", district: "", note: "" });
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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="font-display text-2xl font-extrabold tracking-tight text-primary">
            Gentsity
          </span>
          <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
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
          <section className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-2 md:items-center">
            <img
              src={comboImage}
              alt="৫ পিস প্রিমিয়াম পোলো শার্ট কম্বো"
              width={1200}
              height={912}
              className="w-full rounded-xl border object-cover"
            />
            <div>
              <h1 className="font-display text-3xl font-extrabold leading-tight md:text-4xl">
                ৫ পিস প্রিমিয়াম পোলো শার্ট <span className="text-primary">{price} টাকা</span>
              </h1>
              <p className="mt-3 text-muted-foreground">
                নিজের পছন্দের সাইজ বাছুন, স্টকে থাকা রঙ থেকে ৫ পিস বেছে নিন। সারা বাংলাদেশে ফ্রি
                হোম ডেলিভারি, হাতে পেয়ে টাকা দিন।
              </p>
              <ul className="mt-5 grid gap-3 text-sm">
                <li className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" /> সারা বাংলাদেশে ফ্রি ডেলিভারি
                </li>
                <li className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" /> ক্যাশ অন ডেলিভারি
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> ১০০% এক্সপোর্ট কোয়ালিটি কটন
                </li>
              </ul>
              <a
                href="#order"
                className="mt-6 inline-flex rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground"
              >
                অর্ডার করুন
              </a>
            </div>
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
                  <h2 className="text-lg font-bold">২. ৫টি রঙ বাছুন</h2>
                  <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold">
                    {totalPicked}/৫ পিস
                  </span>
                </div>

                {isLoading ? (
                  <p className="mt-4 text-sm text-muted-foreground">রঙ লোড হচ্ছে…</p>
                ) : variants.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    এই সাইজে এখন কোনো রঙ স্টকে নেই। অন্য সাইজ দেখুন।
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {variants.map((v) => {
                      const qty = picks[v.id] ?? 0;
                      return (
                        <div
                          key={v.id}
                          className={`flex items-center gap-3 rounded-lg border p-3 ${
                            qty > 0 ? "border-primary" : ""
                          }`}
                        >
                          <span
                            className="h-9 w-9 shrink-0 rounded-full border"
                            style={{ backgroundColor: v.color_hex }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{v.color_name}</p>
                            <p className="text-xs text-muted-foreground">স্টক: {v.stock} পিস</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() => change(v, -1)}
                              disabled={qty === 0}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-6 text-center font-bold">{qty}</span>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() => change(v, 1)}
                              disabled={totalPicked >= 5}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {size && totalPicked === 5 && (
              <form onSubmit={handleOrder} className="mt-5 rounded-xl border bg-card p-5">
                <h2 className="text-lg font-bold">৩. ঠিকানা দিন</h2>
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">আপনার নাম</Label>
                    <Input
                      id="name"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="যেমন: রাকিব হাসান"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">মোবাইল নম্বর</Label>
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
                    <Label htmlFor="district">জেলা</Label>
                    <Input
                      id="district"
                      value={form.district}
                      onChange={(e) => setForm({ ...form, district: e.target.value })}
                      placeholder="যেমন: ঢাকা"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="address">সম্পূর্ণ ঠিকানা</Label>
                    <Textarea
                      id="address"
                      required
                      rows={3}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="বাসা/রোড, থানা, জেলা"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="note">কিছু বলতে চান? (ইচ্ছা হলে)</Label>
                    <Textarea
                      id="note"
                      rows={2}
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-lg bg-secondary p-4 text-sm">
                  <div className="flex justify-between">
                    <span>৫ পিস পোলো শার্ট ({size})</span>
                    <span className="font-semibold">{price} টাকা</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span>ডেলিভারি চার্জ</span>
                    <span className="font-semibold">ফ্রি</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold">
                    <span>মোট</span>
                    <span>{price} টাকা</span>
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
