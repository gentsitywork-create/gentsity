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
      { title: "Gentsity — চায়না মাইক্রো স্ট্রেচ পায়জামা" },
      { name: "description", content: "চায়না মাইক্রো স্ট্রেচ পায়জামার কম্বো ও সিঙ্গেল কালেকশন। পছন্দের প্রোডাক্ট ও পরিমাণ বেছে অর্ডার করুন।" },
      { property: "og:title", content: "Gentsity — চায়না মাইক্রো স্ট্রেচ পায়জামা" },
      { property: "og:description", content: "কম্বো ও সিঙ্গেল পায়জামা থেকে পছন্দের প্রোডাক্ট বেছে অর্ডার করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PajamaPage,
});

const SIZES = ["M", "L", "XL", "XXL"] as const;
type Size = (typeof SIZES)[number];
type StockRow = { size: string; stock: number };
type Product = {
  id: string;
  name: string;
  product_kind: "single" | "combo";
  pieces_per_unit: number;
  price: number;
  image_url: string | null;
  sort_order: number;
  pajama_product_stock: StockRow[];
};

function PajamaPage() {
  const [size, setSize] = useState<Size | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ order_no: number; total: number; delivery_charge: number } | null>(null);
  const submit = useServerFn(placePajamaOrder);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("key, value");
      return Object.fromEntries((data ?? []).map((row) => [row.key, row.value ?? ""])) as Record<string, string>;
    },
  });
  const deliveryCharge = Math.max(0, Number(settings?.["pajama_delivery_charge"] ?? 100) || 0);
  const logoPath = settings?.["logo_path"];
  const { data: logoUrl } = useQuery({
    queryKey: ["site-logo", logoPath], enabled: Boolean(logoPath),
    queryFn: async () => {
      if (!logoPath) return "";
      const { data } = await supabase.storage.from("products").createSignedUrl(logoPath, 3600);
      return data?.signedUrl ?? "";
    },
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["pajama-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pajama_products")
        .select("id, name, product_kind, pieces_per_unit, price, image_url, sort_order, pajama_product_stock(size, stock)")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const { data: images = {} } = useQuery({
    queryKey: ["pajama-product-images", products.map((p) => p.image_url).join(",")],
    enabled: products.some((p) => Boolean(p.image_url)),
    queryFn: async () => {
      const paths = products.map((p) => p.image_url).filter((path): path is string => Boolean(path));
      const map: Record<string, string> = {};
      const { data } = await supabase.storage.from("products").createSignedUrls(paths, 3600);
      (data ?? []).forEach((row) => { if (row.path && row.signedUrl) map[row.path] = row.signedUrl; });
      return map;
    },
  });

  const selected = useMemo(() => products.filter((p) => (picks[p.id] ?? 0) > 0), [products, picks]);
  const totalUnits = Object.values(picks).reduce((sum, qty) => sum + qty, 0);
  const subtotal = selected.reduce((sum, p) => sum + p.price * (picks[p.id] ?? 0), 0);
  const total = subtotal + deliveryCharge;

  const changeQty = (product: Product, delta: number) => {
    setPicks((current) => {
      const next = Math.max(0, Math.min(50, (current[product.id] ?? 0) + delta));
      if (size) {
        const available = product.pajama_product_stock.find((row) => row.size === size)?.stock ?? 0;
        if (next > available) {
          toast.error(`${product.name} প্রোডাক্টে ${size} সাইজের স্টক ${available}টি।`);
          return current;
        }
      }
      const updated = { ...current };
      if (next === 0) delete updated[product.id]; else updated[product.id] = next;
      return updated;
    });
  };

  const chooseSize = (nextSize: Size) => {
    const unavailable = selected.find((product) => {
      const stock = product.pajama_product_stock.find((row) => row.size === nextSize)?.stock ?? 0;
      return stock < (picks[product.id] ?? 0);
    });
    if (unavailable) {
      toast.error(`${unavailable.name} প্রোডাক্টে ${nextSize} সাইজের পর্যাপ্ত স্টক নেই।`);
      return;
    }
    setSize(nextSize);
    trackPixel("ViewContent", { content_name: `Pajama ${nextSize}` });
  };

  const handleOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (totalUnits < 1) {
      toast.error("কমপক্ষে একটি প্রোডাক্ট নিন।");
      return;
    }
    if (!size) {
      toast.error("অর্ডারের সাইজ বাছুন।");
      return;
    }
    if (!/^01[3-9]\d{8}$/.test(form.phone.trim())) {
      toast.error("সঠিক মোবাইল নম্বর দিন (যেমন ০১৭xxxxxxxx)।");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submit({ data: {
        customer_name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(), size,
        items: Object.entries(picks).map(([product_id, qty]) => ({ product_id, qty })),
      } });
      trackPixel("Purchase", { value: result.total, currency: "BDT" });
      setDone(result); setPicks({}); setSize(null); setForm({ name: "", phone: "", address: "" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "অর্ডার জমা হয়নি, আবার চেষ্টা করুন।");
    } finally { setSubmitting(false); }
  };

  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card">
      <div className="relative mx-auto flex max-w-6xl items-center justify-center px-4 py-4">
        <Button asChild variant="outline" size="sm" className="absolute left-4"><Link to="/">পোলো শার্ট</Link></Button>
        {logoUrl ? <img src={logoUrl} alt="Gentsity" className="h-10 max-w-[180px] object-contain" /> : <span className="font-display text-2xl font-extrabold text-primary">Gentsity</span>}
      </div>
    </header>

    {done ? <section className="mx-auto max-w-3xl px-4 py-12 text-center">
      <div className="rounded-lg border bg-card p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check /></span>
        <h1 className="mt-5 text-2xl font-bold">অর্ডার সফল হয়েছে!</h1>
        <p className="mt-2 text-muted-foreground">অর্ডার নম্বর <strong>#{done.order_no}</strong>। ডেলিভারি চার্জ {done.delivery_charge} টাকাসহ মোট {done.total} টাকা। আমরা কল দিয়ে কনফার্ম করব।</p>
        <Button className="mt-6" onClick={() => setDone(null)}>আরেকটি অর্ডার করুন</Button>
      </div>
    </section> : <>
      <section className="mx-auto max-w-4xl px-4 pb-6 pt-9 text-center">
        <p className="text-sm font-bold text-primary">GENTSITY PAJAMA COLLECTION</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold md:text-4xl">চায়না মাইক্রো স্ট্রেচ পায়জামা</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">পছন্দের কম্বো বা সিঙ্গেল পায়জামা বেছে নিন। পরিমাণ ঠিক করে নিচে সাইজ ও তথ্য দিয়ে অর্ডার করুন।</p>
        <ul className="mt-5 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> প্রিমিয়াম ফ্যাব্রিক</li>
          <li className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> সারা বাংলাদেশে ডেলিভারি</li>
          <li className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> হাতে পেয়ে টাকা দিন</li>
        </ul>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        {isLoading ? <p className="py-10 text-center text-muted-foreground">প্রোডাক্ট লোড হচ্ছে…</p> : products.length === 0 ? <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">পায়জামার প্রোডাক্ট শিগগিরই আসছে।</p> :
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">{products.map((product) => {
            const qty = picks[product.id] ?? 0;
            const image = product.image_url ? images[product.image_url] : undefined;
            const stock = size ? product.pajama_product_stock.find((row) => row.size === size)?.stock ?? 0 : null;
            return <article key={product.id} className={`overflow-hidden rounded-lg border bg-card transition ${qty > 0 ? "border-primary ring-2 ring-primary" : "border-border"}`}>
              <div className="relative aspect-[4/5] bg-secondary">
                {image ? <img src={image} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">ছবি আপলোড করা হয়নি</div>}
                <span className="absolute left-2 top-2 rounded-md bg-card px-2 py-1 text-xs font-bold shadow-sm">{product.product_kind === "combo" ? "২ পিস কম্বো" : "সিঙ্গেল পিস"}</span>
                {qty > 0 && <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-5 w-5" /></span>}
              </div>
              <div className="p-3">
                <h2 className="min-h-10 text-sm font-bold leading-5 md:text-base">{product.name}</h2>
                <p className="mt-1 text-lg font-extrabold text-primary">৳{product.price}</p>
                {size && <p className="text-xs text-muted-foreground">{size} স্টক: {stock}</p>}
                <div className="mt-3 grid grid-cols-[40px_1fr_40px] items-center overflow-hidden rounded-md border">
                  <Button type="button" variant="ghost" size="icon" onClick={() => changeQty(product, -1)} disabled={qty === 0} aria-label={`${product.name} কমান`}><Minus className="h-4 w-4" /></Button>
                  <span className="text-center font-bold">{qty}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => changeQty(product, 1)} aria-label={`${product.name} বাড়ান`}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            </article>;
          })}</div>}

        {totalUnits > 0 && <form id="pajama-checkout" onSubmit={handleOrder} className="mx-auto mt-8 max-w-3xl rounded-lg border bg-card p-5 md:p-7">
          <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">অর্ডার সম্পন্ন করুন</h2><span className="rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">{totalUnits}টি</span></div>
          <div className="mt-5"><Label>আপনার সাইজ *</Label><div className="mt-2 grid grid-cols-4 gap-2">{SIZES.map((option) => <Button key={option} type="button" variant={size === option ? "default" : "outline"} className="text-base font-bold" onClick={() => chooseSize(option)}>{option}</Button>)}</div></div>
          <div className="mt-5 grid gap-4">
            <div className="grid gap-2"><Label htmlFor="pj-name">আপনার নাম</Label><Input id="pj-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid gap-2"><Label htmlFor="pj-phone">মোবাইল নম্বর *</Label><Input id="pj-phone" required inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01XXXXXXXXX" /></div>
            <div className="grid gap-2"><Label htmlFor="pj-address">আপনার সম্পূর্ণ ঠিকানা লিখুন, থানা, জেলাসহ</Label><Textarea id="pj-address" rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <div className="mt-5 rounded-lg bg-secondary p-4 text-sm">
            {selected.map((product) => <div key={product.id} className="mb-1 flex justify-between gap-3"><span>{product.name} × {picks[product.id]}</span><span>{product.price * (picks[product.id] ?? 0)} টাকা</span></div>)}
            <div className="mt-2 flex justify-between border-t pt-2"><span>পণ্যের দাম</span><span>{subtotal} টাকা</span></div>
            <div className="mt-1 flex justify-between"><span>ডেলিভারি চার্জ</span><span>{deliveryCharge} টাকা</span></div>
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold"><span>সর্বমোট</span><span>{total} টাকা</span></div>
          </div>
          <Button type="submit" className="mt-5 w-full py-6 text-base" disabled={submitting}>{submitting ? "জমা হচ্ছে…" : `অর্ডার করুন — ${total} টাকা`}</Button>
        </form>}
      </main>
    </>}
    <footer className="border-t bg-card py-6 text-center text-sm text-muted-foreground">© Gentsity — সারা বাংলাদেশে ক্যাশ অন ডেলিভারি</footer>
  </div>;
}
