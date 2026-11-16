-- Delete jobs (and parts of a recurring series). A job with history (invoice, expense, hours, inventory use) is cancelled instead of erased.
-- Dates removed from a series are remembered so "Create the next 12 weeks" does not bring them back.

create table public.recurring_skipped_dates (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  schedule_id uuid not null,
  skipped_on  date not null,
  primary key (schedule_id, skipped_on),
  constraint rsd_schedule_fkey foreign key (tenant_id, schedule_id) references public.recurring_schedules(tenant_id, id) on delete cascade deferrable initially deferred
);
alter table public.recurring_skipped_dates enable row level security;
create policy rsd_select on public.recurring_skipped_dates for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
revoke all on public.recurring_skipped_dates from anon;
revoke insert, update, delete on public.recurring_skipped_dates from authenticated;

-- Same as 0010, plus: skip dates that were deleted from the series.
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
    continue when d < current_date;
    continue when exists (select 1 from public.recurring_skipped_dates k where k.schedule_id = s.id and k.skipped_on = d);
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

-- p_scope: 'one' (this job), 'following' (this and later jobs of its series), 'series' (all jobs of its series, then the series ends).
-- Completed and in-progress jobs are never touched by 'following'/'series'; 'one' refuses them.
create or replace function public.delete_jobs(p_job uuid, p_scope text) returns table (deleted integer, cancelled integer)
language plpgsql security definer set search_path = '' as $$
declare j public.jobs; r record; nd integer := 0; nc integer := 0; linked boolean;
begin
  if p_scope not in ('one','following','series') then raise exception 'invalid scope' using errcode = '22023'; end if;
  select * into j from public.jobs where id = p_job;
  if not found or not public.has_role(j.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if p_scope <> 'one' and j.recurring_schedule_id is null then raise exception 'not a series job' using errcode = '22023'; end if;
  if p_scope = 'one' and j.status in ('completed','in_progress') then raise exception 'job already started' using errcode = '22023'; end if;

  for r in
    select * from public.jobs x
    where x.tenant_id = j.tenant_id
      and case p_scope
            when 'one' then x.id = j.id
            when 'following' then x.recurring_schedule_id = j.recurring_schedule_id and x.scheduled_date >= j.scheduled_date and x.status not in ('completed','in_progress')
            else x.recurring_schedule_id = j.recurring_schedule_id and x.status not in ('completed','in_progress')
          end
    for update
  loop
    linked := exists (select 1 from public.invoices where job_id = r.id)
           or exists (select 1 from public.expenses where job_id = r.id)
           or exists (select 1 from public.time_entries where job_id = r.id)
           or exists (select 1 from public.inventory_movements where job_id = r.id);
    if r.recurring_schedule_id is not null then
      insert into public.recurring_skipped_dates (tenant_id, schedule_id, skipped_on) values (r.tenant_id, r.recurring_schedule_id, r.scheduled_date) on conflict do nothing;
    end if;
    if linked then
      update public.jobs set status = 'cancelled' where id = r.id and status <> 'cancelled';
      nc := nc + 1;
    else
      delete from public.jobs where id = r.id;
      nd := nd + 1;
    end if;
  end loop;

  if p_scope = 'series' then
    update public.recurring_schedules set is_active = false where id = j.recurring_schedule_id;
  end if;
  return query select nd, nc;
end $$;

revoke all on function public.delete_jobs(uuid, text) from public, anon;
grant execute on function public.delete_jobs(uuid, text) to authenticated;

-- Delete a whole series from the Recurring page (works even when no job of it is left).
create or replace function public.delete_series(p_schedule uuid) returns table (deleted integer, cancelled integer)
language plpgsql security definer set search_path = '' as $$
declare s public.recurring_schedules; jid uuid;
begin
  select * into s from public.recurring_schedules where id = p_schedule for update;
  if not found or not public.has_role(s.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  select id into jid from public.jobs where recurring_schedule_id = p_schedule limit 1;
  if jid is null then
    update public.recurring_schedules set is_active = false where id = p_schedule;
    return query select 0, 0;
  else
    return query select * from public.delete_jobs(jid, 'series');
  end if;
end $$;
revoke all on function public.delete_series(uuid) from public, anon;
grant execute on function public.delete_series(uuid) to authenticated;
