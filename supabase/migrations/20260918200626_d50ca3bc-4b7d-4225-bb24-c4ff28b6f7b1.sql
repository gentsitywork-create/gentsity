DROP POLICY IF EXISTS "settings public read" ON public.settings;

CREATE POLICY "settings public read"
  ON public.settings
  FOR SELECT
  TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR key NOT IN ('steadfast_api_key', 'steadfast_secret_key', 'bdcourier_api_key')
  );
