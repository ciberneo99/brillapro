-- BrillaPro · Migration 0001 · Foundation (Phase 1)
-- Multi-tenant core: tenants, profiles, memberships, settings, audit, plans, subscriptions.
-- Isolation: tenant_id on every business table + Row Level Security.
-- Target: Supabase Postgres (uses auth.uid() and the `authenticated` role).

begin;

-- ───────── helpers ─────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────── tables ─────────
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  status      text not null default 'active' check (status in ('active','suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  locale      text not null default 'en' check (locale in ('en','es')),
  theme       text not null default 'system' check (theme in ('light','dark','system')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('owner','admin','manager','office_staff','employee','accountant')),
  status      text not null default 'active' check (status in ('active','disabled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id) where status = 'active';

create table public.tenant_settings (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  currency      text not null default 'USD' check (char_length(currency) = 3),
  timezone      text not null default 'America/New_York',
  date_format   text not null default 'MM/DD/YYYY' check (date_format in ('MM/DD/YYYY','DD/MM/YYYY','YYYY-MM-DD')),
  number_format text not null default 'en-US',
  doc_locale    text not null default 'en' check (doc_locale in ('en','es')),
  phone         text,
  email         text,
  address       text,
  tax_id        text,
  logo_path     text,
  updated_at    timestamptz not null default now()
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid references public.tenants(id) on delete set null,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_tenant_idx on public.audit_log(tenant_id, created_at desc);

create table public.plans (
  id                   text primary key,
  name                 text not null,
  price_monthly_cents  integer check (price_monthly_cents >= 0),
  price_yearly_cents   integer check (price_yearly_cents >= 0),
  limits               jsonb not null default '{}'::jsonb,
  active               boolean not null default true
);

create table public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null unique references public.tenants(id) on delete cascade,
  plan_id             text not null references public.plans(id),
  status              text not null check (status in ('trialing','active','past_due','canceled','suspended')),
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Platform-level admins (Super Admin). No policies: only service role can touch it.
create table public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create trigger tenants_updated        before update on public.tenants        for each row execute function public.set_updated_at();
create trigger profiles_updated       before update on public.profiles       for each row execute function public.set_updated_at();
create trigger memberships_updated    before update on public.memberships    for each row execute function public.set_updated_at();
create trigger tenant_settings_upd    before update on public.tenant_settings for each row execute function public.set_updated_at();
create trigger subscriptions_updated  before update on public.subscriptions  for each row execute function public.set_updated_at();

-- ───────── authorization helpers (SECURITY DEFINER avoids RLS recursion) ─────────
create or replace function public.is_member(tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = tid and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create or replace function public.has_role(tid uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = tid and m.user_id = auth.uid() and m.status = 'active' and m.role = any(roles)
  )
$$;

create or replace function public.shares_tenant(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = uid
  )
$$;

-- ───────── Row Level Security ─────────
alter table public.tenants          enable row level security;
alter table public.profiles         enable row level security;
alter table public.memberships      enable row level security;
alter table public.tenant_settings  enable row level security;
alter table public.audit_log        enable row level security;
alter table public.plans            enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.platform_admins  enable row level security;

-- tenants
create policy tenants_select on public.tenants for select to authenticated using (public.is_member(id));
create policy tenants_update on public.tenants for update to authenticated
  using (public.has_role(id, array['owner','admin'])) with check (public.has_role(id, array['owner','admin']));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_tenant(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships (admins cannot grant or remove the owner role)
create policy memberships_select on public.memberships for select to authenticated using (public.is_member(tenant_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']) and (role <> 'owner' or public.has_role(tenant_id, array['owner'])));
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin']) and (role <> 'owner' or public.has_role(tenant_id, array['owner'])))
  with check (public.has_role(tenant_id, array['owner','admin']) and (role <> 'owner' or public.has_role(tenant_id, array['owner'])));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin']) and (role <> 'owner' or public.has_role(tenant_id, array['owner'])));

-- tenant_settings
create policy settings_select on public.tenant_settings for select to authenticated using (public.is_member(tenant_id));
create policy settings_update on public.tenant_settings for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin'])) with check (public.has_role(tenant_id, array['owner','admin']));

-- audit_log: readable by owner/admin; append-only and only as yourself
create policy audit_select on public.audit_log for select to authenticated
  using (tenant_id is not null and public.has_role(tenant_id, array['owner','admin']));
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor_id = auth.uid() and tenant_id is not null and public.is_member(tenant_id));

-- plans: readable by any signed-in user; written by service role only
create policy plans_select on public.plans for select to authenticated using (active);

-- subscriptions: members can read; writes only via service role / security definer
create policy subscriptions_select on public.subscriptions for select to authenticated using (public.is_member(tenant_id));

-- ───────── grants: never anon; authenticated gets only what policies allow ─────────
revoke all on all tables in schema public from anon;
revoke all on public.platform_admins from authenticated;
revoke insert, delete on public.tenants, public.tenant_settings, public.subscriptions, public.plans from authenticated;
revoke update on public.subscriptions, public.plans from authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke update on public.audit_log from authenticated;
revoke delete on public.audit_log from authenticated;
-- column-level: users may only change their own preference columns
revoke update on public.profiles from authenticated;
grant update (full_name, locale, theme) on public.profiles to authenticated;
revoke update on public.memberships from authenticated;
grant update (role, status) on public.memberships to authenticated;
revoke update on public.tenants from authenticated;
grant update (name) on public.tenants to authenticated;

-- ───────── seed ─────────
insert into public.plans (id, name, price_monthly_cents, price_yearly_cents, limits)
values ('trial', 'Free trial', 0, 0, '{}'::jsonb);

-- ───────── onboarding: create a company for the signed-in user (single transaction) ─────────
create or replace function public.create_tenant(p_name text, p_locale text default 'en') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  uemail text;
  uname text;
  tid uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 then
    raise exception 'invalid company name' using errcode = '22023';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', '') into uemail, uname
  from auth.users where id = uid;

  insert into public.profiles (id, email, full_name, locale)
  values (uid, coalesce(uemail, ''), coalesce(uname, ''), case when p_locale in ('en','es') then p_locale else 'en' end)
  on conflict (id) do nothing;

  insert into public.tenants (name) values (btrim(p_name)) returning id into tid;
  insert into public.memberships (tenant_id, user_id, role) values (tid, uid, 'owner');
  insert into public.tenant_settings (tenant_id) values (tid);
  insert into public.subscriptions (tenant_id, plan_id, status, trial_ends_at)
  values (tid, 'trial', 'trialing', now() + interval '14 days');
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id)
  values (tid, uid, 'tenant.created', 'tenant', tid::text);

  return tid;
end $$;

revoke all on function public.create_tenant(text, text) from public, anon;
grant execute on function public.create_tenant(text, text) to authenticated;
revoke all on function public.is_member(uuid), public.has_role(uuid, text[]), public.shares_tenant(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.has_role(uuid, text[]), public.shares_tenant(uuid) to authenticated;

commit;
