-- The customer's phone is a snapshot on the invoice, like the name, email and address: an issued invoice never changes if the customer is edited later.
-- A draft follows its customer until it is issued; from then on the number is frozen.
alter table public.invoices add column customer_phone text;

create or replace function public.invoices_snapshot_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or old.status = 'draft' then
    select nullif(btrim(c.phone), '') into new.customer_phone
    from public.customers c where c.tenant_id = new.tenant_id and c.id = new.customer_id;
  else
    new.customer_phone := old.customer_phone;
  end if;
  return new;
end;
$$;
revoke all on function public.invoices_snapshot_phone() from public, anon, authenticated;

create trigger invoices_snapshot_phone before insert or update on public.invoices
  for each row execute function public.invoices_snapshot_phone();

-- Existing invoices get the phone the customer has today (the best information available).
update public.invoices i set customer_phone = nullif(btrim(c.phone), '')
from public.customers c where c.tenant_id = i.tenant_id and c.id = i.customer_id and i.customer_phone is null;
