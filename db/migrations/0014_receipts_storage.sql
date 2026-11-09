-- Private storage for expense receipts. Files live under "<tenant_id>/<expense_id>/<file>", so access follows the company.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- First path segment as a company id (null when it isn't a uuid, so a bad path matches nothing).
create or replace function public.storage_tenant(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;
grant execute on function public.storage_tenant(text) to authenticated;

create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.has_role(public.storage_tenant(name), array['owner','admin','office_staff','accountant']));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.has_role(public.storage_tenant(name), array['owner','admin','office_staff']));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.has_role(public.storage_tenant(name), array['owner','admin','office_staff']));
