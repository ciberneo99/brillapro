-- Accountants may add and remove receipt files only inside the bank folder ("<company>/bank/..."), not in expense folders.
drop policy receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (
    public.has_role(public.storage_tenant(name), array['owner','admin','office_staff'])
    or (split_part(name, '/', 2) = 'bank' and public.has_role(public.storage_tenant(name), array['accountant']))
  ));
drop policy receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (
    public.has_role(public.storage_tenant(name), array['owner','admin','office_staff'])
    or (split_part(name, '/', 2) = 'bank' and public.has_role(public.storage_tenant(name), array['accountant']))
  ));
