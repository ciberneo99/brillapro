-- Quote editor: save the whole draft (header, options in order, extra lines in order) in one transaction.
--   p_header keys: customer_id, title, service_type_id, issue_date, expires_on, discount_cents, tax_rate, notes, terms.
--   p_options: array of {name, description, base_price_cents}; p_lines: array of {description, quantity, unit_price_cents}.
create or replace function public.save_quote_draft(p_id uuid, p_header jsonb, p_options jsonb, p_lines jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
  cust uuid := nullif(p_header->>'customer_id', '')::uuid;
  svc uuid := nullif(p_header->>'service_type_id', '')::uuid;
begin
  select * into q from public.quotes where id = p_id;
  if not found or not public.has_role(q.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if q.status <> 'draft' then raise exception 'only drafts can be edited' using errcode = '22023'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) > 12
     or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 100 then
    raise exception 'invalid items' using errcode = '22023';
  end if;
  if cust is not null and not exists (select 1 from public.customers c where c.id = cust and c.tenant_id = q.tenant_id) then
    raise exception 'customer not found' using errcode = '22023';
  end if;
  if svc is not null and not exists (select 1 from public.service_types s where s.id = svc and s.tenant_id = q.tenant_id) then
    raise exception 'service not found' using errcode = '22023';
  end if;

  update public.quotes set
    customer_id     = coalesce(cust, customer_id),
    service_type_id = svc,
    title           = nullif(btrim(coalesce(p_header->>'title', '')), ''),
    issue_date      = (p_header->>'issue_date')::date,
    expires_on      = (p_header->>'expires_on')::date,
    discount_cents  = coalesce((p_header->>'discount_cents')::int, 0),
    tax_rate        = coalesce((p_header->>'tax_rate')::numeric, 0),
    notes           = nullif(btrim(coalesce(p_header->>'notes', '')), ''),
    terms           = nullif(btrim(coalesce(p_header->>'terms', '')), '')
  where id = p_id;

  delete from public.quote_options where quote_id = p_id and tenant_id = q.tenant_id;
  insert into public.quote_options (tenant_id, quote_id, name, description, base_price_cents, position)
  select q.tenant_id, p_id, btrim(e.value->>'name'), nullif(btrim(coalesce(e.value->>'description', '')), ''),
         (e.value->>'base_price_cents')::int, (e.ord - 1)::int
  from jsonb_array_elements(p_options) with ordinality as e(value, ord);

  delete from public.quote_lines where quote_id = p_id and tenant_id = q.tenant_id;
  insert into public.quote_lines (tenant_id, quote_id, description, quantity, unit_price_cents, position)
  select q.tenant_id, p_id, btrim(e.value->>'description'), (e.value->>'quantity')::numeric, (e.value->>'unit_price_cents')::int, (e.ord - 1)::int
  from jsonb_array_elements(p_lines) with ordinality as e(value, ord);
end;
$$;
revoke all on function public.save_quote_draft(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_draft(uuid, jsonb, jsonb, jsonb) to authenticated;
