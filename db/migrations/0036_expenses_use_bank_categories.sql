-- One category list for the whole app: expenses now use the same two-level categories as Bank Reports (bank_categories).
-- The old flat list (expense_categories) is kept in place but no longer used; nothing is deleted.

-- 1) Every company has the category list (new companies get it when they are created).
do $$
declare t uuid;
begin
  for t in select id from public.tenants loop
    if not exists (select 1 from public.bank_categories where tenant_id = t) then perform public.bank_add_default_categories(t); end if;
  end loop;
end $$;

-- 2) People who record expenses (office staff too) can read the categories; only owner/admin change them.
drop policy bank_categories_select on public.bank_categories;
create policy bank_categories_select on public.bank_categories for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','office_staff','accountant']));

-- 3) Move existing expenses to the new categories. Known starter names map to the closest category; anything else (your own names)
--    is added under "Other expenses" with the same name, so no expense loses its category.
create or replace function pg_temp.pick(p_tenant uuid, p_parent text, p_child text) returns uuid language plpgsql as $$
declare pid uuid; cid uuid;
begin
  select id into pid from public.bank_categories where tenant_id = p_tenant and parent_id is null and lower(name) = lower(p_parent);
  if pid is null then
    insert into public.bank_categories (tenant_id, name, sort_order) values (p_tenant, p_parent, 9000) returning id into pid;
  end if;
  if p_child is null then return pid; end if;
  select id into cid from public.bank_categories where tenant_id = p_tenant and parent_id = pid and lower(name) = lower(p_child);
  if cid is null then
    insert into public.bank_categories (tenant_id, parent_id, name, sort_order) values (p_tenant, pid, p_child, 9000) returning id into cid;
  end if;
  return cid;
end $$;

create temp table cat_map (old_id uuid primary key, new_id uuid not null);
do $$
declare r record; k text; target uuid;
begin
  for r in select * from public.expense_categories loop
    k := lower(btrim(r.name));
    target := case
      when k in ('cleaning supplies', 'insumos de limpieza') then pg_temp.pick(r.tenant_id, 'Supplies', 'Cleaning Supplies')
      when k in ('equipment', 'equipo') then pg_temp.pick(r.tenant_id, 'Supplies', 'Cleaning Equipment')
      when k in ('fuel and travel', 'combustible y traslados') then pg_temp.pick(r.tenant_id, 'Vehicle Expenses', 'Gas/Fuel')
      when k in ('labor', 'mano de obra') then pg_temp.pick(r.tenant_id, 'Contract Labor / Subcontractors', null)
      when k in ('marketing', 'publicidad') then pg_temp.pick(r.tenant_id, 'Advertising & Marketing', 'Marketing')
      when k in ('software and subscriptions', 'software y suscripciones') then pg_temp.pick(r.tenant_id, 'Office Expenses', 'Software & Subscriptions')
      else pg_temp.pick(r.tenant_id, 'Other expenses', r.name)
    end;
    insert into cat_map values (r.id, target);
  end loop;
end $$;

alter table public.expenses drop constraint expenses_category_fkey;
alter table public.expenses disable trigger expenses_updated;   -- a category move is not an edit by a person
update public.expenses e set category_id = m.new_id from cat_map m where e.category_id = m.old_id;
alter table public.expenses enable trigger expenses_updated;
alter table public.expenses add constraint expenses_category_fkey
  foreign key (tenant_id, category_id) references public.bank_categories (tenant_id, id) deferrable initially deferred;

-- 4) Totals per category ("Main: Sub").
create or replace function public.expense_summary(p_from date, p_to date)
returns table (category_id uuid, category_name text, total_cents bigint, entries bigint)
language sql stable security invoker set search_path = '' as $$
  select c.id, case when p.id is null then c.name else p.name || ': ' || c.name end, coalesce(sum(e.amount_cents), 0)::bigint, count(e.id)::bigint
  from public.bank_categories c
  left join public.bank_categories p on p.tenant_id = c.tenant_id and p.id = c.parent_id
  join public.expenses e on e.tenant_id = c.tenant_id and e.category_id = c.id and e.expense_date between p_from and p_to
  group by c.id, c.name, p.id, p.name
  order by 3 desc
$$;

-- 5) New companies get the shared category list.
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
  perform public.bank_add_default_categories(tid);

  return tid;
end $$;
