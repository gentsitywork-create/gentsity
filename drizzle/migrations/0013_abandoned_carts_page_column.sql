ALTER TABLE public.abandoned_carts ADD COLUMN IF NOT EXISTS page TEXT NOT NULL DEFAULT 'polo';
ALTER TABLE public.abandoned_carts ADD COLUMN IF NOT EXISTS delivery_area TEXT;