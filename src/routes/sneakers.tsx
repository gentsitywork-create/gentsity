import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Flame, Ruler, ShieldCheck, Sparkles, Truck, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { placeSneakersOrder } from "@/lib/orders.functions";
import { trackPixel } from "@/components/FacebookPixel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import gentsityLogo from "@/assets/gentsity-header-logo.png";
import sneakersHeroBanner from "@/assets/sneakers-hero-banner.jpg.asset.json";

export const Route = createFileRoute("/sneakers")({
  head: () => ({
    meta: [
      { title: "Gentsity — প্রিমিয়াম স্নিকার্স" },
      { name: "description", content: "প্রিমিয়াম ফিনিশিংয়ের স্নিকার্স — ডেইলি ইউজ, ক্যাজুয়াল আউটিং ও স্মার্ট লুকের জন্য পারফেক্ট। সাইজ ৪০–৪৪, ক্যাশ অন ডেলিভারি।" },
      { property: "og:title", content: "Gentsity — প্রিমিয়াম স্নিকার্স" },
      { property: "og:description", content: "পছন্দের স্নিকার্স বেছে নিন, ক্যাশ অন ডেলিভারিতে অর্ডার করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SneakersPage,
});

const SIZES = ["40", "41", "42", "43", "44"] as const;
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

function SneakersPage() {
  const [size, setSize] = useState<Size | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [deliveryArea, setDeliveryArea] = useState<"dhaka" | "outside">("outside");
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [done, setDone] = useState<{ order_no: number; total: number; delivery_charge: number } | null>(null);
  const submit = useServerFn(placeSneakersOrder);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("key, value");
      return Object.fromEntries((data ?? []).map((row) => [row.key, row.value ?? ""])) as Record<string, string>;
    },
  });
  const freeDelivery = settings?.["sneakers_free_delivery"] === "on";
  const dhakaCharge = Math.max(0, Number(settings?.["sneakers_delivery_charge_dhaka"] ?? 80) || 80);
  const outsideCharge = Math.max(0, Number(settings?.["sneakers_delivery_charge_outside"] ?? 130) || 130);
  const deliveryCharge = freeDelivery ? 0 : deliveryArea === "dhaka" ? dhakaCharge : outsideCharge;
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["sneakers-products"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("pajama_products")
        .select("id, name, product_kind, pieces_per_unit, price, image_url, sort_order, pajama_product_stock(size, stock)") as any)
        .eq("page", "sneakers")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const { data: images = {} } = useQuery({
    queryKey: ["sneakers-product-images", products.map((p) => p.image_url).join(",")],
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
    trackPixel("ViewContent", { content_name: `Sneakers ${nextSize}` });
  };

  const orderProduct = (product: Product) => {
    setPicks({ [product.id]: 1 });
    setCheckoutOpen(true);
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
        delivery_area: deliveryArea,
        items: Object.entries(picks).map(([product_id, qty]) => ({ product_id, qty })),
      } });
      trackPixel("Purchase", { value: result.total, currency: "BDT" });
      setDone(result); setPicks({}); setSize(null); setDeliveryArea("outside"); setForm({ name: "", phone: "", address: "" });
      setCheckoutOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "অর্ডার জমা হয়নি, আবার চেষ্টা করুন।");
    } finally { setSubmitting(false); }
  };

  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card">
      <div className="relative mx-auto flex min-h-20 max-w-6xl items-center justify-center px-4 py-3 sm:min-h-24">
        <img src={gentsityLogo} alt="Gentsity" className="max-h-16 w-48 object-contain sm:max-h-20 sm:w-72" />
      </div>
    </header>

    <nav className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 overflow-x-auto px-4 py-2.5">
        <Link to="/" activeOptions={{ exact: true }} className="rounded-full border px-4 py-1.5 text-sm font-semibold" activeProps={{ className: "rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground" }}>পোলো শার্ট</Link>
        <Link to="/pajama" className="rounded-full border px-4 py-1.5 text-sm font-semibold" activeProps={{ className: "rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground" }}>পায়জামা</Link>
        <Link to="/sneakers" className="rounded-full border px-4 py-1.5 text-sm font-semibold" activeProps={{ className: "rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground" }}>স্নিকার্স</Link>
        <Link to="/sweatshirt" className="rounded-full border px-4 py-1.5 text-sm font-semibold" activeProps={{ className: "rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground" }}>সোয়েটশার্ট</Link>
        <Link to="/hoodie-combo" className="rounded-full border px-4 py-1.5 text-sm font-semibold whitespace-nowrap" activeProps={{ className: "rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold whitespace-nowrap text-primary-foreground" }}>হুডি কম্বো</Link>
      </div>
    </nav>

    {done ? <section className="mx-auto max-w-3xl px-4 py-12 text-center">
      <div className="rounded-lg border bg-card p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check /></span>
        <h1 className="mt-5 text-2xl font-bold">অর্ডার সফল হয়েছে!</h1>
        <p className="mt-2 text-muted-foreground">অর্ডার নম্বর <strong>#{done.order_no}</strong>। ডেলিভারি চার্জ {done.delivery_charge} টাকাসহ মোট {done.total} টাকা। আমরা কল দিয়ে কনফার্ম করব।</p>
        <Button className="mt-6" onClick={() => setDone(null)}>আরেকটি অর্ডার করুন</Button>
      </div>
    </section> : <>
      <section className="mx-auto max-w-4xl px-4 pb-6 pt-9 text-center">
        <p className="text-sm font-bold text-primary">GENTSITY SNEAKERS COLLECTION</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold md:text-4xl"><Flame className="inline h-7 w-7 text-destructive" /> প্রিমিয়াম স্নিকার্স <Flame className="inline h-7 w-7 text-destructive" /></h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">দেখতে স্মার্ট, ব্যবহারে কমফোর্টেবল — প্রতিদিনের জন্য পারফেক্ট জুতা! <Sparkles className="inline h-4 w-4 text-primary" /></p>

        <img src={sneakersHeroBanner.url} alt="Gentsity স্নিকার্স — স্টাইল আর কমফোর্টের গ্যারেন্টি, সাদা/কালা/বেজ/প্রিন্টেড কালার" className="mt-6 w-full rounded-lg border" loading="lazy" />

        <div className="mt-6 rounded-lg border bg-card p-4 text-left text-sm">
          <h2 className="mb-2 font-bold text-foreground"><Flame className="inline h-4 w-4 text-destructive" /> কেন এই প্রোডাক্ট নিবেন?</h2>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> প্রিমিয়াম ফিনিশিং — দেখতে smart, ব্যবহারেও comfortable</li>
            <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> Daily use, casual outing এবং smart look-এর জন্য perfect</li>
            <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> Available sizes: 40, 41, 42, 43, 44</li>
            <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> Cash on Delivery সুবিধা</li>
          </ul>
        </div>

        <p className="mt-6 text-base font-bold"><Ruler className="inline h-4 w-4" /> সাইজ: 40 | 41 | 42 | 43 | 44</p>

        <ul className="mt-5 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> সারা বাংলাদেশে ডেলিভারি</li>
          <li className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> হাতে পেয়ে টাকা দিন</li>
        </ul>

      </section>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        {isLoading ? <p className="py-10 text-center text-muted-foreground">প্রোডাক্ট লোড হচ্ছে…</p> : products.length === 0 ? <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">স্নিকার্স শিগগিরই আসছে।</p> :
<div className="mx-auto grid w-full max-w-64 grid-cols-1 gap-5 sm:max-w-none sm:grid-cols-2 sm:gap-4 md:grid-cols-4 md:gap-5">{products.map((product) => {
            const qty = picks[product.id] ?? 0;
            const image = product.image_url ? images[product.image_url] : undefined;
            const stock = size ? product.pajama_product_stock.find((row) => row.size === size)?.stock ?? 0 : null;
            return <article key={product.id} className={`overflow-hidden rounded-lg border bg-card transition ${qty > 0 ? "border-primary ring-2 ring-primary" : "border-border"}`}>
<div className="relative aspect-[4/5] bg-secondary">
                {image ? <img src={image} alt={product.name} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">ছবি আপলোড করা হয়নি</div>}
                <span className="absolute left-2 top-2 rounded-md bg-card px-2 py-1 text-xs font-bold shadow-sm">স্নিকার্স</span>
                {qty > 0 && <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-5 w-5" /></span>}
              </div>
              <div className="p-3">
                <h2 className="min-h-10 text-sm font-bold leading-5 md:text-base">{product.name}</h2>
                <p className="mt-1 text-lg font-extrabold text-primary">৳{product.price}</p>
                {size && <p className="text-xs text-muted-foreground">{size} স্টক: {stock}</p>}
                <Button type="button" className="mt-3 w-full" onClick={() => orderProduct(product)}>অর্ডার করুন</Button>
              </div>
            </article>;
          })}</div>}

        <section className="mx-auto mt-10 max-w-3xl space-y-4 text-left text-sm">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 font-bold text-foreground">রিটার্ন শর্তাবলী</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>Product পছন্দ না হলে delivery man-কে delivery charge pay করে return করতে হবে।</li>
              <li>Product-এ ফাটা, দাগ, damage, নষ্ট অথবা ভুল product হলে return করার সময় delivery charge লাগবে না।</li>
            </ul>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 font-bold text-foreground">রিটার্ন ও রিফান্ড নীতিমালা</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>রিটার্ন/এক্সচেঞ্জের জন্য পণ্যটি ব্যবহার না করা, পরিষ্কার এবং সম্ভব হলে original box/packaging-সহ থাকতে হবে।</li>
              <li>ভুল, ক্ষতিগ্রস্ত বা ত্রুটিপূর্ণ পণ্য পেলে যত দ্রুত সম্ভব আমাদের ফোন/WhatsApp-এ যোগাযোগ করুন। যাচাই সাপেক্ষে replacement বা return ব্যবস্থা করা হবে।</li>
              <li>Size change, পছন্দ পরিবর্তন বা personal preference-এর কারণে return/exchange হলে delivery/courier charge গ্রাহক বহন করবেন।</li>
              <li>ব্যবহৃত, নোংরা, ইচ্ছাকৃতভাবে ক্ষতিগ্রস্ত বা resale condition-এ নেই — এমন পণ্য return/refund-এর জন্য গ্রহণযোগ্য নাও হতে পারে।</li>
            </ul>
          </div>
        </section>

        <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
          <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-lg p-4 sm:p-6">
            <DialogHeader className="pr-8 text-left">
              <DialogTitle className="text-xl">অর্ডার সম্পন্ন করুন</DialogTitle>
              <DialogDescription>সাইজ ও ঠিকানা দিয়ে অর্ডারটি কনফার্ম করুন।</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleOrder}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-secondary p-3">
                <div className="min-w-0">
                  {selected.map((product) => <p key={product.id} className="truncate font-bold">{product.name}</p>)}
                  <p className="text-sm text-muted-foreground">{totalUnits}টি প্রোডাক্ট</p>
                </div>
                <span className="shrink-0 text-lg font-extrabold text-primary">৳{subtotal}</span>
              </div>
              <div className="mt-5"><Label>আপনার সাইজ *</Label><div className="mt-2 grid grid-cols-5 gap-2">{SIZES.map((option) => <Button key={option} type="button" variant={size === option ? "default" : "outline"} className="px-1 text-base font-bold" onClick={() => chooseSize(option)}>{option}</Button>)}</div></div>
              {freeDelivery ? (
                <p className="mt-5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-bold text-primary">সারা বাংলাদেশে ফ্রি ডেলিভারি 🚚</p>
              ) : (
              <div className="mt-5"><Label>ডেলিভারি এরিয়া *</Label><div className="mt-2 grid grid-cols-2 gap-2">
                <Button type="button" variant={deliveryArea === "dhaka" ? "default" : "outline"} className="h-auto min-h-10 whitespace-normal px-2 text-sm font-bold" onClick={() => setDeliveryArea("dhaka")}>ঢাকার ভিতরে (+{dhakaCharge}৳)</Button>
                <Button type="button" variant={deliveryArea === "outside" ? "default" : "outline"} className="h-auto min-h-10 whitespace-normal px-2 text-sm font-bold" onClick={() => setDeliveryArea("outside")}>ঢাকার বাইরে (+{outsideCharge}৳)</Button>
              </div></div>
              )}
              <div className="mt-5 grid gap-4">
                <div className="grid gap-2"><Label htmlFor="sn-name">আপনার নাম</Label><Input id="sn-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid gap-2"><Label htmlFor="sn-phone">মোবাইল নম্বর *</Label><Input id="sn-phone" required inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01XXXXXXXXX" /></div>
                <div className="grid gap-2"><Label htmlFor="sn-address">আপনার সম্পূর্ণ ঠিকানা লিখুন, থানা, জেলাসহ</Label><Textarea id="sn-address" rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              </div>
              <div className="mt-5 rounded-lg bg-secondary p-4 text-sm">
                <div className="flex justify-between gap-3"><span>পণ্যের দাম</span><span>{subtotal} টাকা</span></div>
                <div className="mt-1 flex justify-between gap-3"><span>ডেলিভারি চার্জ</span><span>{freeDelivery ? "ফ্রি" : `${deliveryCharge} টাকা`}</span></div>
                <div className="mt-2 flex justify-between gap-3 border-t pt-2 text-base font-bold"><span>সর্বমোট</span><span>{total} টাকা</span></div>
              </div>
              <Button type="submit" className="mt-5 w-full py-6 text-base" disabled={submitting}>{submitting ? "জমা হচ্ছে…" : `অর্ডার কনফার্ম করুন — ${total} টাকা`}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </>}
    <footer className="border-t bg-card py-6 text-center text-sm text-muted-foreground">© Gentsity — সারা বাংলাদেশে ক্যাশ অন ডেলিভারি</footer>
  </div>;
}
