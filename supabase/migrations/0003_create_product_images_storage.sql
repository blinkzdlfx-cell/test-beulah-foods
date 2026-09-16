-- Beulah Foods staging reconstruction: product image storage.
-- Product images are public for storefront delivery; writes are restricted to admins.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view product images" on storage.objects;
drop policy if exists "Admins can upload product images" on storage.objects;
drop policy if exists "Admins can update product images" on storage.objects;
drop policy if exists "Admins can delete product images" on storage.objects;

create policy "Public can view product images"
on storage.objects
for select
to public
using (bucket_id = 'product-images');

create policy "Admins can upload product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
);

create policy "Admins can update product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
)
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
);

create policy "Admins can delete product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
);
