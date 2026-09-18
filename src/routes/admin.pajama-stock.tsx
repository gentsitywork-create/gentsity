import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/pajama-stock")({
  component: AdminPajamaStock,
});

const SIZES = ["M", "L", "XL", "XXL"];

type Variant = {
  id: string;
  size: string;
  color_name: string;
  color_hex: string;
  image_url: string | null;
  stock: number;
  is_active: boolean;
  sort_order: number;
};

async function signedUrls(paths: string[]) {
  const map: Record<string, string> = {};
  if (paths.length === 0) return map;
  const { data } = await supabase.storage.from("products").createSignedUrls(paths, 3600);
  (data ?? []).forEach((d) => {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}

function AdminPajamaStock() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    size: "M",
    color_name: "",
    color_hex: "#000000",
    stock: "10",
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sizeFilter, setSizeFilter] = useState("M");

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["admin-pajama-variants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color_name, color_hex, image_url, stock, is_active, sort_order")
        .eq("product_type", "pajama")
        .order("size")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Variant[];
    },
  });

  const { data: images = {} } = useQuery({
    queryKey: ["admin-pajama-variant-images", variants.map((v) => v.image_url).join(",")],
    enabled: variants.length > 0,
    queryFn: () =>
      signedUrls(variants.map((v) => v.image_url).filter((p): p is string => Boolean(p))),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-pajama-variants"] });
    qc.invalidateQueries({ queryKey: ["admin-pajama-variant-images"] });
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.color_name.trim()) {
      toast.error("ডিজাইনের নাম লিখুন।");
      return;
    }
    if (!file) {
      toast.error("পায়জামার ছবি আপলোড করুন।");
      return;
    }
    setSaving(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `pajama/${form.size}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage
        .from("products")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) {
        toast.error("ছবি আপলোড হয়নি। আবার চেষ্টা করুন।");
        return;
      }
      const { error } = await supabase.from("product_variants").insert({
        product_type: "pajama",
        size: form.size,
        color_name: form.color_name.trim(),
        color_hex: form.color_hex,
        image_url: path,
        stock: Number(form.stock) || 0,
        sort_order: variants.filter((v) => v.size === form.size).length + 1,
      });
      if (error) {
        await supabase.storage.from("products").remove([path]);
        toast.error("যোগ করা যায়নি — একই সাইজে এই নাম হয়তো আছে।");
        return;
      }
      toast.success("পায়জামার ডিজাইন যোগ হয়েছে।");
      setForm({ ...form, color_name: "" });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const update = async (id: string, patch: Partial<Variant>) => {
    const { error } = await supabase.from("product_variants").update(patch).eq("id", id);
    if (error) {
      toast.error("আপডেট হয়নি।");
      return;
    }
    refresh();
  };

  const replaceImage = async (v: Variant, newFile: File) => {
    const ext = (newFile.name.split(".").pop() || "jpg").toLowerCase();
    const path = `pajama/${v.size}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage
      .from("products")
      .upload(path, newFile, { contentType: newFile.type });
    if (up.error) {
      toast.error("ছবি বদলানো যায়নি।");
      return;
    }
    await update(v.id, { image_url: path });
    if (v.image_url) await supabase.storage.from("products").remove([v.image_url]);
    toast.success("ছবি বদলে গেছে।");
  };

  const remove = async (v: Variant) => {
    const { error } = await supabase.from("product_variants").delete().eq("id", v.id);
    if (error) {
      toast.error("মুছে ফেলা যায়নি (অর্ডারে ব্যবহৃত হতে পারে)। বদলে বন্ধ করে দিন।");
      return;
    }
    if (v.image_url) await supabase.storage.from("products").remove([v.image_url]);
    toast.success("মুছে ফেলা হয়েছে।");
    refresh();
  };

  const rows = variants.filter((v) => v.size === sizeFilter);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <form onSubmit={add} className="rounded-xl border bg-card p-5">
        <h2 className="font-bold">নতুন পায়জামা ডিজাইন (ছবি) ও স্টক যোগ করুন</h2>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label>সাইজ</Label>
            <Select value={form.size} onValueChange={(v) => setForm({ ...form, size: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pj-img">পায়জামার ছবি</Label>
            <Input
              id="pj-img"
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {preview && (
              <img
                src={preview}
                alt="প্রিভিউ"
                className="mt-1 h-40 w-full rounded-lg border object-cover"
              />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pj-cname">ডিজাইন / রঙের নাম</Label>
            <Input
              id="pj-cname"
              value={form.color_name}
              onChange={(e) => setForm({ ...form, color_name: e.target.value })}
              placeholder="যেমন: নেভি ব্লু"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pj-chex">রঙ (ইচ্ছা হলে)</Label>
            <Input
              id="pj-chex"
              type="color"
              className="h-11 p-1"
              value={form.color_hex}
              onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pj-stk">স্টক (পিস)</Label>
            <Input
              id="pj-stk"
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "আপলোড হচ্ছে…" : "যোগ করুন"}
          </Button>
        </div>
      </form>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">পায়জামার স্টক তালিকা</h2>
          <div className="flex gap-1">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSizeFilter(s)}
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                  sizeFilter === s ? "border-primary bg-primary text-primary-foreground" : ""
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">লোড হচ্ছে…</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">এই সাইজে কোনো পায়জামা ডিজাইন নেই।</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {rows.map((v) => (
              <div key={v.id} className="rounded-lg border p-3">
                {v.image_url && images[v.image_url] ? (
                  <img
                    src={images[v.image_url]}
                    alt={v.color_name}
                    className="h-40 w-full rounded-md border object-cover"
                  />
                ) : (
                  <div
                    className="flex h-40 w-full items-center justify-center rounded-md border text-xs text-muted-foreground"
                    style={{ backgroundColor: v.color_hex }}
                  >
                    ছবি নেই
                  </div>
                )}
                <p className="mt-2 font-semibold">{v.color_name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    className="w-24"
                    defaultValue={v.stock}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n !== v.stock) update(v.id, { stock: Number.isFinite(n) ? n : 0 });
                    }}
                  />
                  <Button
                    variant={v.is_active ? "outline" : "default"}
                    size="sm"
                    onClick={() => update(v.id, { is_active: !v.is_active })}
                  >
                    {v.is_active ? "চালু" : "বন্ধ"}
                  </Button>
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1.5 text-sm">
                    <Upload className="h-4 w-4" /> ছবি বদল
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) replaceImage(v, f);
                      }}
                    />
                  </label>
                  <Button variant="ghost" size="icon" onClick={() => remove(v)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
