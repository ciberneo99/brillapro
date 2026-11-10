-- Invoice editor: company logo storage + one atomic "save the whole draft" function.

-- 1) Private bucket for company logos. Files live under "<tenant_id>/<file>"; every member may read, owner/admin may change.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy logos_select on storage.objects for select to authenticated
  using (bucket_id = 'logos' and public.is_member(public.storage_tenant(name)));
create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.has_role(public.storage_tenant(name), array['owner','admin']));
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.has_role(public.storage_tenant(name), array['owner','admin']));

-- 2) Save a draft invoice (header + all lines, in the order given) in one transaction.
--    p_header keys: customer_id, customer_name, customer_email, billing_address, issue_date, due_date, discount_cents, tax_rate, notes, terms.
--    p_lines: array of {description, quantity, unit_price_cents}; position = array order.
create or replace function public.save_invoice_draft(p_id uuid, p_header jsonb, p_lines jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invoices;
  cust uuid := nullif(p_header->>'customer_id', '')::uuid;
  n int;
begin
  select * into inv from public.invoices where id = p_id;
  if not found or not public.has_role(inv.tenant_id, array['owner','admin','office_staff']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if inv.status <> 'draft' then raise exception 'only drafts can be edited' using errcode = '22023'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 100 then raise exception 'invalid lines' using errcode = '22023'; end if;
  if cust is not null and not exists (select 1 from public.customers c where c.id = cust and c.tenant_id = inv.tenant_id) then
    raise exception 'customer not found' using errcode = '22023';
  end if;

  update public.invoices set
    customer_id     = coalesce(cust, customer_id),
    customer_name   = btrim(p_header->>'customer_name'),
    customer_email  = nullif(btrim(coalesce(p_header->>'customer_email', '')), ''),
    billing_address = nullif(btrim(coalesce(p_header->>'billing_address', '')), ''),
    issue_date      = (p_header->>'issue_date')::date,
    due_date        = (p_header->>'due_date')::date,
    discount_cents  = coalesce((p_header->>'discount_cents')::int, 0),
    tax_rate        = coalesce((p_header->>'tax_rate')::numeric, 0),
    notes           = nullif(btrim(coalesce(p_header->>'notes', '')), ''),
    terms           = nullif(btrim(coalesce(p_header->>'terms', '')), '')
  where id = p_id;

  delete from public.invoice_lines where invoice_id = p_id and tenant_id = inv.tenant_id;
  insert into public.invoice_lines (tenant_id, invoice_id, description, quantity, unit_price_cents, position)
  select inv.tenant_id, p_id, btrim(e.value->>'description'), (e.value->>'quantity')::numeric, (e.value->>'unit_price_cents')::int, (e.ord - 1)::int
  from jsonb_array_elements(p_lines) with ordinality as e(value, ord);

  get diagnostics n = row_count;
end;
$$;
revoke all on function public.save_invoice_draft(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_invoice_draft(uuid, jsonb, jsonb) to authenticated;
