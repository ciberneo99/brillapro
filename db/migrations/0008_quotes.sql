-- Phase 3b: quotes (Good/Better/Best options + extra lines), per-company numbering, totals computed in SQL.
-- Money is integer cents. Cross-table tenant FKs are DEFERRABLE; every table has a tenant FK with cascade.

alter table public.tenant_settings
  add column quote_prefix     text    not null default 'Q-' check (char_length(quote_prefix) <= 10),
  add column quote_valid_days integer not null default 30 check (quote_valid_days between 1 and 365),
  add column default_tax_rate numeric(5,2) not null default 0 check (default_tax_rate between 0 and 100),
  add column quote_terms      text check (char_length(quote_terms) <= 3000);

-- Sequential number per company (no gaps from races: the counter row is locked by the upsert).
create table public.tenant_counters (
  tenant_id  uuid primary key references public.tenants(id) on delete cascade,
  quote_seq  integer not null default 0
);
alter table public.tenant_counters enable row level security;
revoke all on public.tenant_counters from anon, authenticated;

create table public.quotes (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  customer_id         uuid not null,
  number              integer not null,
  status              text not null default 'draft' check (status in ('draft','sent','accepted','declined')),
  service_type_id     uuid,
  title               text check (char_length(title) <= 120),
  issue_date          date not null default current_date,
  expires_on          date not null,
  discount_cents      integer not null default 0 check (discount_cents >= 0),
  tax_rate            numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  selected_option_id  uuid,
  notes               text check (char_length(notes) <= 2000),
  terms               text check (char_length(terms) <= 3000),
  sent_at             timestamptz,
  responded_at        timestamptz,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, number),
  constraint quotes_customer_fkey foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) deferrable initially deferred,
  constraint quotes_service_fkey  foreign key (tenant_id, service_type_id) references public.service_types(tenant_id, id) deferrable initially deferred
);
create index quotes_customer_idx on public.quotes(tenant_id, customer_id);
create index quotes_status_idx   on public.quotes(tenant_id, status, created_at desc);
create trigger quotes_updated before update on public.quotes for each row execute function public.set_updated_at();

create table public.quote_options (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  quote_id         uuid not null,
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  description      text check (char_length(description) <= 1000),
  base_price_cents integer not null default 0 check (base_price_cents >= 0),
  position         integer not null default 0,
  unique (tenant_id, id),
  constraint quote_options_quote_fkey foreign key (tenant_id, quote_id) references public.quotes(tenant_id, id) on delete cascade deferrable initially deferred
);
create index quote_options_idx on public.quote_options(tenant_id, quote_id, position);

create table public.quote_lines (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  quote_id         uuid not null,
  description      text not null check (char_length(btrim(description)) between 1 and 200),
  quantity         numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  position         integer not null default 0,
  unique (tenant_id, id),
  constraint quote_lines_quote_fkey foreign key (tenant_id, quote_id) references public.quotes(tenant_id, id) on delete cascade deferrable initially deferred
);
create index quote_lines_idx on public.quote_lines(tenant_id, quote_id, position);

-- Assign the next number for the company, ignoring whatever the client sent.
create or replace function public.assign_quote_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tenant_counters (tenant_id, quote_seq) values (new.tenant_id, 1)
  on conflict (tenant_id) do update set quote_seq = public.tenant_counters.quote_seq + 1
  returning quote_seq into new.number;
  return new;
end $$;
create trigger quotes_number before insert on public.quotes for each row execute function public.assign_quote_number();

-- ───────── RLS ─────────
alter table public.quotes        enable row level security;
alter table public.quote_options enable row level security;
alter table public.quote_lines   enable row level security;

create policy quotes_select on public.quotes for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
create policy quotes_insert on public.quotes for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff'])
              and status = 'draft' and selected_option_id is null and created_by = auth.uid());
