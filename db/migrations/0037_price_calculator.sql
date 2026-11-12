-- Quote price calculator: each company keeps its own rates (per sq ft, surcharges, discounts, add-ons) as one JSON document.
-- NULL means "use the built-in Austin, TX defaults". The shape is validated by the app before it is saved.
alter table public.tenant_settings
  add column price_calculator jsonb check (price_calculator is null or (jsonb_typeof(price_calculator) = 'object' and pg_column_size(price_calculator) <= 16384));
