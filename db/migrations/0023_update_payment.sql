-- Edit a recorded payment (owner/admin only, like deleting one). The new amount can't push the paid total above the invoice total.
create or replace function public.update_payment(p_id uuid, p_amount integer, p_date date, p_method text, p_reference text, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare pay public.payments; i public.invoices; t record; others bigint;
begin
  select * into pay from public.payments where id = p_id;
  if not found or not public.has_role(pay.tenant_id, array['owner','admin']) then raise exception 'not found' using errcode = '42501'; end if;
  select * into i from public.invoices where id = pay.invoice_id for update;
  if i.status <> 'sent' then raise exception 'invoice not open' using errcode = '22023'; end if;
  select * into t from public.invoice_totals(i.id);
  others := t.paid_cents - pay.amount_cents;
  if p_amount <= 0 or others + p_amount > t.total_cents then raise exception 'amount exceeds balance' using errcode = '22023'; end if;
  update public.payments set amount_cents = p_amount, paid_on = p_date, method = p_method,
    reference = nullif(btrim(p_reference), ''), notes = nullif(btrim(p_notes), '') where id = p_id;
end $$;
revoke all on function public.update_payment(uuid, integer, date, text, text, text) from public, anon;
grant execute on function public.update_payment(uuid, integer, date, text, text, text) to authenticated;
