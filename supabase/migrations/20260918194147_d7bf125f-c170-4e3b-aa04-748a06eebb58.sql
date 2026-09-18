CREATE TABLE public.pajama_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  product_kind text NOT NULL DEFAULT 'single' CHECK (product_kind IN ('single', 'combo')),
  pieces_per_unit integer NOT NULL DEFAULT 1 CHECK (pieces_per_unit IN (1, 2)),
  price integer NOT NULL CHECK (price > 0),
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pajama_products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pajama_products TO authenticated;
GRANT ALL ON public.pajama_products TO service_role;
ALTER TABLE public.pajama_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active pajama products public read" ON public.pajama_products
  FOR SELECT TO anon, authenticated USING (is_active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage pajama products" ON public.pajama_products
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.pajama_product_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.pajama_products(id) ON DELETE CASCADE,
  size text NOT NULL CHECK (size IN ('M', 'L', 'XL', 'XXL')),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, size)
);

GRANT SELECT ON public.pajama_product_stock TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pajama_product_stock TO authenticated;
GRANT ALL ON public.pajama_product_stock TO service_role;
ALTER TABLE public.pajama_product_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pajama stock public read" ON public.pajama_product_stock
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage pajama stock" ON public.pajama_product_stock
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.order_items
  ADD COLUMN pajama_product_id uuid REFERENCES public.pajama_products(id) ON DELETE SET NULL,
  ADD COLUMN unit_price integer,
  ADD COLUMN pieces_per_unit integer NOT NULL DEFAULT 1;

INSERT INTO public.settings (key, value)
VALUES ('pajama_delivery_charge', '100')
ON CONFLICT (key) DO NOTHING;