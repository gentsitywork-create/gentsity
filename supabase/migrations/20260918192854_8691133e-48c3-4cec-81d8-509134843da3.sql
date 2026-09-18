ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'polo';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'polo';
INSERT INTO public.settings (key, value) VALUES ('pajama_price', '350') ON CONFLICT (key) DO NOTHING;