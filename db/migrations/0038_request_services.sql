-- The "Preferred service" list of the public quote-request form comes from the company's own service types (Settings → Services).
-- Visitors are anonymous, so they get the list only through this narrow function: active service names of one company, nothing else.
create or replace function public.public_request_services(p_slug text) returns table (name text)
language sql stable security definer set search_path = '' as $$
  select s.name
    from public.service_types s
    join public.tenants t on t.id = s.tenant_id
   where t.public_slug = p_slug and t.status = 'active' and t.accepts_requests and s.is_active
   order by s.sort_order, s.name
$$;
revoke all on function public.public_request_services(text) from public;
grant execute on function public.public_request_services(text) to anon, authenticated;

-- Same intake function as before; the only change is that preferred_service must match one of the company's active services.
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
    -- Only a service the company really offers (an active service type) is kept; anything else is dropped.
    (select s.name from public.service_types s where s.tenant_id = t.id and s.is_active and lower(s.name) = lower(btrim(coalesce(p_data->>'preferred_service',''))) limit 1),
    left(nullif(btrim(coalesce(p_data->>'message','')), ''), 2000)
  );
end $$;
revoke all on function public.submit_quote_request(text, jsonb) from public;
grant execute on function public.submit_quote_request(text, jsonb) to anon, authenticated;
