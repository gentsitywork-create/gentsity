import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { adminCreateOrder, adminUpdateOrder } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SIZES = ["M", "L", "XL", "XXL", "40", "41", "42", "43", "44"] as const;
type Size = (typeof SIZES)[number];

export type EditableOrder = {
  id: string;
  order_no: number;
  customer_name: string;
  phone: string;
  address: string;
  district: string | null;
  note: string | null;
  total_amount: number;
  status: string;
  product_type: string;
  order_items: { variant_id?: string | null; pajama_product_id?: string | null; size: string; color_name: string; qty: number }[];
};

type Item = { variant_id: string | null; pajama_product_id: string | null; size: Size; color_name: string; qty: number };
type CatalogProduct = {
  id: string;
  name: string;
  page: string;
  is_active: boolean;
  pajama_product_stock: { size: string; stock: number }[];
};

export function OrderDialog({
  open,
  onOpenChange,
  order,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order?: EditableOrder | null;
  onSaved: () => void;
}) {
  const create = useServerFn(adminCreateOrder);
  const update = useServerFn(adminUpdateOrder);
  const editing = Boolean(order);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("999");
  const [status, setStatus] = useState("confirmed");
  const [size, setSize] = useState<Size>("M");
  const [items, setItems] = useState<Item[]>([]);
  const [productType, setProductType] = useState<"polo" | "pajama" | "sneakers">("polo");
  const [saving, setSaving] = useState(false);

  const { data: variants = [] } = useQuery({
    queryKey: ["admin-variants-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color_name, stock, is_active")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: catalogProducts = [] } = useQuery({
    queryKey: ["admin-order-catalog-products", productType],
    enabled: open && (productType === "pajama" || productType === "sneakers"),
    queryFn: async () => {
      const { data: products, error: productsError } = await supabase
        .from("pajama_products")
        .select("id, name, page, is_active")
        .eq("page", productType)
        .eq("is_active", true)
        .order("sort_order");
      if (productsError) throw productsError;
      const productIds = (products ?? []).map((product) => product.id);
      if (productIds.length === 0) return [];
      const { data: stocks, error: stocksError } = await supabase
        .from("pajama_product_stock")
        .select("product_id, size, stock")
        .in("product_id", productIds);
      if (stocksError) throw stocksError;
      return (products ?? []).map((product) => ({
        ...product,
        pajama_product_stock: (stocks ?? [])
          .filter((stock) => stock.product_id === product.id)
          .map(({ size: stockSize, stock }) => ({ size: stockSize, stock })),
      })) as CatalogProduct[];
    },
  });

  useEffect(() => {
    if (!open) return;
    if (order) {
      setName(order.customer_name);
      setPhone(order.phone);
      setAddress(order.address);
      setDistrict(order.district ?? "");
      setNote(order.note ?? "");
      setPrice(String(order.total_amount));
      setStatus(order.status);
      setProductType(order.product_type === "pajama" || order.product_type === "sneakers" ? order.product_type : "polo");
      const first = (order.order_items[0]?.size ?? "M") as Size;
      setSize(SIZES.includes(first) ? first : "M");
      setItems(
        order.order_items.map((it) => ({
          variant_id: it.variant_id ?? null,
          pajama_product_id: it.pajama_product_id ?? null,
          size: (SIZES.includes(it.size as Size) ? it.size : "M") as Size,
          color_name: it.color_name,
          qty: it.qty,
        })),
      );
    } else {
      setName("");
      setPhone("");
      setAddress("");
      setDistrict("");
      setNote("");
      setPrice("999");
      setStatus("confirmed");
      setSize("M");
      setItems([]);
      setProductType("polo");
    }
  }, [open, order]);

  const sizeVariants = useMemo(
    () => variants.filter((v) => v.size === size),
    [variants, size],
  );
  const sizeCatalogProducts = useMemo(
    () =>
      catalogProducts.map((product) => ({
        ...product,
        stock: product.pajama_product_stock.find((row) => row.size === size)?.stock ?? 0,
      })),
    [catalogProducts, size],
  );

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  const addColor = (v: { id: string; size: string; color_name: string }) => {
    setItems((prev) => {
      const i = prev.findIndex((p) => p.variant_id === v.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i]!, qty: next[i]!.qty + 1 };
        return next;
      }
      return [...prev, { variant_id: v.id, pajama_product_id: null, size: v.size as Size, color_name: v.color_name, qty: 1 }];
    });
  };

  const addCatalogProduct = (product: CatalogProduct) => {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.pajama_product_id === product.id && item.size === size);
      if (index >= 0) {
        const next = [...prev];
        const current = next[index];
        if (current) next[index] = { ...current, qty: current.qty + 1 };
        return next;
      }
      return [...prev, { variant_id: null, pajama_product_id: product.id, size, color_name: product.name, qty: 1 }];
    });
  };

  const changeQty = (idx: number, delta: number) => {
    setItems((prev) =>
      prev
        .map((p, i) => (i === idx ? { ...p, qty: p.qty + delta } : p))
        .filter((p) => p.qty > 0),
    );
  };

  const save = async () => {
    if (items.length === 0) {
      toast.error("অন্তত একটি কালার যোগ করুন।");
      return;
    }
    const payload = {
      customer_name: name,
      phone,
      address,
      district,
      note,
      total_amount: Number(price) || 0,
      delivery_charge: 0,
      status: status as "pending" | "confirmed" | "shipped" | "delivered" | "cancelled",
      product_type: productType,
      items,
    };
    setSaving(true);
    try {
      if (order) {
        await update({ data: { ...payload, order_id: order.id } });
        toast.success("অর্ডার আপডেট হয়েছে।");
      } else {
        const res = await create({ data: payload });
        toast.success(`নতুন অর্ডার তৈরি হয়েছে (#${res.order_no})`);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সেভ করা যায়নি।");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? `অর্ডার এডিট #${order?.order_no}` : "ম্যানুয়াল অর্ডার এন্ট্রি"}
          </DialogTitle>
        </DialogHeader>

        {!editing && (
          <div className="flex flex-wrap gap-2">
            {([["polo", "পোলো শার্ট"], ["pajama", "পায়জামা"], ["sneakers", "স্নিকার্স"]] as const).map(([k, label]) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={productType === k ? "default" : "outline"}
                onClick={() => {
                  setProductType(k);
                  setItems([]);
                  setSize(k === "sneakers" ? "40" : "M");
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>কাস্টমারের নাম</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>মোবাইল নম্বর</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
          </div>
          <div className="sm:col-span-2">
            <Label>ঠিকানা</Label>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>জেলা</Label>
            <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
          </div>
          <div>
            <Label>মূল্য (টাকা)</Label>
            <Input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div>
            <Label>স্ট্যাটাস</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">নতুন</SelectItem>
                <SelectItem value="confirmed">কনফার্ম</SelectItem>
                <SelectItem value="shipped">কুরিয়ারে</SelectItem>
                <SelectItem value="delivered">ডেলিভারি হয়েছে</SelectItem>
                <SelectItem value="cancelled">বাতিল</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>সাইজ</Label>
            <Select value={size} onValueChange={(v) => setSize(v as Size)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZES.filter((s) => (productType === "sneakers" ? /^\d/.test(s) : !/^\d/.test(s))).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>নোট</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="mt-2">
          <p className="text-sm font-semibold">
            {productType === "sneakers" ? `স্নিকার্স ডিজাইন যোগ করুন (${size})` : productType === "pajama" ? `পায়জামা ডিজাইন যোগ করুন (${size})` : `কালার যোগ করুন (${size})`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {productType === "pajama" || productType === "sneakers" ? (
              <>
                {sizeCatalogProducts.map((product) => (
                  <Button
                    key={product.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addCatalogProduct(product)}
                    disabled={product.stock < 1}
                  >
                    {product.name} <span className="text-muted-foreground">({product.stock})</span>
                  </Button>
                ))}
                {sizeCatalogProducts.length === 0 && (
                  <p className="text-xs text-muted-foreground">এই সাইজে কোনো ডিজাইন নেই।</p>
                )}
              </>
            ) : (
              <>
                {sizeVariants.map((v) => (
                  <Button
                    key={v.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addColor(v)}
                  >
                    {v.color_name} <span className="text-muted-foreground">({v.stock})</span>
                  </Button>
                ))}
                {sizeVariants.length === 0 && (
                  <p className="text-xs text-muted-foreground">এই সাইজে কোনো ডিজাইন নেই।</p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-3 rounded-lg border p-3">
          <p className="text-sm font-semibold">নির্বাচিত পণ্য — মোট {totalQty} পিস</p>
          <div className="mt-2 grid gap-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {it.color_name} ({it.size})
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => changeQty(i, -1)}>
                    −
                  </Button>
                  <span className="w-6 text-center font-semibold">{it.qty}</span>
                  <Button size="sm" variant="outline" onClick={() => changeQty(i, 1)}>
                    +
                  </Button>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground">উপরের কালার থেকে যোগ করুন।</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            বাতিল
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "সেভ হচ্ছে…" : editing ? "আপডেট করুন" : "অর্ডার তৈরি করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
