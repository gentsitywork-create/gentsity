-- Sweatshirt page reuses the pajama_products / pajama_product_stock catalog with page = 'sweatshirt'
INSERT INTO public.pajama_products (page, name, product_kind, pieces_per_unit, price, image_url, is_active, sort_order)
VALUES (
  'sweatshirt',
  'এক্সপোর্ট কোয়ালিটি প্রিমিয়াম সোয়েট-শার্ট (কালো)',
  'combo',
  2,
  1190,
  'sweatshirt/products/sweatshirt-1.png',
  true,
  1
)
ON CONFLICT DO NOTHING;

INSERT INTO public.pajama_product_stock (product_id, size, stock)
SELECT p.id, s.size, 50
FROM public.pajama_products p
CROSS JOIN (VALUES ('M'), ('L'), ('XL')) AS s(size)
WHERE p.page = 'sweatshirt'
  AND p.name = 'এক্সপোর্ট কোয়ালিটি প্রিমিয়াম সোয়েট-শার্ট (কালো)'
  AND NOT EXISTS (
    SELECT 1 FROM public.pajama_product_stock st
    WHERE st.product_id = p.id AND st.size = s.size
  );

INSERT INTO public.settings (key, value) VALUES
  ('sweatshirt_free_delivery', 'on'),
  ('sweatshirt_delivery_charge_dhaka', '80'),
  ('sweatshirt_delivery_charge_outside', '130')
ON CONFLICT (key) DO NOTHING;