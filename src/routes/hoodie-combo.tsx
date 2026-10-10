import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Flame, ShieldCheck, Truck, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { placeHoodieComboOrder } from "@/lib/orders.functions";
import { trackPixel } from "@/components/FacebookPixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import gentsityLogo from "@/assets/gentsity-header-logo.png";

export const Route = createFileRoute("/hoodie-combo")({
  head: () => ({
    meta: [
      { title: "Gentsity — হুডি + সোয়েটশার্ট কম্বো মাত্র ১০৯০ টাকা" },
      { name: "description", content: "১ পিস হুডি + ২ পিস সোয়েটশার্ট মাত্র ১০৯০ টাকা। কটন ফ্লিস, ইনসাইড ব্রাশ। ডেলিভারি চার্জ ফ্রি।" },
      { property: "og:title", content: "Gentsity — হুডি + সোয়েটশার্ট কম্বো" },
      { property: "og:description", content: "পছন্দের ১টি হুডি ও ২টি সোয়েটশার্ট বেছে নিন মাত্র ১০৯০ টাকায়, ফ্রি ডেলিভারি।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HoodieComboPage,
});

const PRICE = 1090;
const SIZES = [
  { key: "M", label: "M-38" },
  { key: "L", label: "L-40" },
  { key: "XL", label: "XL-42" },
] as const;
type Size = (typeof SIZES)[number]["key"];
type Product = {
  id: string;
  name: string;
  product_kind: string;
  image_url: string | null;
  pajama_product_stock: { size: string; stock: number }[];
};

const navCls = "rounded-full border px-4 py-1.5 text-sm font-semibold whitespace-nowrap";
const navActive = { className: "rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold whitespace-nowrap text-primary-foreground" };

function HoodieComboPage() {
  const [size, setSize] = useState<Size | null>(null);
  const [hoodie, setHoodie] = useState<string | null>(null);
  const [sweats, setSweats] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ order_no: number; total: number } | null>(null);
  const submit = useServerFn(placeHoodieComboOrder);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["hoodie-combo-products"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("pajama_products")
        .select("id, name, product_kind, image_url, pajama_product_stock(size, stock)") as any)
        .eq("page", "hoodie_combo")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const { data: images = {} } = useQuery({
    queryKey: ["hoodie-combo-images", products.map((p) => p.image_url).join(",")],
    enabled: products.some((p) => Boolean(p.image_url)),
    queryFn: async () => {
      const paths = products.map((p) => p.image_url).filter((x): x is string => Boolean(x));
      const map: Record<string, string> = {};
      const { data } = await supabase.storage.from("products").createSignedUrls(paths, 3600);
      (data ?? []).forEach((r) => { if (r.path && r.signedUrl) map[r.path] = r.signedUrl; });
      return map;
    },
  });

  const stockOf = (p: Product) => (size ? p.pajama_product_stock.find((r) => r.size === size)?.stock ?? 0 : 0);
  const inSize = (kind: string) => products.filter((p) => p.product_kind === kind && stockOf(p) > 0);
  const hoodies = inSize("hoodie");
  const sweatshirts = inSize("sweatshirt");
  const complete = Boolean(hoodie) && sweats.length === 2;

  const pickSize = (s: Size) => {
    setSize(s); setHoodie(null); setSweats([]);
    trackPixel("ViewContent", { content_name: `Hoodie combo ${s}` });
  };
  const toggleSweat = (id: string) => {
    setSweats((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 2) { toast.error("২টি সোয়েটশার্ট বাছাই হয়ে গেছে। বদলাতে আগেরটা বাদ দিন।"); return cur; }
      return [...cur, id];
    });
  };

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!size || !hoodie || sweats.length !== 2) { toast.error("১টি হুডি ও ২টি সোয়েটশার্ট বাছুন।"); return; }
    if (!/^01[3-9]\d{8}$/.test(form.phone.trim())) { toast.error("সঠিক মোবাইল নম্বর দিন (যেমন ০১৭xxxxxxxx)।"); return; }
    setSubmitting(true);
    try {
      const res = await submit({ data: { customer_name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(), size, hoodie_id: hoodie, sweatshirt_ids: sweats } });
      trackPixel("Purchase", { value: res.total, currency: "BDT" });
      setDone(res); setOpen(false); setSize(null); setHoodie(null); setSweats([]); setForm({ name: "", phone: "", address: "" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "অর্ডার জমা হয়নি, আবার চেষ্টা করুন।");
    } finally { setSubmitting(false); }
  };

  const card = (p: Product, selected: boolean, order: number | null, onClick: () => void) => {
    const img = p.image_url ? images[p.image_url] : undefined;
    return (
      <button key={p.id} type="button" onClick={onClick} className={`relative overflow-hidden rounded-lg border bg-card text-left transition ${selected ? "border-primary ring-2 ring-primary" : "border-border"}`}>
        <div className="relative aspect-square bg-secondary">
          {img ? <img src={img} alt={p.name} className="h-full w-full object-contain" loading="lazy" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">ছবি নেই</div>}
          <span className="absolute left-1.5 top-1.5 rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-bold">{p.name}</span>
          <span className="absolute right-1.5 top-1.5 rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold">স্টক {stockOf(p)}</span>
          {selected && <span className="absolute inset-0 flex items-center justify-center bg-primary/20"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">{order ?? <Check className="h-6 w-6" />}</span></span>}
        </div>
        {selected && <p className="bg-primary py-1 text-center text-xs font-bold text-primary-foreground">✓ Selected</p>}
      </button>
    );
  };

  return <div className="min-h-screen bg-background pb-24">
    <header className="border-b bg-card">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-center px-4 py-3 sm:min-h-24">
        <img src={gentsityLogo} alt="Gentsity" className="max-h-16 w-48 object-contain sm:max-h-20 sm:w-72" />
      </div>
    </header>
    <nav className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-2.5 sm:justify-center">
        <Link to="/" activeOptions={{ exact: true }} className={navCls} activeProps={navActive}>পোলো শার্ট</Link>
        <Link to="/pajama" className={navCls} activeProps={navActive}>পায়জামা</Link>
        <Link to="/sneakers" className={navCls} activeProps={navActive}>স্নিকার্স</Link>
        <Link to="/sweatshirt" className={navCls} activeProps={navActive}>সোয়েটশার্ট</Link>
        <Link to="/hoodie-combo" className={navCls} activeProps={navActive}>হুডি কম্বো</Link>
      </div>
    </nav>

    {done ? <section className="mx-auto max-w-3xl px-4 py-12 text-center">
      <div className="rounded-lg border bg-card p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check /></span>
        <h1 className="mt-5 text-2xl font-bold">অর্ডার সফল হয়েছে!</h1>
        <p className="mt-2 text-muted-foreground">অর্ডার নম্বর <strong>#{done.order_no}</strong>। মোট {done.total} টাকা (ডেলিভারি ফ্রি)। আমরা কল দিয়ে কনফার্ম করব।</p>
        <Button className="mt-6" onClick={() => setDone(null)}>আরেকটি অর্ডার করুন</Button>
      </div>
    </section> : <main className="mx-auto max-w-4xl px-4 pt-8">
      <section className="text-center">
        <p className="text-sm font-bold text-primary">HOODIE + SWEATSHIRT COMBO</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold md:text-4xl"><Flame className="inline h-7 w-7 text-destructive" /> ১ পিস হুডি + ২ পিস সোয়েটশার্ট মাত্র ১০৯০ টাকা <Flame className="inline h-7 w-7 text-destructive" /></h1>
        <p className="mt-2 text-muted-foreground">হুডি + সোয়েট — কটন ফ্লিস ফেব্রিকস, ইনসাইড ব্রাশ</p>
        <ul className="mt-4 flex flex-wrap justify-center gap-3 text-sm font-semibold">
          <li className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-primary"><Truck className="h-4 w-4" /> ডেলিভারি চার্জ একদম ফ্রি</li>
          <li className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-primary"><Wallet className="h-4 w-4" /> ক্যাশ অন ডেলিভারি</li>
          <li className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-primary"><ShieldCheck className="h-4 w-4" /> কটন ফ্লিস, ইনসাইড ব্রাশ</li>
        </ul>
      </section>

      <section className="mt-8 rounded-lg border bg-card p-4">
        <h2 className={`text-lg font-bold ${size ? "" : "attention-wobble attention-flash"}`}>১. আপনার সাইজ বাছুন</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {SIZES.map((s) => <Button key={s.key} type="button" variant={size === s.key ? "default" : "outline"} className="py-6 text-base font-bold" onClick={() => pickSize(s.key)}>{s.label}</Button>)}
        </div>
      </section>

      {size && (isLoading ? <p className="py-8 text-center text-muted-foreground">লোড হচ্ছে…</p> : <>
        <section className="mt-6">
          <h2 className={`text-lg font-bold ${hoodie ? "" : "attention-wobble attention-flash"}`}>২. পছন্দের ১টি হুডি বাছুন {hoodie && "✓"}</h2>
          {hoodies.length === 0 ? <p className="mt-3 rounded-lg border bg-card p-6 text-center text-muted-foreground">এই সাইজে এখন কোনো হুডি নেই।</p> :
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{hoodies.map((p) => card(p, hoodie === p.id, null, () => setHoodie(hoodie === p.id ? null : p.id)))}</div>}
        </section>
        <section className="mt-6">
          <h2 className={`text-lg font-bold ${sweats.length === 2 ? "" : "attention-wobble attention-flash"}`}>৩. পছন্দের ২টি সোয়েটশার্ট বাছুন ({sweats.length}/২)</h2>
          {sweatshirts.length === 0 ? <p className="mt-3 rounded-lg border bg-card p-6 text-center text-muted-foreground">এই সাইজে এখন কোনো সোয়েটশার্ট নেই।</p> :
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{sweatshirts.map((p) => { const i = sweats.indexOf(p.id); return card(p, i >= 0, i >= 0 ? i + 1 : null, () => toggleSweat(p.id)); })}</div>}
        </section>
      </>)}

      <div className="mx-auto mt-8 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground">
        <p>সারা বাংলাদেশে ক্যাশ অন ডেলিভারি সুবিধা।</p>
        <p>প্রডাক্ট হাতে পাওয়ার পর ডেলিভারি রাইডার এর সামনে চেক করে নিবেন স্যার। রাইডার চলে যাওয়ার পর কোন অভিযোগ গ্রহণ করা হবে না স্যার।</p>
        <p className="font-semibold text-destructive">বি: দ্র: অর্ডার করার সময় সাইজ শিওর হয়ে নিবেন। সাইজ নিয়ে সমস্যা জানালে কুরিয়ার চার্জ দিয়ে সাইজ এক্সচেঞ্জ করতে হবে।</p>
      </div>
    </main>}

    {!done && <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card p-3">
      <div className="mx-auto flex max-w-4xl items-center gap-3">
        <p className="flex-1 text-sm"><strong>{(hoodie ? 1 : 0) + sweats.length}/৩</strong> বাছাই · <span className="font-bold text-primary">{PRICE} টাকা</span></p>
        <Button disabled={!complete} className={complete ? "attention-ring" : ""} onClick={() => setOpen(true)}>অর্ডার করুন</Button>
      </div>
    </div>}

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">অর্ডার সম্পন্ন করুন</DialogTitle>
          <DialogDescription>মোবাইল নম্বর দিয়ে অর্ডারটি কনফার্ম করুন।</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleOrder} className="space-y-4">
          <div className="grid gap-2"><Label htmlFor="hc-name">আপনার নাম</Label><Input id="hc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid gap-2"><Label htmlFor="hc-phone">মোবাইল নম্বর *</Label><Input id="hc-phone" required inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01XXXXXXXXX" /></div>
          <div className="grid gap-2"><Label htmlFor="hc-address">আপনার সম্পূর্ণ ঠিকানা লিখুন, থানা, জেলাসহ</Label><Textarea id="hc-address" rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="rounded-lg bg-secondary p-4 text-sm">
            <p>হুডি: {products.find((p) => p.id === hoodie)?.name}</p>
            <p>সোয়েটশার্ট: {sweats.map((id) => products.find((p) => p.id === id)?.name).join(", ")}</p>
            <p>সাইজ: {SIZES.find((s) => s.key === size)?.label}</p>
            <div className="mt-2 flex justify-between border-t pt-2"><span>ডেলিভারি চার্জ</span><span>ফ্রি</span></div>
            <div className="mt-1 flex justify-between text-base font-bold"><span>সর্বমোট</span><span>{PRICE} টাকা</span></div>
          </div>
          <Button type="submit" className="w-full py-6 text-base" disabled={submitting}>{submitting ? "জমা হচ্ছে…" : `অর্ডার কনফার্ম করুন — ${PRICE} টাকা`}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
