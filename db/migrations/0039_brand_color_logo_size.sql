-- Invoices and quotes follow the company's brand: a color (picked from the logo when it is uploaded, editable in Settings)
-- and how big the logo is drawn on the PDF. NULL color means the default app green.
alter table public.tenant_settings
  add column brand_color text check (brand_color ~ '^#[0-9a-f]{6}$'),
  add column logo_size   text not null default 'medium' check (logo_size in ('small','medium','large'));
