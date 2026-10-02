CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

ALTER POLICY "admins manage orders" ON public.orders USING ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
ALTER POLICY "Staff can view orders" ON public.orders USING ((select public.has_role((select auth.uid()), 'staff'::public.app_role)));
ALTER POLICY "Staff can update orders" ON public.orders USING ((select public.has_role((select auth.uid()), 'staff'::public.app_role)));
ALTER POLICY "admins manage order items" ON public.order_items USING ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
ALTER POLICY "Staff can manage order items" ON public.order_items USING ((select public.has_role((select auth.uid()), 'staff'::public.app_role)));
ANALYZE public.orders; ANALYZE public.order_items;