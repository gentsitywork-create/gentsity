INSERT INTO public.pajama_products (page, name, product_kind, pieces_per_unit, price, image_url, is_active, sort_order)
VALUES (
  'sweatshirt',
  'এক্সপোর্ট কোয়ালিটি প্রিমিয়াম সোয়েট-শার্ট (সাদা)',
  'combo',
  2,
  1190,
  'sweatshirt/products/sweatshirt-2.png',
  true,
  2
)
ON CONFLICT DO NOTHING;

INSERT INTO public.pajama_product_stock (product_id, size, stock)
SELECT p.id, s.size, 50
FROM public.pajama_products p
CROSS JOIN (VALUES ('M'), ('L'), ('XL')) AS s(size)
WHERE p.page = 'sweatshirt'
  AND p.name = 'এক্সপোর্ট কোয়ালিটি প্রিমিয়াম সোয়েট-শার্ট (সাদা)'
  AND NOT EXISTS (
    SELECT 1 FROM public.pajama_product_stock st
    WHERE st.product_id = p.id AND st.size = s.size
  );