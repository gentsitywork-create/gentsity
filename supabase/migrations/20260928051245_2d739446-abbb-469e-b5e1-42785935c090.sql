DROP POLICY IF EXISTS "staff manage variants" ON public.product_variants;
DROP POLICY IF EXISTS "staff manage pajama products" ON public.pajama_products;
DROP POLICY IF EXISTS "staff manage pajama stock" ON public.pajama_product_stock;

CREATE POLICY "staff read variants" ON public.product_variants
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'staff'));

CREATE POLICY "staff read pajama products" ON public.pajama_products
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'staff'));

CREATE POLICY "staff read pajama stock" ON public.pajama_product_stock
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'staff'));