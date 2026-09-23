alter table public.pajama_products add column if not exists page text not null default 'pajama';

alter table public.pajama_product_stock drop constraint pajama_product_stock_size_check;
alter table public.pajama_product_stock add constraint pajama_product_stock_size_check check (size = any (array['M','L','XL','XXL','40','41','42','43','44']));

insert into public.pajama_products (name, product_kind, pieces_per_unit, price, image_url, sort_order, page) values
  ('প্রিমিয়াম স্নিকার্স — ডিজাইন ১', 'single', 1, 1250, 'sneakers/sneaker-1.png', 1, 'sneakers'),
  ('প্রিমিয়াম স্নিকার্স — ডিজাইন ২', 'single', 1, 1250, 'sneakers/sneaker-2.png', 2, 'sneakers'),
  ('প্রিমিয়াম স্নিকার্স — ডিজাইন ৩', 'single', 1, 1250, 'sneakers/sneaker-3.jpg', 3, 'sneakers'),
  ('প্রিমিয়াম স্নিকার্স — ডিজাইন ৪', 'single', 1, 1250, 'sneakers/sneaker-4.jpg', 4, 'sneakers');

insert into public.pajama_product_stock (product_id, size, stock)
select p.id, s.size, 50
from public.pajama_products p
cross join (values ('40'), ('41'), ('42'), ('43'), ('44')) as s(size)
where p.page = 'sneakers';

insert into public.settings (key, value) values
  ('sneakers_delivery_charge_dhaka', '80'),
  ('sneakers_delivery_charge_outside', '130')
on conflict (key) do nothing;

drop policy if exists "settings public read" on public.settings;
create policy "settings public read" on public.settings for select to anon, authenticated
using (has_role(auth.uid(), 'admin'::app_role) or key = any (array['combo_price','combo_qty','fb_pixel_id','logo_path','pajama_delivery_charge_dhaka','pajama_delivery_charge_outside','sneakers_delivery_charge_dhaka','sneakers_delivery_charge_outside']));