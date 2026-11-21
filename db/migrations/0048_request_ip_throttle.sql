-- Public quote-request form: per-visitor throttle + no direct anonymous access to the intake function.
--
-- Why: Turnstile and any per-IP limit live in the Next.js server action, but the anon key is public, so
-- anyone could call public.submit_quote_request over PostgREST and skip both. From now on only the server
-- (service_role, used by src/lib/supabase/service.ts) can run the intake, through submit_quote_request_checked,
-- which also limits each visitor (hashed IP) on top of the existing per-company limit.

create table public.request_hits (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index request_hits_ip_idx on public.request_hits (ip_hash, created_at desc);
create index request_hits_created_idx on public.request_hits (created_at);
alter table public.request_hits enable row level security; -- no policies: nobody reads it through the API
revoke all on public.request_hits from anon, authenticated;

-- Only successful submissions count: a rejected request raises, and that rolls back the insert.
create or replace function public.submit_quote_request_checked(p_slug text, p_data jsonb, p_ip_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n10 integer;
  n24 integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  delete from public.request_hits where created_at < now() - interval '2 days';

  select count(*) filter (where created_at > now() - interval '10 minutes'), count(*)
    into n10, n24
    from public.request_hits
   where ip_hash = p_ip_hash and created_at > now() - interval '1 day';
  -- at most 5 requests per visitor per 10 minutes and 20 per day (across all companies)
  if n10 >= 5 or n24 >= 20 then
    raise exception 'too many requests' using errcode = '53400';
  end if;

  insert into public.request_hits (ip_hash) values (p_ip_hash);
  perform public.submit_quote_request(p_slug, p_data);
end $$;

-- Supabase grants new functions to anon/authenticated/service_role by default, so revoke them explicitly.
revoke all on function public.submit_quote_request_checked(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_quote_request_checked(text, jsonb, text) to service_role;

-- The original intake function is now internal: visitors can no longer call it directly.
revoke all on function public.submit_quote_request(text, jsonb) from public, anon, authenticated;
