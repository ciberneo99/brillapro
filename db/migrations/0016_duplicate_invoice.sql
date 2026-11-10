-- Duplicate an invoice as a new draft (for repeat customers billed the same amount every week).
-- Copies lines, discount, tax and notes. Dates restart from today, the number is the next in sequence,
-- and it is not tied to the original job or quote (one active invoice per job stays enforced).
create or replace function public.duplicate_invoice(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.invoices; c public.customers; s public.tenant_settings; nid uuid;
begin
  select * into i from public.invoices where id = p_id;
  if not found or not public.has_role(i.tenant_id, array['owner','admin','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  select * into c from public.customers where id = i.customer_id;
  select * into s from public.tenant_settings where tenant_id = i.tenant_id;

  insert into public.invoices (tenant_id, customer_id, issue_date, due_date, customer_name, customer_email, billing_address,
                               discount_cents, tax_rate, notes, terms, created_by)
  values (i.tenant_id, i.customer_id, current_date, current_date + s.invoice_due_days, i.customer_name,
          coalesce(c.email, i.customer_email),
          coalesce(nullif(btrim(concat_ws(', ', coalesce(c.billing_address, c.service_address), c.city, concat_ws(' ', c.state, c.zip_code))), ''), i.billing_address),
          i.discount_cents, i.tax_rate, i.notes, coalesce(s.invoice_terms, i.terms), auth.uid())
  returning id into nid;

  insert into public.invoice_lines (tenant_id, invoice_id, description, quantity, unit_price_cents, position)
    select tenant_id, nid, description, quantity, unit_price_cents, position from public.invoice_lines where invoice_id = p_id;
  return nid;
end $$;

revoke all on function public.duplicate_invoice(uuid) from public, anon;
grant execute on function public.duplicate_invoice(uuid) to authenticated;
