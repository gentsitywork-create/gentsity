CREATE TABLE public.abandoned_carts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_key TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  phone TEXT,
  address TEXT,
  district TEXT,
  note TEXT,
  size TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount INTEGER NOT NULL DEFAULT 0,
  customer_ip TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  admin_note TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.abandoned_carts TO authenticated;
GRANT ALL ON public.abandoned_carts TO service_role;

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage abandoned carts"
ON public.abandoned_carts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_abandoned_carts_status ON public.abandoned_carts (status, created_at DESC);
CREATE INDEX idx_abandoned_carts_phone ON public.abandoned_carts (phone);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_abandoned_carts_updated_at
BEFORE UPDATE ON public.abandoned_carts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();