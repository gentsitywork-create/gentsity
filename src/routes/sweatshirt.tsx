import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Flame, Ruler, ShieldCheck, Sparkles, Truck, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { placeSweatshirtOrder } from "@/lib/orders.functions";
import { trackPixel } from "@/components/FacebookPixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import gentsityLogo from "@/assets/gentsity-header-logo.png";

export const Route = createFileRoute("/sweatshirt")({
  head: () => ({
    meta: [
      { title: "Gentsity — এক্সপোর্ট কোয়ালিটি প্রিমিয়াম সোয়েটশার্ট" },
      { name: "description", content: "এক্সপোর্ট কোয়ালিটির কটন ফ্লিস ফেব্রিকসের ২ পিস প্রিমিয়াম সুইট-শার্ট মাত্র ১১৯০ টাকা। ফ্রি ডেলিভারি, ক্যাশ অন ডেলিভারি।" },
      { property: "og:title", content: "Gentsity — এক্সপোর্ট কোয়ালিটি প্রিমিয়াম সোয়েটশার্ট" },
      { property: "og:description", content: "কটন ফ্লিস ফেব্রিকের ২ পিস প্রিমিয়াম সুইট-শার্ট মাত্র ১১৯০ টাকা। ফ্রি ডেলিভারি, ক্যাশ অন ডেলিভারি।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SweatshirtPage,
});

const SIZES = ["M", "L", "XL"] as const;
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

const SIZE_CHART: Record<Size, { chest: string; length: string }> = {
  M: { chest: "৩৮", length: "২৭" },
  L: { chest: "৪০", length: "২৮" },
  XL: { chest: "৪২", length: "২৯" },
};

function SweatshirtPage() {
  const [size, setSize] = useState<Size | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [deliveryArea, setDeliveryArea] = useState<"dhaka" | "outside">("outside");
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [done, setDone] = useState<{ order_no: number; total: number; delivery_charge: number } | null>(null);
  const submit = useServerFn(placeSweatshirtOrder);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("key, value");
      return Object.fromEntries((data ?? []).map((row) => [row.key, row.value ?? ""])) as Record<string, string>;
    },
  });
  const freeDelivery = settings?.["sweatshirt_free_delivery"] !== "off";
  const dhakaCharge = Math.max(0, Number(settings?.["sweatshirt_delivery_charge_dhaka"] ?? 80) || 80);
  const outsideCharge = Math.max(0, Number(settings?.["sweatshirt_delivery_charge_outside"] ?? 130) || 130);
  const deliveryCharge = freeDelivery ? 0 : deliveryArea === "dhaka" ? dhakaCharge : outsideCharge;
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["sweatshirt-products"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("pajama_products")
        .select("id, name, product_kind, pieces_per_unit, price, image_url, sort_order, pajama_product_stock(size, stock)") as any)
        .eq("page", "sweatshirt")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const BANNER_PATHS = ["sweatshirt/products/sweatshirt-1.png", "sweatshirt/products/sweatshirt-2.png"];
  const { data: bannerImages = [] } = useQuery({
    queryKey: ["sweatshirt-banner-images"],
    queryFn: async () => {
      const { data } = await supabase.storage.from("products").createSignedUrls(BANNER_PATHS, 3600);
      return (data ?? []).map((row) => row.signedUrl).filter((url): url is string => Boolean(url));
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
    trackPixel("ViewContent", { content_name: `Sweatshirt ${nextSize}` });
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
      setDone(result); setPicks({}); setSize(null); setDeliveryArea("outside"); setForm({ name: "", phone: "", address: "" }); setCheckoutOpen(false);
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
        <p className="text-sm font-bold text-primary">GENTSITY SWEATSHIRT COLLECTION</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold md:text-4xl"><Flame className="inline h-7 w-7 text-destructive" /> এক্সপোর্ট কোয়ালিটির কটন ফ্লিস ফেব্রিকসের তৈরি ২ পিস প্রিমিয়াম সুইট-শার্ট মাত্র ১১৯০ টাকা <Flame className="inline h-7 w-7 text-destructive" /></h1>
        <p className="mt-3 text-lg font-bold">রেগুলার প্রাইস <span className="text-muted-foreground line-through">২২০০ টাকা</span> — অফারে মাত্র <span className="text-primary">১১৯০ টাকা</span></p>
        <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">সফট, উষ্ণ ও প্রিমিয়াম কোয়ালিটি — শীতের জন্য পারফেক্ট পছন্দ! <Sparkles className="inline h-4 w-4 text-primary" /></p>

        <ul className="mt-5 flex flex-wrap justify-center gap-3 text-sm font-semibold">
          <li className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-primary"><Truck className="h-4 w-4" /> ডেলিভারি চার্জ ফ্রি</li>
          <li className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-primary"><Wallet className="h-4 w-4" /> ক্যাশ অন ডেলিভারি</li>
        </ul>

        {heroImage && (
          <div className="mt-5 overflow-hidden rounded-lg border bg-card">
            <img src={heroImage} alt="Gentsity প্রিমিয়াম সোয়েটশার্ট" className="mx-auto w-full max-w-md" loading="lazy" />
          </div>
        )}

        <ul className="mx-auto mt-5 grid max-w-2xl gap-2 text-left text-sm text-muted-foreground md:grid-cols-2">
          <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> এক্সপোর্ট কোয়ালিটি কটন ফ্লিস ফেব্রিক</li>
          <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> সফট, উষ্ণ ও আরামদায়ক</li>
          <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> প্রিমিয়াম ফিনিশিং ও টেকসই সেলাই</li>
          <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> ডেইলি ইউজ ও ক্যাজুয়াল আউটিংয়ের জন্য পারফেক্ট</li>
          <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> মেশিন ওয়াশেবল — রঙ উঠবে না</li>
          <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> ক্লাসিক ক্রু-নেক ডিজাইন — সব পোশাকের সাথে মানানসই</li>
        </ul>

        <div className="mt-6 rounded-lg border bg-card p-4 text-left text-sm">
          <h2 className="mb-2 font-bold text-foreground"><Ruler className="inline h-4 w-4" /> SIZE MEASUREMENT (INCH)</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li><strong className="text-foreground">M</strong> — বুক {SIZE_CHART.M.chest} ইঞ্চি · লম্বা {SIZE_CHART.M.length} ইঞ্চি</li>
            <li><strong className="text-foreground">L</strong> — বুক {SIZE_CHART.L.chest} ইঞ্চি · লম্বা {SIZE_CHART.L.length} ইঞ্চি</li>
            <li><strong className="text-foreground">XL</strong> — বুক {SIZE_CHART.XL.chest} ইঞ্চি · লম্বা {SIZE_CHART.XL.length} ইঞ্চি</li>
          </ul>
        </div>

        <ul className="mt-5 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> সারা বাংলাদেশে ডেলিভারি</li>
          <li className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> হাতে পেয়ে টাকা দিন</li>
        </ul>

      </section>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        {isLoading ? <p className="py-10 text-center text-muted-foreground">প্রোডাক্ট লোড হচ্ছে…</p> : products.length === 0 ? <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">সোয়েটশার্টের প্রোডাক্ট শিগগিরই আসছে।</p> :
          <div className="mx-auto grid w-full max-w-64 grid-cols-1 gap-5 sm:max-w-none sm:grid-cols-2 sm:gap-4 md:grid-cols-4 md:gap-5">{products.map((product) => {
            const qty = picks[product.id] ?? 0;
            const image = product.image_url ? images[product.image_url] : undefined;
            const stock = size ? product.pajama_product_stock.find((row) => row.size === size)?.stock ?? 0 : null;
            return <article key={product.id} className={`overflow-hidden rounded-lg border bg-card transition ${qty > 0 ? "border-primary ring-2 ring-primary" : "border-border"}`}>
              <div className="relative aspect-[4/5] bg-secondary">
                {image ? <img src={image} alt={product.name} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">ছবি আপলোড করা হয়নি</div>}
                <span className="absolute left-2 top-2 rounded-md bg-card px-2 py-1 text-xs font-bold shadow-sm">{product.product_kind === "combo" ? "২ পিস কম্বো" : "সিঙ্গেল পিস"}</span>
                {qty > 0 && <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-5 w-5" /></span>}
              </div>
              <div className="p-3">
                <h2 className="min-h-10 text-sm font-bold leading-5 md:text-base">{product.name}</h2>
                <p className="mt-1 text-lg font-extrabold text-primary">৳{product.price}</p>
                <p className="text-xs text-muted-foreground">রেগুলার প্রাইস <span className="line-through">২২০০ টাকা</span></p>
                {size && <p className="text-xs text-muted-foreground">{size} স্টক: {stock}</p>}
                <Button type="button" className="mt-3 w-full" onClick={() => orderProduct(product)}>অর্ডার করুন</Button>
              </div>
            </article>;
          })}</div>}

        <div className="mx-auto mt-8 max-w-3xl space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left text-sm text-muted-foreground">
          <p>সারা বাংলাদেশে ক্যাশ অন ডেলিভারি সুবিধা।</p>
          <p>– কেয়ার নির্দেশনা: হালকা ডিটারজেন্টে ধোয়া, ব্লিচ ব্যবহার নয়।</p>
          <p>প্রডাক্ট হাতে পাওয়ার পর ডেলিভারি রাইডার এর সামনে চেক করে নিবেন স্যার। কোন সমস্যা থাকলে আমাদের জানাবেন স্যার। রাইডার চলে যাওয়ার পর কোন অভিযোগ গ্রহণ করা হবে না স্যার।</p>
          <p className="font-semibold text-destructive">বি: দ্র: অর্ডার করার সময় সাইজ শিওর হয়ে নিবেন। সাইজ নিয়ে সমস্যা জানালে কুরিয়ার চার্জ দিয়ে সাইজ এক্সচেঞ্জ করতে হবে। NB: কোন কারনে প্রডাক্ট রির্টান করলে ডেলিভারি চার্জ দিয়ে রির্টান করতে হবে।</p>
        </div>
      </main>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">অর্ডার সম্পন্ন করুন</DialogTitle>
            <DialogDescription>সাইজ, ঠিকানা ও মোবাইল নম্বর দিয়ে অর্ডারটি কনফার্ম করুন।</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleOrder} className="space-y-4">
            <div><Label>আপনার সাইজ *</Label><div className="mt-2 grid grid-cols-3 gap-2">{SIZES.map((option) => <Button key={option} type="button" variant={size === option ? "default" : "outline"} className="text-base font-bold" onClick={() => chooseSize(option)}>{option}</Button>)}</div></div>
            {freeDelivery ? (
              <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm font-bold text-primary">সারা বাংলাদেশে ফ্রি ডেলিভারি 🚚</p>
            ) : (
            <div><Label>ডেলিভারি এরিয়া *</Label><div className="mt-2 grid grid-cols-2 gap-2">
              <Button type="button" variant={deliveryArea === "dhaka" ? "default" : "outline"} className="text-sm font-bold" onClick={() => setDeliveryArea("dhaka")}>ঢাকার ভিতরে (+{dhakaCharge}৳)</Button>
              <Button type="button" variant={deliveryArea === "outside" ? "default" : "outline"} className="text-sm font-bold" onClick={() => setDeliveryArea("outside")}>ঢাকার বাইরে (+{outsideCharge}৳)</Button>
            </div></div>
            )}
            <div className="grid gap-2"><Label htmlFor="sw-name">আপনার নাম</Label><Input id="sw-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid gap-2"><Label htmlFor="sw-phone">মোবাইল নম্বর *</Label><Input id="sw-phone" required inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01XXXXXXXXX" /></div>
            <div className="grid gap-2"><Label htmlFor="sw-address">আপনার সম্পূর্ণ ঠিকানা লিখুন, থানা, জেলাসহ</Label><Textarea id="sw-address" rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="rounded-lg bg-secondary p-4 text-sm">
              {selected.map((product) => <div key={product.id} className="mb-1 flex justify-between gap-3"><span>{product.name} × {picks[product.id]}</span><span>{product.price * (picks[product.id] ?? 0)} টাকা</span></div>)}
              <div className="mt-2 flex justify-between border-t pt-2"><span>পণ্যের দাম</span><span>{subtotal} টাকা</span></div>
              <div className="mt-1 flex justify-between"><span>ডেলিভারি চার্জ{freeDelivery ? "" : ` (${deliveryArea === "dhaka" ? "ঢাকার ভিতরে" : "ঢাকার বাইরে"})`}</span><span>{freeDelivery ? "ফ্রি" : `${deliveryCharge} টাকা`}</span></div>
              <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold"><span>সর্বমোট</span><span>{total} টাকা</span></div>
            </div>
            <Button type="submit" className="w-full py-6 text-base" disabled={submitting}>{submitting ? "জমা হচ্ছে…" : `অর্ডার কনফার্ম করুন — ${total} টাকা`}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>}
    <footer className="border-t bg-card py-6 text-center text-sm text-muted-foreground">© Gentsity — সারা বাংলাদেশে ক্যাশ অন ডেলিভারি</footer>
  </div>;
}
