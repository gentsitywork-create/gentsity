CREATE INDEX IF NOT EXISTS idx_site_visits_created_at ON public.site_visits(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created_id ON public.orders(created_at DESC,id);
CREATE OR REPLACE FUNCTION public.admin_dashboard_summary_v1() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH day AS (SELECT date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka' AS start_at),
visits AS (SELECT path, count(*) AS n FROM public.site_visits, day WHERE created_at >= day.start_at GROUP BY path),
live AS (SELECT path, count(*) AS n FROM public.site_visits WHERE last_seen > now() - interval '2 minutes' GROUP BY path),
today_orders AS (SELECT count(*) AS n, coalesce(sum(total_amount),0) AS sales FROM public.orders, day WHERE created_at >= day.start_at AND status <> 'cancelled'),
abandoned AS (SELECT count(*) AS n FROM public.abandoned_carts, day WHERE created_at >= day.start_at AND order_id IS NULL)
SELECT jsonb_build_object('visitors',coalesce((SELECT sum(n) FROM visits),0),'orders',(SELECT n FROM today_orders),'sales',(SELECT sales FROM today_orders),'left',(SELECT n FROM abandoned),'byPath',coalesce((SELECT jsonb_object_agg(path,n) FROM visits),'{}'::jsonb),'liveByPath',coalesce((SELECT jsonb_object_agg(path,n) FROM live),'{}'::jsonb))
WHERE public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR public.has_role((SELECT auth.uid()), 'staff'::public.app_role);
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_summary_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_summary_v1() TO authenticated, service_role;