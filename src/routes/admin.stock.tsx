import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

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

export const Route = createFileRoute("/admin/stock")({
  component: AdminStock,
});

const SIZES = ["M", "L", "XL", "XXL"];

type Variant = {
  id: string;
  size: string;
  color_name: string;
  color_hex: string;
  stock: number;
  is_active: boolean;
  sort_order: number;
};

function AdminStock() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    size: "M",
    color_name: "",
    color_hex: "#000000",
    stock: "10",
  });
  const [sizeFilter, setSizeFilter] = useState("M");

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["admin-variants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color_name, color_hex, stock, is_active, sort_order")
        .order("size")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Variant[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-variants"] });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.color_name.trim()) {
      toast.error("রঙের নাম লিখুন।");
      return;
    }
    const { error } = await supabase.from("product_variants").insert({
      size: form.size,
      color_name: form.color_name.trim(),
      color_hex: form.color_hex,
      stock: Number(form.stock) || 0,
      sort_order: variants.filter((v) => v.size === form.size).length + 1,
    });
    if (error) {
      toast.error("যোগ করা যায়নি — একই সাইজে এই রঙ হয়তো আছে।");
      return;
    }
    toast.success("রঙ যোগ হয়েছে।");
    setForm({ ...form, color_name: "" });
    refresh();
  };

  const update = async (id: string, patch: Partial<Variant>) => {
    const { error } = await supabase.from("product_variants").update(patch).eq("id", id);
    if (error) {
      toast.error("আপডেট হয়নি।");
      return;
    }
    refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (error) {
      toast.error("মুছে ফেলা যায়নি (অর্ডারে ব্যবহৃত হতে পারে)। বদলে বন্ধ করে দিন।");
      return;
    }
    toast.success("মুছে ফেলা হয়েছে।");
    refresh();
  };

  const rows = variants.filter((v) => v.size === sizeFilter);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <form onSubmit={add} className="rounded-xl border bg-card p-5">
        <h2 className="font-bold">নতুন রঙ ও স্টক যোগ করুন</h2>
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
            <Label htmlFor="cname">রঙের নাম</Label>
            <Input
              id="cname"
              value={form.color_name}
              onChange={(e) => setForm({ ...form, color_name: e.target.value })}
              placeholder="যেমন: কালো"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="chex">রঙ</Label>
            <Input
              id="chex"
              type="color"
              className="h-11 p-1"
              value={form.color_hex}
              onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stk">স্টক (পিস)</Label>
            <Input
              id="stk"
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
          </div>
          <Button type="submit">যোগ করুন</Button>
        </div>
      </form>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">স্টক তালিকা</h2>
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
          <p className="mt-4 text-sm text-muted-foreground">এই সাইজে কোনো রঙ নেই।</p>
        ) : (
          <div className="mt-4 grid gap-2">
            {rows.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span
                  className="h-8 w-8 rounded-full border"
                  style={{ backgroundColor: v.color_hex }}
                />
                <span className="min-w-24 flex-1 font-semibold">{v.color_name}</span>
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
                <Button variant="ghost" size="icon" onClick={() => remove(v.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
