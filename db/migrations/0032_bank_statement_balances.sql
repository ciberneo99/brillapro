-- Each imported statement keeps the bank's own previous (beginning) and ending balance, so reports can start from the
-- bank's figure and be checked against it. One statement per period (a company with several accounts is not modelled yet).

create table public.bank_statements (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  period_start           date not null,
  period_end             date not null,
  beginning_balance_cents bigint,
  ending_balance_cents   bigint,
  source                 text check (source is null or char_length(source) <= 200),
  created_by             uuid references public.profiles(id),
  created_at             timestamptz not null default now(),
  check (period_end >= period_start),
  check (beginning_balance_cents is not null or ending_balance_cents is not null),
  unique (tenant_id, period_start, period_end)
);
alter table public.bank_statements enable row level security;
create policy bank_statements_select on public.bank_statements for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','accountant']));
create policy bank_statements_insert on public.bank_statements for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']) and created_by = (select auth.uid()));
create policy bank_statements_update on public.bank_statements for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin'])) with check (public.has_role(tenant_id, array['owner','admin']));
create policy bank_statements_delete on public.bank_statements for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin']));
grant select, insert, update, delete on public.bank_statements to authenticated;
revoke all on public.bank_statements from anon;
