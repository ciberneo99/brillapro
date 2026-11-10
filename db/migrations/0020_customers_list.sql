-- Customers list redesign: star rating, per-customer money and time-on-site figures.

alter table public.customers add column rating smallint check (rating between 1 and 5);
grant update (rating) on public.customers to authenticated;

-- Figures shown next to each customer in the list. Runs as the caller, so RLS decides what each role sees
-- (money only for roles that can read invoices, hours only for roles that can read time entries).
-- Time compares labor hours clocked on the customer's latest started job with the scheduled window
-- multiplied by the number of people assigned (a crew of two for 3 hours = 6 labor hours planned).
create or replace function public.customer_list_extras(p_ids uuid[])
returns table (customer_id uuid, outstanding_cents bigint, overdue_cents bigint,
               job_id uuid, job_title text, job_date date, job_status text,
               planned_minutes integer, actual_minutes integer, crew integer)
language sql stable security invoker set search_path = '' as $$
  select c.id,
    coalesce((select sum(o.balance_cents) from public.invoices_overview o
               where o.customer_id = c.id and o.display_status in ('sent','partial','overdue') and o.balance_cents > 0), 0)::bigint,
    coalesce((select sum(o.balance_cents) from public.invoices_overview o
               where o.customer_id = c.id and o.display_status = 'overdue'), 0)::bigint,
    j.id, j.title, j.scheduled_date, j.status,
    case when j.start_time is not null and j.end_time is not null
         then (extract(epoch from (j.end_time - j.start_time)) / 60)::integer * greatest(1, (select count(*)::integer from public.job_assignments a where a.job_id = j.id))
    end,
    case when j.id is null then null
         else (select coalesce(sum(extract(epoch from (coalesce(t.clock_out, now()) - t.clock_in)) / 60), 0)::integer
                 from public.time_entries t where t.job_id = j.id) end,
    case when j.id is null then null else greatest(1, (select count(*)::integer from public.job_assignments a where a.job_id = j.id)) end
  from public.customers c
  left join lateral (
    select jj.* from public.jobs jj
     where jj.customer_id = c.id and jj.status <> 'cancelled' and jj.scheduled_date <= current_date
     order by jj.scheduled_date desc, jj.start_time desc nulls last limit 1
  ) j on true
  where c.id = any(p_ids)
$$;

-- Headline figures above the list.
create or replace function public.customers_summary()
returns table (overdue_cents bigint, outstanding_cents bigint, draft_quotes integer)
language sql stable security invoker set search_path = '' as $$
  select
    coalesce((select sum(o.balance_cents) from public.invoices_overview o where o.display_status = 'overdue'), 0)::bigint,
    coalesce((select sum(o.balance_cents) from public.invoices_overview o where o.display_status in ('sent','partial','overdue') and o.balance_cents > 0), 0)::bigint,
    (select count(*)::integer from public.quotes q where q.status = 'draft')
$$;

revoke execute on function public.customer_list_extras(uuid[]), public.customers_summary() from public, anon;
grant execute on function public.customer_list_extras(uuid[]), public.customers_summary() to authenticated;
