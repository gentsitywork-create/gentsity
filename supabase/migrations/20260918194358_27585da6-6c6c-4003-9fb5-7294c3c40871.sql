DROP POLICY "Active pajama products public read" ON public.pajama_products;
CREATE POLICY "Active pajama products public read" ON public.pajama_products
  FOR SELECT TO anon USING (is_active);
CREATE POLICY "Active pajama products authenticated read" ON public.pajama_products
  FOR SELECT TO authenticated USING (is_active);