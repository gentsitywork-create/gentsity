CREATE TABLE public.blocked_ips (
  id uuid primary key default gen_random_uuid(),
  ip text not null unique,
  reason text,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_ips TO authenticated;
GRANT ALL ON public.blocked_ips TO service_role;

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage blocked ips" ON public.blocked_ips
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_ip text;

INSERT INTO public.settings (key, value) VALUES ('bdcourier_api_key', '')
ON CONFLICT (key) DO NOTHING;