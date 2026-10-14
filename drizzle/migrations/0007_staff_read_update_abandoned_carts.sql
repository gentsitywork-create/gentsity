CREATE POLICY "Staff can view and update abandoned carts"
ON public.abandoned_carts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff can update abandoned carts"
ON public.abandoned_carts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'staff'))
WITH CHECK (public.has_role(auth.uid(), 'staff'));