-- Only drafts can be edited or deleted; sent quotes are revised by duplicating them.
create policy quotes_update on public.quotes for update to authenticated
  using (status = 'draft' and public.has_role(tenant_id, array['owner','admin','manager','office_staff']))
  with check (status = 'draft' and public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
create policy quotes_delete on public.quotes for delete to authenticated
  using (status = 'draft' and public.has_role(tenant_id, array['owner','admin','manager','office_staff']));

do $$
declare t text;
begin
  foreach t in array array['quote_options','quote_lines'] loop
    execute format($f$create policy %1$s_select on public.%1$s for select to authenticated
      using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']))$f$, t);
    execute format($f$create policy %1$s_write on public.%1$s for all to authenticated
      using (public.has_role(tenant_id, array['owner','admin','manager','office_staff'])
             and exists (select 1 from public.quotes q where q.tenant_id = %1$s.tenant_id and q.id = %1$s.quote_id and q.status = 'draft'))
      with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff'])
             and exists (select 1 from public.quotes q where q.tenant_id = %1$s.tenant_id and q.id = %1$s.quote_id and q.status = 'draft'))$f$, t);
  end loop;
end $$;

revoke all on public.quotes, public.quote_options, public.quote_lines from anon;
revoke update on public.quotes, public.quote_options, public.quote_lines from authenticated;
grant update (service_type_id, title, issue_date, expires_on, discount_cents, tax_rate, notes, terms) on public.quotes to authenticated;
grant update (name, description, base_price_cents, position) on public.quote_options to authenticated;
grant update (description, quantity, unit_price_cents, position) on public.quote_lines to authenticated;

-- ───────── totals (SQL is the single source of truth) ─────────
-- One row per option (or a single row with option_id null when the quote has no options).
-- subtotal = option base + all lines; discount (fixed) is capped at the subtotal; tax % applies after discount.
create or replace function public.quote_totals(p_quote uuid)
returns table (option_id uuid, subtotal_cents bigint, discount_cents bigint, tax_cents bigint, total_cents bigint)
language sql stable security invoker set search_path = '' as $$
  with q as (select * from public.quotes where id = p_quote),
  l as (
    select coalesce(sum(round(quantity * unit_price_cents)), 0)::bigint as amt
    from public.quote_lines where quote_id = p_quote
  ),
  o as (
    select id as oid, base_price_cents::bigint as base, position from public.quote_options where quote_id = p_quote
    union all
    select null::uuid, 0::bigint, 0 where not exists (select 1 from public.quote_options where quote_id = p_quote)
  ),
  s as (select o.oid, o.base + l.amt as sub, q.discount_cents as d, q.tax_rate as r, o.position from o, l, q),
  c as (select oid, sub, least(d, sub)::bigint as disc, r, position from s)
  select oid, sub, disc, round((sub - disc) * r / 100)::bigint, (sub - disc) + round((sub - disc) * r / 100)::bigint
  from c order by position
$$;

-- List view: headline total = accepted option, else the first option. "expired" is derived from the date.
create or replace view public.quotes_overview with (security_invoker = true) as
select q.id, q.tenant_id, q.customer_id, q.number, q.status, q.title, q.issue_date, q.expires_on, q.sent_at, q.created_at,
       case when q.status in ('draft','sent') and q.expires_on < current_date then 'expired' else q.status end as display_status,
       c.first_name, c.last_name, c.company_name,
       h.total_cents
from public.quotes q
join public.customers c on c.tenant_id = q.tenant_id and c.id = q.customer_id
left join lateral (
  select t.total_cents from public.quote_totals(q.id) t
  where t.option_id is not distinct from coalesce(q.selected_option_id, (select id from public.quote_options o where o.quote_id = q.id order by position limit 1))
  limit 1
) h on true;
grant select on public.quotes_overview to authenticated;
revoke all on public.quotes_overview from anon;

-- ───────── atomic operations ─────────
-- draft → sent | accepted | declined ; sent → accepted | declined. Accepting picks the option (if the quote has options).
create or replace function public.set_quote_status(p_id uuid, p_status text, p_option uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes; has_opts boolean;
begin
  select * into q from public.quotes where id = p_id for update;
  if not found or not public.has_role(q.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if p_status not in ('sent','accepted','declined')
     or (q.status = 'draft' and p_status not in ('sent','accepted','declined'))
     or (q.status = 'sent' and p_status not in ('accepted','declined'))
     or q.status in ('accepted','declined') then
    raise exception 'invalid transition' using errcode = '22023';
  end if;
  if p_status = 'sent' then
    update public.quotes set status = 'sent', sent_at = now() where id = p_id;
  elsif p_status = 'declined' then
    update public.quotes set status = 'declined', responded_at = now() where id = p_id;
  else
    select exists (select 1 from public.quote_options where quote_id = p_id) into has_opts;
    if has_opts and not exists (select 1 from public.quote_options where quote_id = p_id and id = p_option) then
      raise exception 'option required' using errcode = '22023';
    end if;
    update public.quotes set status = 'accepted', responded_at = now(), selected_option_id = case when has_opts then p_option end where id = p_id;
  end if;
end $$;

-- Copy a quote (any status) into a new draft with a new number, new expiry and the same options and lines.
create or replace function public.duplicate_quote(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q public.quotes; nid uuid; days integer;
begin
  select * into q from public.quotes where id = p_id;
  if not found or not public.has_role(q.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  select quote_valid_days into days from public.tenant_settings where tenant_id = q.tenant_id;
  insert into public.quotes (tenant_id, customer_id, service_type_id, title, expires_on, discount_cents, tax_rate, notes, terms, created_by)
  values (q.tenant_id, q.customer_id, q.service_type_id, q.title, current_date + coalesce(days, 30), q.discount_cents, q.tax_rate, q.notes, q.terms, auth.uid())
  returning id into nid;
  insert into public.quote_options (tenant_id, quote_id, name, description, base_price_cents, position)
    select tenant_id, nid, name, description, base_price_cents, position from public.quote_options where quote_id = p_id;
  insert into public.quote_lines (tenant_id, quote_id, description, quantity, unit_price_cents, position)
    select tenant_id, nid, description, quantity, unit_price_cents, position from public.quote_lines where quote_id = p_id;
  return nid;
end $$;

revoke all on function public.set_quote_status(uuid, text, uuid), public.duplicate_quote(uuid) from public, anon;
grant execute on function public.set_quote_status(uuid, text, uuid), public.duplicate_quote(uuid) to authenticated;
