-- Two public plans. Starter: $39/month, 1 person, 50 customers, basic reports. Pro: $79/month, 10 people, no customer cap.
-- Mirrors src/lib/plans.ts. The old 'business' row is left in place (companies may still point at it) but is no longer offered.

insert into public.plans (id, name, price_monthly_cents, price_yearly_cents, limits) values
  ('starter', 'Starter', 3900, 39000, '{"max_users": 1, "max_customers": 50}'),
  ('pro',     'Pro',     7900, 79000, '{"max_users": 10}')
on conflict (id) do update
  set name = excluded.name, price_monthly_cents = excluded.price_monthly_cents,
      price_yearly_cents = excluded.price_yearly_cents, limits = excluded.limits;

-- Usage now includes customers (those not archived).
drop function if exists public.tenant_usage(uuid);
create function public.tenant_usage(p_tenant uuid) returns table (users integer, max_users integer, customers integer, max_customers integer)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::integer from public.memberships m where m.tenant_id = p_tenant and m.status = 'active'),
         public.tenant_plan_limit(p_tenant, 'max_users'),
         (select count(*)::integer from public.customers c where c.tenant_id = p_tenant and c.status <> 'archived'),
         public.tenant_plan_limit(p_tenant, 'max_customers')
  where public.is_member(p_tenant)
$$;
revoke all on function public.tenant_usage(uuid) from public, anon;
grant execute on function public.tenant_usage(uuid) to authenticated;

-- A company can't have more active customers than its plan allows (new customers, or restoring an archived one).
create or replace function public.customers_check_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim integer; used integer;
begin
  if new.status = 'archived' then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'archived' then return new; end if;
  perform 1 from public.tenants where id = new.tenant_id for update;
  lim := public.tenant_plan_limit(new.tenant_id, 'max_customers');
  if lim is null then return new; end if;
  select count(*) into used from public.customers where tenant_id = new.tenant_id and status <> 'archived' and id is distinct from new.id;
  if used >= lim then raise exception 'plan customer limit reached' using errcode = '23514'; end if;
  return new;
end $$;
create trigger customers_limit before insert or update of status on public.customers
  for each row execute function public.customers_check_limit();
