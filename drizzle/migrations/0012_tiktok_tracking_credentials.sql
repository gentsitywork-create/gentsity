CREATE TABLE public.tracking_credentials (provider text PRIMARY KEY, access_token text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.tracking_credentials TO service_role;
REVOKE ALL ON public.tracking_credentials FROM anon, authenticated;
ALTER TABLE public.tracking_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public TikTok pixel identifier" ON public.settings FOR SELECT TO anon, authenticated USING (key = 'tiktok_pixel_id');