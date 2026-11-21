-- Accent-insensitive customer search ("jose" finds "José"). PostgREST exposes a function that takes a customers row as a
-- computed column, so the app can filter on it: customer_search_text.ilike.%word%
create extension if not exists unaccent with schema extensions;

create or replace function public.customer_search_text(c public.customers)
returns text language sql stable set search_path = '' as $$
  select extensions.unaccent(lower(concat_ws(' ', c.first_name, c.last_name, c.company_name, c.email, c.phone, c.secondary_phone)));
$$;

revoke all on function public.customer_search_text(public.customers) from public, anon;
grant execute on function public.customer_search_text(public.customers) to authenticated;

notify pgrst, 'reload schema';
