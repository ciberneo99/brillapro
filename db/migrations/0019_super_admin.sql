-- Phase 9d: Super Admin. Platform staff see company-level counts and status only (never customers, money or documents)
-- and every change they make is written to the audit log of the affected company.

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- A suspended company is locked out: membership checks (and therefore every RLS policy) fail for it.
create or replace function public.is_member(tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = tid and m.user_id = auth.uid() and m.status = 'active' and t.status = 'active'
  )
$$;
create or replace function public.has_role(tid uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = tid and m.user_id = auth.uid() and m.status = 'active' and m.role = any(roles) and t.status = 'active'
  )
$$;

-- True when the signed-in user belongs to a suspended company (so the app can explain instead of asking to create one).
create or replace function public.my_company_suspended() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.tenants t on t.id = m.tenant_id
    where m.user_id = auth.uid() and m.status = 'active' and t.status = 'suspended'
  )
$$;
revoke all on function public.my_company_suspended() from public, anon;
grant execute on function public.my_company_suspended() to authenticated;

create or replace function public.platform_companies()
returns table (id uuid, name text, created_at timestamptz, status text, plan_id text, sub_status text,
               trial_ends_at timestamptz, users integer, customers integer, jobs integer, invoices integer, owner_email text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.created_at, t.status, s.plan_id, s.status, s.trial_ends_at,
         (select count(*)::integer from public.memberships m where m.tenant_id = t.id and m.status = 'active'),
         (select count(*)::integer from public.customers c where c.tenant_id = t.id),
         (select count(*)::integer from public.jobs j where j.tenant_id = t.id),
         (select count(*)::integer from public.invoices i where i.tenant_id = t.id),
         (select p.email from public.memberships m join public.profiles p on p.id = m.user_id
           where m.tenant_id = t.id and m.role = 'owner' order by m.created_at limit 1)
  from public.tenants t left join public.subscriptions s on s.tenant_id = t.id
  where public.is_platform_admin()
  order by t.created_at desc
$$;
revoke all on function public.platform_companies() from public, anon;
grant execute on function public.platform_companies() to authenticated;

create or replace function public.platform_set_company_status(p_tenant uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'invalid status' using errcode = '22023'; end if;
  update public.tenants set status = p_status where id = p_tenant;
  if not found then raise exception 'company not found' using errcode = 'P0002'; end if;
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, metadata)
    values (p_tenant, auth.uid(), 'platform.company_' || p_status, 'tenant', p_tenant::text, jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)));
end $$;

create or replace function public.platform_set_plan(p_tenant uuid, p_plan text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('trialing','active','past_due','canceled','suspended') then raise exception 'invalid status' using errcode = '22023'; end if;
  update public.subscriptions set plan_id = p_plan, status = p_status where tenant_id = p_tenant;
  if not found then raise exception 'company not found' using errcode = 'P0002'; end if;
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, metadata)
    values (p_tenant, auth.uid(), 'platform.plan_changed', 'subscription', p_tenant::text, jsonb_build_object('plan', p_plan, 'status', p_status));
end $$;

create or replace function public.platform_extend_trial(p_tenant uuid, p_days integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_days < 1 or p_days > 90 then raise exception 'invalid days' using errcode = '22023'; end if;
  update public.subscriptions
     set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days), status = 'trialing'
   where tenant_id = p_tenant and status in ('trialing','canceled','past_due');
  if not found then raise exception 'company not found' using errcode = 'P0002'; end if;
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, metadata)
    values (p_tenant, auth.uid(), 'platform.trial_extended', 'subscription', p_tenant::text, jsonb_build_object('days', p_days));
end $$;

revoke all on function public.platform_set_company_status(uuid, text, text), public.platform_set_plan(uuid, text, text),
  public.platform_extend_trial(uuid, integer) from public, anon;
grant execute on function public.platform_set_company_status(uuid, text, text), public.platform_set_plan(uuid, text, text),
  public.platform_extend_trial(uuid, integer) to authenticated;
