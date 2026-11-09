-- Phase 6: inventory (items + immutable movements) and operational report functions.

create table public.inventory_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  unit         text not null default 'unit' check (char_length(btrim(unit)) between 1 and 30),
  min_quantity numeric(12,2) not null default 0 check (min_quantity >= 0),
  unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  notes        text check (char_length(notes) <= 500),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index inventory_items_name_idx on public.inventory_items(tenant_id, lower(name));
create trigger inventory_items_updated before update on public.inventory_items for each row execute function public.set_updated_at();

-- Quantity is signed: purchases add, uses subtract, adjustments are either. Rows are never edited or deleted.
create table public.inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  item_id       uuid not null,
  kind          text not null check (kind in ('purchase','use','adjustment')),
  quantity      numeric(12,2) not null,
  job_id        uuid,
  note          text check (char_length(note) <= 300),
  movement_date date not null default current_date,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (tenant_id, id),
  check ((kind = 'purchase' and quantity > 0) or (kind = 'use' and quantity < 0) or (kind = 'adjustment' and quantity <> 0)),
  constraint inv_mov_item_fkey foreign key (tenant_id, item_id) references public.inventory_items(tenant_id, id) deferrable initially deferred,
  constraint inv_mov_job_fkey  foreign key (tenant_id, job_id) references public.jobs(tenant_id, id) deferrable initially deferred
);
create index inv_mov_item_idx on public.inventory_movements(tenant_id, item_id, created_at desc);

-- Stock can never go below zero. The item row is locked so two simultaneous movements can't both pass.
create or replace function public.inventory_check_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare on_hand numeric;
begin
  perform 1 from public.inventory_items where tenant_id = new.tenant_id and id = new.item_id for update;
  select coalesce(sum(quantity), 0) + new.quantity into on_hand
    from public.inventory_movements where tenant_id = new.tenant_id and item_id = new.item_id;
  if on_hand < 0 then
    raise exception 'insufficient stock' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger inventory_stock_check before insert on public.inventory_movements for each row execute function public.inventory_check_stock();

alter table public.inventory_items     enable row level security;
alter table public.inventory_movements enable row level security;

create policy inv_items_select on public.inventory_items for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']));
create policy inv_items_insert on public.inventory_items for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager']));
create policy inv_items_update on public.inventory_items for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager'])) with check (public.has_role(tenant_id, array['owner','admin','manager']));

create policy inv_mov_select on public.inventory_movements for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']));
create policy inv_mov_insert on public.inventory_movements for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager']) and created_by = auth.uid());

revoke all on public.inventory_items, public.inventory_movements from anon;
revoke update, delete on public.inventory_items from authenticated;      -- items are deactivated, never deleted
revoke update, delete on public.inventory_movements from authenticated;  -- the history is permanent
grant update (name, unit, min_quantity, unit_cost_cents, notes, is_active) on public.inventory_items to authenticated;

create or replace view public.inventory_overview with (security_invoker = true) as
select i.id, i.tenant_id, i.name, i.unit, i.min_quantity, i.unit_cost_cents, i.notes, i.is_active,
       coalesce(m.qty, 0) as on_hand,
       (i.is_active and coalesce(m.qty, 0) <= i.min_quantity and i.min_quantity > 0) as is_low
from public.inventory_items i
left join lateral (select sum(quantity) as qty from public.inventory_movements x where x.tenant_id = i.tenant_id and x.item_id = i.id) m on true;
grant select on public.inventory_overview to authenticated;
revoke all on public.inventory_overview from anon;

-- ───────── operational reports (security invoker: each caller sees only what RLS lets them see) ─────────
create or replace function public.report_jobs(p_from date, p_to date)
returns table (status text, jobs bigint, revenue_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select j.status, count(*)::bigint, coalesce(sum(j.price_cents), 0)::bigint
  from public.jobs j where j.scheduled_date between p_from and p_to group by j.status order by 2 desc
$$;

create or replace function public.report_hours(p_from date, p_to date, p_tz text default 'America/New_York')
returns table (employee_id uuid, employee_name text, seconds bigint, entries bigint)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.full_name, coalesce(sum(extract(epoch from (t.clock_out - t.clock_in))), 0)::bigint, count(t.id)::bigint
  from public.time_entries t
  join public.employees e on e.tenant_id = t.tenant_id and e.id = t.employee_id
  where t.clock_out is not null and (t.clock_in at time zone p_tz)::date between p_from and p_to
  group by e.id, e.full_name order by 3 desc
$$;

-- Money in / out for a period: invoiced (sent invoices by issue date), collected (payments by date received), expenses.
create or replace function public.report_money(p_from date, p_to date)
returns table (invoiced_cents bigint, collected_cents bigint, expenses_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select
    (select coalesce(sum(o.total_cents), 0) from public.invoices_overview o where o.status = 'sent' and o.issue_date between p_from and p_to)::bigint,
    (select coalesce(sum(p.amount_cents), 0) from public.payments p where p.paid_on between p_from and p_to)::bigint,
    (select coalesce(sum(e.amount_cents), 0) from public.expenses e where e.expense_date between p_from and p_to)::bigint
$$;

grant execute on function public.report_jobs(date, date), public.report_hours(date, date, text), public.report_money(date, date) to authenticated;
revoke execute on function public.report_jobs(date, date), public.report_hours(date, date, text), public.report_money(date, date) from anon, public;
