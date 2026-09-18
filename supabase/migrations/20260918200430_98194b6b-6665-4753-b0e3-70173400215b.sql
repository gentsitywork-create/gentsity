INSERT INTO public.settings (key, value)
VALUES
  ('pajama_delivery_charge_dhaka', '70'),
  ('pajama_delivery_charge_outside', '120')
ON CONFLICT (key) DO NOTHING;
