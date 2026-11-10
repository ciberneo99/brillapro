-- Phase 9b: plans with limits. Every plan has every feature; they differ by how many people can sign in.
-- Prices here mirror src/lib/plans.ts (draft pricing; Stripe arrives in a later step).

insert into public.plans (id, name, price_monthly_cents, price_yearly_cents, limits) values
  ('starter',  'Starter',  1900,  19000, '{"max_users": 3}'),
  ('pro',      'Pro',      3900,  39000, '{"max_users": 10}'),
  ('business', 'Business', 7900,  79000, '{"max_users": 25}')
on conflict (id) do update
  set name = excluded.name, price_monthly_cents = excluded.price_monthly_cents,
      price_yearly_cents = excluded.price_yearly_cents, limits = excluded.limits;

-- The free trial allows as many people as the Pro plan.
update public.plans set limits = '{"max_users": 10}' where id = 'trial';

-- Numeric limit of the company's plan, or null when the plan has none.
create or replace function public.tenant_plan_limit(p_tenant uuid, p_key text) returns integer
language sql stable security definer set search_path = '' as $$
  select (p.limits ->> p_key)::integer
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant
$$;
revoke all on function public.tenant_plan_limit(uuid, text) from public, anon, authenticated;

-- People with an active login in the company.
create or replace function public.tenant_usage(p_tenant uuid) returns table (users integer, max_users integer)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::integer from public.memberships m where m.tenant_id = p_tenant and m.status = 'active'),
         public.tenant_plan_limit(p_tenant, 'max_users')
  where public.is_member(p_tenant)
$$;
revoke all on function public.tenant_usage(uuid) from public, anon;
grant execute on function public.tenant_usage(uuid) to authenticated;

-- A company can't add active people beyond its plan. Locks the tenant row so two simultaneous additions can't both pass.
create or replace function public.memberships_check_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim integer; used integer;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  perform 1 from public.tenants where id = new.tenant_id for update;
  lim := public.tenant_plan_limit(new.tenant_id, 'max_users');
  if lim is null then return new; end if;
  select count(*) into used from public.memberships where tenant_id = new.tenant_id and status = 'active' and id is distinct from new.id;
  if used >= lim then raise exception 'plan user limit reached' using errcode = '23514'; end if;
  return new;
end $$;
create trigger memberships_limit before insert or update of status on public.memberships
  for each row execute function public.memberships_check_limit();
