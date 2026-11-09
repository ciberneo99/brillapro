-- Phase 4b: recurring schedules. Jobs are materialized on demand (button / on create), never by a background job.

create table public.recurring_schedules (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  customer_id     uuid not null,
  service_type_id uuid,
  title           text not null check (char_length(btrim(title)) between 1 and 120),
  frequency       text not null check (frequency in ('weekly','biweekly','every_four_weeks','monthly')),
  start_date      date not null,
  until_date      date,
  start_time      time,
  end_time        time,
  address         text,
  access_notes    text check (char_length(access_notes) <= 1000),
  price_cents     integer not null default 0 check (price_cents >= 0),
  notes           text check (char_length(notes) <= 2000),
  is_active       boolean not null default true,
  generated_until date,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  check (until_date is null or until_date >= start_date),
  check (end_time is null or start_time is null or end_time > start_time),
  constraint recurring_customer_fkey foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) deferrable initially deferred,
  constraint recurring_service_fkey  foreign key (tenant_id, service_type_id) references public.service_types(tenant_id, id) deferrable initially deferred
);
create index recurring_idx on public.recurring_schedules(tenant_id, is_active);
create trigger recurring_updated before update on public.recurring_schedules for each row execute function public.set_updated_at();

create table public.recurring_schedule_employees (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  schedule_id uuid not null,
  employee_id uuid not null,
  primary key (schedule_id, employee_id),
  constraint rse_schedule_fkey foreign key (tenant_id, schedule_id) references public.recurring_schedules(tenant_id, id) on delete cascade deferrable initially deferred,
  constraint rse_employee_fkey foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade deferrable initially deferred
);

alter table public.jobs add column recurring_schedule_id uuid;
alter table public.jobs add constraint jobs_recurring_fkey
  foreign key (tenant_id, recurring_schedule_id) references public.recurring_schedules(tenant_id, id) deferrable initially deferred;
-- One job per schedule per day: makes generation idempotent.
create unique index jobs_recurring_once on public.jobs(recurring_schedule_id, scheduled_date) where recurring_schedule_id is not null;

alter table public.recurring_schedules         enable row level security;
alter table public.recurring_schedule_employees enable row level security;

create policy recurring_select on public.recurring_schedules for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
create policy recurring_insert on public.recurring_schedules for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff']) and created_by = auth.uid());
create policy recurring_update on public.recurring_schedules for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']))
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
create policy rse_select on public.recurring_schedule_employees for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
create policy rse_insert on public.recurring_schedule_employees for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
create policy rse_delete on public.recurring_schedule_employees for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));

revoke all on public.recurring_schedules, public.recurring_schedule_employees from anon;
revoke update, delete on public.recurring_schedules from authenticated;
-- The pattern (frequency/start date) is fixed once created; to change it, end the schedule and create a new one.
grant update (title, until_date, start_time, end_time, address, access_notes, price_cents, notes) on public.recurring_schedules to authenticated;

-- n-th occurrence date of a schedule (monthly clamps to the end of short months).
create or replace function public.recurring_nth(p_start date, p_frequency text, p_n integer) returns date
language sql immutable set search_path = '' as $$
  select case p_frequency
    when 'weekly' then p_start + 7 * p_n
    when 'biweekly' then p_start + 14 * p_n
    when 'every_four_weeks' then p_start + 28 * p_n
    else (p_start + make_interval(months => p_n))::date
  end
$$;

-- Create the missing jobs up to p_through (max 366 days past today). Returns how many were created.
create or replace function public.generate_recurring_jobs(p_schedule uuid, p_through date) returns integer
language plpgsql security definer set search_path = '' as $$
declare s public.recurring_schedules; c public.customers; n integer := 0; i integer := 0; d date; jid uuid; cname text; addr text;
begin
  select * into s from public.recurring_schedules where id = p_schedule for update;
  if not found or not public.has_role(s.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if not s.is_active then return 0; end if;
  p_through := least(p_through, current_date + 366, coalesce(s.until_date, p_through));
  select * into c from public.customers where id = s.customer_id;
  cname := coalesce(nullif(btrim(c.first_name || ' ' || c.last_name), ''), c.company_name);
  addr := coalesce(s.address, nullif(btrim(concat_ws(', ', c.service_address, c.city, concat_ws(' ', c.state, c.zip_code))), ''));
  loop
    d := public.recurring_nth(s.start_date, s.frequency, i);
    exit when d > p_through or i > 800;
    i := i + 1;
    -- Occurrences before today are never back-filled.
    continue when d < current_date;
    insert into public.jobs (tenant_id, customer_id, service_type_id, recurring_schedule_id, title, scheduled_date, start_time, end_time,
                             customer_name, address, access_notes, price_cents, notes, created_by)
    values (s.tenant_id, s.customer_id, s.service_type_id, s.id, s.title, d, s.start_time, s.end_time,
            cname, addr, coalesce(s.access_notes, c.access_instructions), s.price_cents, s.notes, auth.uid())
    on conflict (recurring_schedule_id, scheduled_date) where recurring_schedule_id is not null do nothing
    returning id into jid;
    if jid is not null then
      insert into public.job_assignments (tenant_id, job_id, employee_id)
        select tenant_id, jid, employee_id from public.recurring_schedule_employees where schedule_id = s.id;
      perform public.snapshot_job_checklist(jid);
      n := n + 1;
      jid := null;
    end if;
  end loop;
  update public.recurring_schedules set generated_until = greatest(coalesce(generated_until, p_through), p_through) where id = s.id;
  return n;
end $$;

-- Stop a schedule; optionally cancel the not-yet-started future jobs it created.
create or replace function public.end_recurring(p_schedule uuid, p_cancel_future boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare s public.recurring_schedules; n integer := 0;
begin
  select * into s from public.recurring_schedules where id = p_schedule for update;
  if not found or not public.has_role(s.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  update public.recurring_schedules set is_active = false where id = p_schedule;
  if p_cancel_future then
    update public.jobs set status = 'cancelled'
     where recurring_schedule_id = p_schedule and status = 'scheduled' and scheduled_date >= current_date;
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

revoke all on function public.recurring_nth(date, text, integer), public.generate_recurring_jobs(uuid, date), public.end_recurring(uuid, boolean) from public, anon;
grant execute on function public.recurring_nth(date, text, integer), public.generate_recurring_jobs(uuid, date), public.end_recurring(uuid, boolean) to authenticated;
