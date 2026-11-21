-- One round trip for the signed-in user's context (role, company, profile, settings, subscription).
-- Before, the app ran four sequential/parallel queries on every page. SECURITY INVOKER on purpose: every table is still read
-- under the caller's row-level security, exactly as the separate queries were, so nothing new is exposed.
create or replace function public.my_app_context()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'role', m.role,
    'tenant', jsonb_build_object('id', t.id, 'name', t.name, 'public_slug', t.public_slug, 'accepts_requests', t.accepts_requests),
    'profile', (select jsonb_build_object('full_name', p.full_name, 'locale', p.locale, 'theme', p.theme)
                  from public.profiles p where p.id = auth.uid()),
    'settings', (select jsonb_build_object(
                    'currency', s.currency, 'timezone', s.timezone, 'date_format', s.date_format, 'doc_locale', s.doc_locale,
                    'phone', s.phone, 'email', s.email, 'address', s.address, 'tax_id', s.tax_id, 'logo_path', s.logo_path,
                    'city', s.city, 'state', s.state, 'zip_code', s.zip_code, 'website', s.website)
                  from public.tenant_settings s where s.tenant_id = t.id),
    'sub', (select jsonb_build_object('status', b.status, 'trial_ends_at', b.trial_ends_at, 'plan_id', b.plan_id)
              from public.subscriptions b where b.tenant_id = t.id)
  )
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid() and m.status = 'active'
  order by m.created_at asc
  limit 1;
$$;

revoke all on function public.my_app_context() from public, anon;
grant execute on function public.my_app_context() to authenticated;

notify pgrst, 'reload schema';
