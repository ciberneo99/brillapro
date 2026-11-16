-- "This and following jobs" for a recurring series (like Google Calendar).
-- Applies the edited fields to the job and every later job of its series that has not started. When the date or the frequency changed,
-- those jobs are also moved to the new cadence (first one on the chosen date, then every week / 2 weeks / ...), keeping their ids, team and checklist.
-- The series itself takes the new cadence and fields, so "Create the next 12 weeks" keeps following it.
create or replace function public.update_series_from(
  p_job uuid, p_frequency text, p_title text, p_service uuid, p_date date, p_start time, p_end time,
  p_address text, p_access text, p_price integer, p_notes text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs; s public.recurring_schedules; freq text; ids uuid[]; jid uuid; k integer := 0; target date; moved integer := 0; changed boolean; last_date date;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found or not public.has_role(j.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if j.recurring_schedule_id is null then raise exception 'not a series job' using errcode = '22023'; end if;
  if j.status <> 'scheduled' then raise exception 'job already started' using errcode = '22023'; end if;
  select * into s from public.recurring_schedules where id = j.recurring_schedule_id for update;
  if not s.is_active then raise exception 'series ended' using errcode = '22023'; end if;
  freq := coalesce(p_frequency, s.frequency);
  if freq not in ('weekly','biweekly','every_four_weeks','monthly') then raise exception 'invalid frequency' using errcode = '22023'; end if;
  if p_end is not null and p_start is not null and p_end <= p_start then raise exception 'invalid time' using errcode = '22023'; end if;
  changed := p_date <> j.scheduled_date or freq <> s.frequency;
  if changed and s.until_date is not null and p_date > s.until_date then raise exception 'after end date' using errcode = '22023'; end if;
  if changed and exists (select 1 from public.jobs x where x.recurring_schedule_id = s.id and x.scheduled_date = p_date and x.id <> j.id
                          and (x.scheduled_date < j.scheduled_date or x.status <> 'scheduled')) then
    raise exception 'date taken' using errcode = '22023';
  end if;

  select coalesce(array_agg(x.id order by x.scheduled_date), '{}') into ids
    from public.jobs x where x.recurring_schedule_id = s.id and x.scheduled_date >= j.scheduled_date and x.status = 'scheduled';

  if changed then
    -- Park the moving jobs on distinct far-future dates so the "one job per series per day" index never collides while they move.
    update public.jobs x set scheduled_date = date '3000-01-01' + u.n::integer
      from unnest(ids) with ordinality as u(id, n) where x.id = u.id;
  end if;

  foreach jid in array ids loop
    if changed then
      loop
        target := public.recurring_nth(p_date, freq, k);
        k := k + 1;
        exit when not exists (select 1 from public.jobs x where x.recurring_schedule_id = s.id and x.scheduled_date = target);
      end loop;
      last_date := target;
      update public.jobs set scheduled_date = target, title = p_title, service_type_id = p_service, start_time = p_start, end_time = p_end,
             address = p_address, access_notes = p_access, price_cents = p_price, notes = p_notes,
             status = case when s.until_date is not null and target > s.until_date then 'cancelled' else status end
       where public.jobs.id = jid;
    else
      update public.jobs set title = p_title, service_type_id = p_service, start_time = p_start, end_time = p_end,
             address = p_address, access_notes = p_access, price_cents = p_price, notes = p_notes
       where public.jobs.id = jid;
    end if;
    moved := moved + 1;
  end loop;

  update public.recurring_schedules set
    frequency = freq, start_date = case when changed then p_date else start_date end,
    title = p_title, service_type_id = p_service, start_time = p_start, end_time = p_end,
    address = p_address, access_notes = p_access, price_cents = p_price, notes = p_notes,
    generated_until = case when changed and last_date is not null then greatest(coalesce(generated_until, last_date), last_date) else generated_until end
  where public.recurring_schedules.id = s.id;
  return moved;
end $$;

revoke all on function public.update_series_from(uuid, text, text, uuid, date, time, time, text, text, integer, text) from public, anon;
grant execute on function public.update_series_from(uuid, text, text, uuid, date, time, time, text, text, integer, text) to authenticated;
