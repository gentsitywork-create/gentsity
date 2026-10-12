-- লাইভ ভিজিটর ট্র্যাকিং: প্রতি ভিজিটর সেশনে একটি সারি, heartbeat-এ last_seen আপডেট হয়
CREATE TABLE public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL UNIQUE,
  path text NOT NULL DEFAULT '/',
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_visits_last_seen_idx ON public.site_visits (last_seen);

GRANT ALL ON public.site_visits TO service_role;
GRANT SELECT ON public.site_visits TO authenticated;

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- অ্যাডমিন/স্টাফ লাইভ ভিজিটর দেখতে পারবেন (হার্টবিট সার্ভার রুট দিয়ে যায়, তাই anon-এর দরকার নেই)
CREATE POLICY "Admins and staff can view site visits"
ON public.site_visits
FOR SELECT
TO authenticated
USING (
  (select public.has_role((select auth.uid()), 'admin'::public.app_role))
  OR (select public.has_role((select auth.uid()), 'staff'::public.app_role))
);