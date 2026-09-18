DROP POLICY IF EXISTS "settings public read" ON public.settings;

CREATE POLICY "settings public read"
  ON public.settings
  FOR SELECT
  TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR key IN (
      'combo_price',
      'combo_qty',
      'fb_pixel_id',
      'logo_path',
      'pajama_delivery_charge_dhaka',
      'pajama_delivery_charge_outside'
    )
  );
