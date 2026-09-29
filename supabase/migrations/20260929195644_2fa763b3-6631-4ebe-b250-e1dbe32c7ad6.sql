INSERT INTO public.settings (key, value) VALUES
  ('polo_free_delivery', 'on'),
  ('pajama_free_delivery', 'off'),
  ('sneakers_free_delivery', 'off')
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS "settings public read" ON public.settings;
CREATE POLICY "settings public read" ON public.settings FOR SELECT TO anon, authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR key = ANY (ARRAY[
    'combo_price','combo_qty','fb_pixel_id','logo_path',
    'pajama_delivery_charge_dhaka','pajama_delivery_charge_outside',
    'sneakers_delivery_charge_dhaka','sneakers_delivery_charge_outside',
    'polo_delivery_charge_dhaka','polo_delivery_charge_outside',
    'whatsapp_number','whatsapp_message','free_delivery',
    'polo_free_delivery','pajama_free_delivery','sneakers_free_delivery'
  ])
);