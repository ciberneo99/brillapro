-- BrillaPro · Migration 0002 · Customers & prospects (Phase 2)
-- customers (status prospect|active|inactive|archived), customer_events (history, trigger-written),
-- public quote-request intake, atomic prospect → customer conversion.

begin;

-- ───────── tenants: public intake link ─────────
alter table public.tenants
  add column public_slug text unique,
  add column accepts_requests boolean not null default true;

-- Slug for existing and new tenants: url-safe name + random suffix (unguessable enough, readable).
create or replace function public.make_slug(p_name text) returns text
language sql volatile set search_path = '' as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')), ''), 'company')
         || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
$$;

update public.tenants set public_slug = public.make_slug(name) where public_slug is null;
alter table public.tenants alter column public_slug set not null;
alter table public.tenants alter column public_slug set default public.make_slug('company');

create or replace function public.tenants_set_slug() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.public_slug is null or new.public_slug = '' then
    new.public_slug := public.make_slug(new.name);
  end if;
  return new;
end $$;
create trigger tenants_slug before insert on public.tenants for each row execute function public.tenants_set_slug();

-- ───────── customers ─────────
create table public.customers (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  status                text not null default 'prospect' check (status in ('prospect','active','inactive','archived')),
  source                text not null default 'manual' check (source in ('manual','web_form')),
  first_name            text not null default '' check (char_length(first_name) <= 100),
  last_name             text not null default '' check (char_length(last_name) <= 100),
  company_name          text not null default '' check (char_length(company_name) <= 150),
  email                 text check (char_length(email) <= 254),
  phone                 text check (char_length(phone) <= 40),
  secondary_phone       text check (char_length(secondary_phone) <= 40),
  service_address       text check (char_length(service_address) <= 300),
  billing_address       text check (char_length(billing_address) <= 300),
  city                  text check (char_length(city) <= 100),
  state                 text check (char_length(state) <= 60),
  zip_code              text check (char_length(zip_code) <= 20),
  property_type         text check (property_type in ('house','apartment','condo','townhouse','office','commercial','other')),
  square_footage        integer check (square_footage between 1 and 1000000),
  bedrooms              smallint check (bedrooms between 0 and 50),
  bathrooms             numeric(3,1) check (bathrooms between 0 and 50),
  cleaning_frequency    text check (cleaning_frequency in ('one_time','weekly','biweekly','monthly','every_four_weeks','custom')),
  preferred_service     text check (char_length(preferred_service) <= 100),
  estimated_price_cents integer check (estimated_price_cents >= 0),
  access_instructions   text check (char_length(access_instructions) <= 2000),
  pets                  text check (char_length(pets) <= 300),
  special_instructions  text check (char_length(special_instructions) <= 2000),
  notes                 text check (char_length(notes) <= 5000),
  customer_since        date,
  converted_at          timestamptz,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- a customer needs some way to be identified
  constraint customers_has_identity check (btrim(first_name || last_name || company_name) <> ''),
  -- composite key so later tables can reference (tenant_id, id) and never cross tenants
  unique (tenant_id, id)
);
create index customers_tenant_status_idx on public.customers(tenant_id, status, created_at desc);
create index customers_tenant_email_idx  on public.customers(tenant_id, lower(email)) where email is not null;
create trigger customers_updated before update on public.customers for each row execute function public.set_updated_at();

-- ───────── customer_events (history) ─────────
create table public.customer_events (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null,
  customer_id  uuid not null,
  type         text not null check (type in ('created','updated','status_changed','converted')),
  actor_id     uuid references public.profiles(id) on delete set null,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete cascade
);
create index customer_events_idx on public.customer_events(tenant_id, customer_id, created_at desc);

-- History is written by a trigger, so it cannot be skipped or forged by the client.
create or replace function public.customers_log_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.customer_events (tenant_id, customer_id, type, actor_id, metadata)
    values (new.tenant_id, new.id, 'created', auth.uid(), jsonb_build_object('status', new.status, 'source', new.source));
  elsif new.status is distinct from old.status then
    insert into public.customer_events (tenant_id, customer_id, type, actor_id, metadata)
    values (new.tenant_id, new.id,
            case when old.status = 'prospect' and new.status = 'active' then 'converted' else 'status_changed' end,
            auth.uid(), jsonb_build_object('from', old.status, 'to', new.status));
  elsif to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    insert into public.customer_events (tenant_id, customer_id, type, actor_id)
    values (new.tenant_id, new.id, 'updated', auth.uid());
  end if;
  return new;
end $$;
create trigger customers_events after insert or update on public.customers for each row execute function public.customers_log_event();

-- ───────── RLS ─────────
alter table public.customers        enable row level security;
alter table public.customer_events  enable row level security;

-- Roles with access to customers: owner, admin, manager, office_staff (matches src/lib/permissions.ts)
create policy customers_select on public.customers for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff']) and created_by = auth.uid());
create policy customers_update on public.customers for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']))
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
-- no delete policy: customers are archived, never deleted

