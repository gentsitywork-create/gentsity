import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/pajama-stock")({ component: AdminPajamaStock });
const SIZES = ["M", "L", "XL", "XXL"] as const;
type Size = (typeof SIZES)[number];
type StockRow = { size: string; stock: number };
type Product = { id: string; name: string; product_kind: "single" | "combo"; pieces_per_unit: number; price: number; image_url: string | null; is_active: boolean; sort_order: number; pajama_product_stock: StockRow[] };

function AdminPajamaStock() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: "", product_kind: "combo", price: "", M: "0", L: "0", XL: "0", XXL: "0" });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-pajama-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pajama_products").select("id, name, product_kind, pieces_per_unit, price, image_url, is_active, sort_order, pajama_product_stock(size, stock)").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const { data: images = {} } = useQuery({
    queryKey: ["admin-pajama-images", products.map((p) => p.image_url).join(",")], enabled: products.some((p) => Boolean(p.image_url)),
    queryFn: async () => {
      const paths = products.map((p) => p.image_url).filter((path): path is string => Boolean(path));
      const map: Record<string, string> = {};
      const { data } = await supabase.storage.from("products").createSignedUrls(paths, 3600);
      (data ?? []).forEach((row) => { if (row.path && row.signedUrl) map[row.path] = row.signedUrl; });
      return map;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-pajama-products"] });

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || Number(form.price) < 1) return toast.error("প্রোডাক্টের নাম ও সঠিক দাম দিন।");
    if (!file) return toast.error("প্রোডাক্টের ছবি আপলোড করুন।");
    setSaving(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `pajama/products/${crypto.randomUUID()}.${ext}`;
      const uploaded = await supabase.storage.from("products").upload(path, file, { contentType: file.type });
      if (uploaded.error) return toast.error("ছবি আপলোড হয়নি।");
      const kind = form.product_kind as "single" | "combo";
      const { data: product, error } = await supabase.from("pajama_products").insert({ name: form.name.trim(), product_kind: kind, pieces_per_unit: kind === "combo" ? 2 : 1, price: Number(form.price), image_url: path, sort_order: products.length + 1 }).select("id").single();
      if (error || !product) { await supabase.storage.from("products").remove([path]); return toast.error("প্রোডাক্ট যোগ হয়নি।"); }
      const stockRows = SIZES.map((size) => ({ product_id: product.id, size, stock: Math.max(0, Number(form[size]) || 0) }));
      const { error: stockError } = await supabase.from("pajama_product_stock").insert(stockRows);
      if (stockError) return toast.error("প্রোডাক্ট যোগ হয়েছে, কিন্তু স্টক সেভ হয়নি।");
      toast.success("পায়জামার প্রোডাক্ট যোগ হয়েছে।");
      setForm({ name: "", product_kind: "combo", price: "", M: "0", L: "0", XL: "0", XXL: "0" }); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } finally { setSaving(false); }
  };

  const updateProduct = async (id: string, patch: Partial<Product>) => {
    const { pajama_product_stock: _stock, ...safePatch } = patch;
    const { error } = await supabase.from("pajama_products").update(safePatch).eq("id", id);
    if (error) return toast.error("আপডেট হয়নি।");
    refresh();
  };
  const updateStock = async (productId: string, size: Size, stock: number) => {
    const { error } = await supabase.from("pajama_product_stock").upsert({ product_id: productId, size, stock: Math.max(0, stock) }, { onConflict: "product_id,size" });
    if (error) return toast.error("স্টক আপডেট হয়নি।");
    refresh();
  };
  const replaceImage = async (product: Product, nextFile: File) => {
    const ext = (nextFile.name.split(".").pop() || "jpg").toLowerCase();
    const path = `pajama/products/${crypto.randomUUID()}.${ext}`;
    const uploaded = await supabase.storage.from("products").upload(path, nextFile, { contentType: nextFile.type });
    if (uploaded.error) return toast.error("ছবি বদলানো যায়নি।");
    await updateProduct(product.id, { image_url: path });
    if (product.image_url) await supabase.storage.from("products").remove([product.image_url]);
  };
  const remove = async (product: Product) => {
    const { error } = await supabase.from("pajama_products").delete().eq("id", product.id);
    if (error) return toast.error("মুছে ফেলা যায়নি; প্রয়োজনে বন্ধ করে দিন।");
    if (product.image_url) await supabase.storage.from("products").remove([product.image_url]);
    refresh();
  };

  return <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
    <form onSubmit={add} className="rounded-lg border bg-card p-5">
      <h1 className="font-bold">নতুন পায়জামা প্রোডাক্ট যোগ করুন</h1>
      <div className="mt-4 grid gap-4">
        <div className="grid gap-2"><Label htmlFor="pj-image">ছবি</Label><Input id="pj-image" ref={fileRef} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{preview && <img src={preview} alt="প্রিভিউ" className="aspect-[4/5] w-full rounded-md border object-cover" />}</div>
        <div className="grid gap-2"><Label htmlFor="pj-name">প্রোডাক্টের নাম</Label><Input id="pj-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="যেমন: ব্ল্যাক কম্বো" /></div>
        <div className="grid gap-2"><Label>ধরন</Label><Select value={form.product_kind} onValueChange={(value) => setForm({ ...form, product_kind: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="combo">২ পিস কম্বো</SelectItem><SelectItem value="single">সিঙ্গেল পিস</SelectItem></SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor="pj-price">দাম (টাকা)</Label><Input id="pj-price" type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        <div><Label>সাইজ অনুযায়ী স্টক</Label><div className="mt-2 grid grid-cols-2 gap-2">{SIZES.map((size) => <div key={size}><Label htmlFor={`new-${size}`} className="text-xs">{size}</Label><Input id={`new-${size}`} type="number" min={0} value={form[size]} onChange={(e) => setForm({ ...form, [size]: e.target.value })} /></div>)}</div></div>
        <Button type="submit" disabled={saving}>{saving ? "যোগ হচ্ছে…" : "প্রোডাক্ট যোগ করুন"}</Button>
      </div>
    </form>

    <section className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between"><h2 className="font-bold">পায়জামা প্রোডাক্ট ও স্টক</h2><span className="text-sm text-muted-foreground">মোট {products.length}টি</span></div>
      {isLoading ? <p className="mt-4 text-muted-foreground">লোড হচ্ছে…</p> : products.length === 0 ? <p className="mt-4 text-muted-foreground">এখনো কোনো প্রোডাক্ট যোগ করা হয়নি।</p> : <div className="mt-4 grid gap-4 md:grid-cols-2">{products.map((product) => <article key={product.id} className="rounded-lg border p-3">
        {product.image_url && images[product.image_url] ? <img src={images[product.image_url]} alt={product.name} className="aspect-[4/3] w-full rounded-md object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-secondary text-sm text-muted-foreground">ছবি নেই</div>}
        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-[1fr_100px] gap-2"><Input defaultValue={product.name} onBlur={(e) => { const value = e.target.value.trim(); if (value && value !== product.name) updateProduct(product.id, { name: value }); }} /><Input type="number" min={1} defaultValue={product.price} onBlur={(e) => { const value = Number(e.target.value); if (value > 0 && value !== product.price) updateProduct(product.id, { price: value }); }} /></div>
          <div className="grid grid-cols-4 gap-2">{SIZES.map((size) => { const stock = product.pajama_product_stock.find((row) => row.size === size)?.stock ?? 0; return <div key={size}><Label className="text-xs">{size}</Label><Input type="number" min={0} defaultValue={stock} onBlur={(e) => { const value = Number(e.target.value); if (value !== stock) updateStock(product.id, size, value); }} /></div>; })}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={product.is_active ? "outline" : "default"} onClick={() => updateProduct(product.id, { is_active: !product.is_active })}>{product.is_active ? "চালু" : "বন্ধ"}</Button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm font-medium"><Upload className="h-4 w-4" /> ছবি বদল<input type="file" accept="image/*" className="hidden" onChange={(e) => { const nextFile = e.target.files?.[0]; if (nextFile) replaceImage(product, nextFile); }} /></label>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(product)} aria-label={`${product.name} মুছুন`}><Trash2 className="h-4 w-4" /></Button>
            <span className="ml-auto text-xs font-semibold text-muted-foreground">{product.product_kind === "combo" ? "২ পিস কম্বো" : "সিঙ্গেল পিস"}</span>
          </div>
        </div>
      </article>)}</div>}
    </section>
  </div>;
}
