-- Phase 5b: expenses and expense categories. Receipt files (Supabase Storage) come in the next migration.

create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index expense_categories_name_idx on public.expense_categories(tenant_id, lower(name));

create table public.expenses (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  category_id    uuid not null,
  job_id         uuid,
  vendor         text not null default '' check (char_length(vendor) <= 120),
  description    text check (char_length(description) <= 500),
  amount_cents   integer not null check (amount_cents > 0),
  expense_date   date not null,
  payment_method text check (payment_method in ('cash','check','card','zelle','venmo','bank_transfer','other')),
  receipt_path   text check (char_length(receipt_path) <= 300),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, id),
  constraint expenses_category_fkey foreign key (tenant_id, category_id) references public.expense_categories(tenant_id, id) deferrable initially deferred,
  constraint expenses_job_fkey      foreign key (tenant_id, job_id) references public.jobs(tenant_id, id) deferrable initially deferred
);
create index expenses_date_idx on public.expenses(tenant_id, expense_date desc);
create index expenses_category_idx on public.expenses(tenant_id, category_id);
create trigger expenses_updated before update on public.expenses for each row execute function public.set_updated_at();

alter table public.expense_categories enable row level security;
alter table public.expenses           enable row level security;

create policy exp_cat_select on public.expense_categories for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','office_staff','accountant']));
create policy exp_cat_insert on public.expense_categories for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']));
create policy exp_cat_update on public.expense_categories for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin'])) with check (public.has_role(tenant_id, array['owner','admin']));

create policy expenses_select on public.expenses for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','office_staff','accountant']));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','office_staff']) and created_by = auth.uid());
create policy expenses_update on public.expenses for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','office_staff'])) with check (public.has_role(tenant_id, array['owner','admin','office_staff']));
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin']));

revoke all on public.expense_categories, public.expenses from anon;
revoke update, delete on public.expense_categories from authenticated;   -- categories are deactivated, never deleted
revoke update on public.expenses from authenticated;
grant update (name, sort_order, is_active) on public.expense_categories to authenticated;
grant update (category_id, job_id, vendor, description, amount_cents, expense_date, payment_method, receipt_path) on public.expenses to authenticated;

-- Totals per category for a date range (security invoker: RLS decides what the caller can see).
create or replace function public.expense_summary(p_from date, p_to date)
returns table (category_id uuid, category_name text, total_cents bigint, entries bigint)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, coalesce(sum(e.amount_cents), 0)::bigint, count(e.id)::bigint
  from public.expense_categories c
  join public.expenses e on e.tenant_id = c.tenant_id and e.category_id = c.id and e.expense_date between p_from and p_to
  group by c.id, c.name
  order by 3 desc
$$;
grant execute on function public.expense_summary(date, date) to authenticated;
revoke execute on function public.expense_summary(date, date) from anon, public;

-- Default categories (editable by owner/admin).
create or replace function public.seed_expense_categories(p_tenant uuid, p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
declare es boolean := (p_locale = 'es');
begin
  insert into public.expense_categories (tenant_id, name, sort_order)
  select p_tenant, n, o from (values
    (case when es then 'Insumos de limpieza' else 'Cleaning supplies' end, 1),
    (case when es then 'Equipo' else 'Equipment' end, 2),
    (case when es then 'Combustible y traslados' else 'Fuel and travel' end, 3),
    (case when es then 'Mano de obra' else 'Labor' end, 4),
    (case when es then 'Seguros y licencias' else 'Insurance and licenses' end, 5),
    (case when es then 'Publicidad' else 'Marketing' end, 6),
    (case when es then 'Software y suscripciones' else 'Software and subscriptions' end, 7),
    (case when es then 'Otros' else 'Other' end, 8)
  ) as v(n, o)
  on conflict do nothing;
end $$;
revoke all on function public.seed_expense_categories(uuid, text) from public, anon, authenticated;

-- Backfill existing companies (their doc language decides the names), then hook into company creation.
do $$
declare t record;
begin
  for t in select s.tenant_id, s.doc_locale from public.tenant_settings s loop
    perform public.seed_expense_categories(t.tenant_id, t.doc_locale);
  end loop;
end $$;

-- New companies get the default categories too.
create or replace function public.create_tenant(p_name text, p_locale text default 'en') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  uemail text;
  uname text;
  tid uuid;
  loc text := case when p_locale in ('en','es') then p_locale else 'en' end;
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
  values (uid, coalesce(uemail, ''), coalesce(uname, ''), loc)
  on conflict (id) do nothing;

  insert into public.tenants (name) values (btrim(p_name)) returning id into tid;
  insert into public.memberships (tenant_id, user_id, role) values (tid, uid, 'owner');
  insert into public.tenant_settings (tenant_id, doc_locale) values (tid, loc);
  insert into public.subscriptions (tenant_id, plan_id, status, trial_ends_at)
  values (tid, 'trial', 'trialing', now() + interval '14 days');
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id)
  values (tid, uid, 'tenant.created', 'tenant', tid::text);
  perform public.seed_tenant_services(tid, loc);
  perform public.seed_expense_categories(tid, loc);

  return tid;
end $$;
