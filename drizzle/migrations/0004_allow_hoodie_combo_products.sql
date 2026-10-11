ALTER TABLE public.pajama_products DROP CONSTRAINT pajama_products_product_kind_check;
ALTER TABLE public.pajama_products ADD CONSTRAINT pajama_products_product_kind_check CHECK (product_kind = ANY (ARRAY['single','combo','hoodie','sweatshirt']));
ALTER TABLE public.pajama_products DROP CONSTRAINT pajama_products_price_check;
ALTER TABLE public.pajama_products ADD CONSTRAINT pajama_products_price_check CHECK (price >= 0);