create policy customer_events_select on public.customer_events for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
-- no insert/update/delete policies: only the SECURITY DEFINER trigger writes history

revoke all on public.customers, public.customer_events from anon;
revoke delete on public.customers from authenticated;
revoke insert, update, delete on public.customer_events from authenticated;
-- tenant_id, id, source, created_by, created_at are immutable from the client
revoke update on public.customers from authenticated;
grant update (status, first_name, last_name, company_name, email, phone, secondary_phone, service_address,
  billing_address, city, state, zip_code, property_type, square_footage, bedrooms, bathrooms,
  cleaning_frequency, preferred_service, estimated_price_cents, access_instructions, pets,
  special_instructions, notes, customer_since) on public.customers to authenticated;

-- owners/admins may change their public link settings
grant update (accepts_requests) on public.tenants to authenticated;

-- ───────── convert prospect → active customer (same row, history kept) ─────────
create or replace function public.convert_customer(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.customers;
begin
  select * into c from public.customers where id = p_id;
  if not found or not public.has_role(c.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if c.status <> 'prospect' then
    raise exception 'only prospects can be converted' using errcode = '22023';
  end if;
  update public.customers
     set status = 'active', converted_at = now(), customer_since = coalesce(customer_since, current_date)
   where id = p_id;
end $$;
revoke all on function public.convert_customer(uuid) from public, anon;
grant execute on function public.convert_customer(uuid) to authenticated;

-- ───────── public quote-request intake (the only thing visitors can do) ─────────
create or replace function public.submit_quote_request(p_slug text, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants;
  recent integer;
  v_first text := left(btrim(coalesce(p_data->>'first_name', '')), 100);
  v_last  text := left(btrim(coalesce(p_data->>'last_name', '')), 100);
  v_company text := left(btrim(coalesce(p_data->>'company_name', '')), 150);
  v_email text := nullif(left(btrim(coalesce(p_data->>'email', '')), 254), '');
  v_phone text := nullif(left(btrim(coalesce(p_data->>'phone', '')), 40), '');
begin
  select * into t from public.tenants where public_slug = p_slug and status = 'active' and accepts_requests;
  if not found then
    raise exception 'unavailable' using errcode = 'P0002';
  end if;
  if btrim(v_first || v_last || v_company) = '' or (v_email is null and v_phone is null) then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  -- throttle: at most 30 web requests per company per 10 minutes
  select count(*) into recent from public.customers
   where tenant_id = t.id and source = 'web_form' and created_at > now() - interval '10 minutes';
  if recent >= 30 then
    raise exception 'too many requests' using errcode = '53400';
  end if;

  insert into public.customers (
    tenant_id, status, source, first_name, last_name, company_name, email, phone,
    service_address, city, state, zip_code, property_type, square_footage, bedrooms, bathrooms,
    cleaning_frequency, preferred_service, special_instructions
  ) values (
    t.id, 'prospect', 'web_form', v_first, v_last, v_company, v_email, v_phone,
    left(nullif(btrim(coalesce(p_data->>'service_address','')), ''), 300),
    left(nullif(btrim(coalesce(p_data->>'city','')), ''), 100),
    left(nullif(btrim(coalesce(p_data->>'state','')), ''), 60),
    left(nullif(btrim(coalesce(p_data->>'zip_code','')), ''), 20),
    case when p_data->>'property_type' in ('house','apartment','condo','townhouse','office','commercial','other') then p_data->>'property_type' end,
    case when p_data->>'square_footage' ~ '^\d{1,7}$' then nullif(least((p_data->>'square_footage')::int, 1000000), 0) end,
    case when p_data->>'bedrooms' ~ '^\d{1,2}$' then (p_data->>'bedrooms')::smallint end,
    case when p_data->>'bathrooms' ~ '^\d{1,2}(\.5)?$' then (p_data->>'bathrooms')::numeric end,
    case when p_data->>'cleaning_frequency' in ('one_time','weekly','biweekly','monthly','every_four_weeks','custom') then p_data->>'cleaning_frequency' end,
    left(nullif(btrim(coalesce(p_data->>'preferred_service','')), ''), 100),
    left(nullif(btrim(coalesce(p_data->>'message','')), ''), 2000)
  );
end $$;
revoke all on function public.submit_quote_request(text, jsonb) from public;
grant execute on function public.submit_quote_request(text, jsonb) to anon, authenticated;

-- Public form needs the company display name for a slug, nothing more.
create or replace function public.public_company_name(p_slug text) returns text
language sql stable security definer set search_path = '' as $$
  select name from public.tenants where public_slug = p_slug and status = 'active' and accepts_requests
$$;
revoke all on function public.public_company_name(text) from public;
grant execute on function public.public_company_name(text) to anon, authenticated;

commit;
