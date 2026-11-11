-- Report hub: each person's starred reports, and the sales tax report function.

create table public.report_favorites (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  report_key text not null check (report_key ~ '^[a-z_]{2,40}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id, report_key)
);
alter table public.report_favorites enable row level security;
-- Private to the person who starred it, and only inside a company they belong to.
create policy report_favorites_select on public.report_favorites for select to authenticated
  using (user_id = (select auth.uid()) and public.is_member(tenant_id));
create policy report_favorites_insert on public.report_favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(tenant_id));
create policy report_favorites_delete on public.report_favorites for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_member(tenant_id));
grant select, insert, delete on public.report_favorites to authenticated;
revoke all on public.report_favorites from anon;

-- Sales tax by invoice (sent invoices issued in the period). Runs as the caller, so row security applies.
create or replace function public.report_sales_tax(p_from date, p_to date)
returns table (invoice_id uuid, number integer, issue_date date, customer_name text, taxable_cents bigint, tax_rate numeric, tax_cents bigint, total_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select i.id, i.number, i.issue_date, i.customer_name,
         (t.subtotal_cents - t.discount_cents)::bigint, i.tax_rate, t.tax_cents, t.total_cents
  from public.invoices i
  cross join lateral public.invoice_totals(i.id) t
  where i.status = 'sent' and i.issue_date between p_from and p_to
  order by i.issue_date, i.number
$$;
revoke all on function public.report_sales_tax(date, date) from public, anon;
grant execute on function public.report_sales_tax(date, date) to authenticated;
