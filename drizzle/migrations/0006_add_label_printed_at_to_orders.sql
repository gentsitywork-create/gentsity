ALTER TABLE public.orders ADD COLUMN label_printed_at timestamptz;
COMMENT ON COLUMN public.orders.label_printed_at IS 'কুরিয়ার লেবেল কখন প্রিন্ট করা হয়েছে — প্রিন্ট বাকি অর্ডার আলাদা করতে';