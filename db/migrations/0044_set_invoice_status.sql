-- Lets staff set an invoice's stored status by hand (Draft / Sent / Cancelled), for companies that text the invoice instead of emailing it.
-- Going back to Draft or to Cancelled is refused once payments exist; Sent needs at least one line.
create or replace function public.set_invoice_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  if p_status not in ('draft','sent','void') then raise exception 'invalid status' using errcode = '22023'; end if;
  select * into i from public.invoices where id = p_id for update;
  if not found or not public.has_role(i.tenant_id, array['owner','admin','office_staff']) then raise exception 'not found' using errcode = '42501'; end if;
  if i.status = p_status then return; end if;
  if p_status in ('draft','void') and exists (select 1 from public.payments where invoice_id = p_id) then raise exception 'has payments' using errcode = '22023'; end if;
  if p_status = 'sent' and not exists (select 1 from public.invoice_lines where invoice_id = p_id) then raise exception 'no lines' using errcode = '22023'; end if;
  update public.invoices set
    status = p_status,
    sent_at   = case when p_status = 'sent' then coalesce(sent_at, now()) when p_status = 'draft' then null else sent_at end,
    voided_at = case when p_status = 'void' then now() else null end
  where id = p_id;
end $$;
revoke all on function public.set_invoice_status(uuid, text) from public, anon;
grant execute on function public.set_invoice_status(uuid, text) to authenticated;
