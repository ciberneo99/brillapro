-- Customers: a label for each phone number (cell, work, spouse, other) and "referred by" (free text).
alter table public.customers
  add column phone_label           text not null default 'cell' check (phone_label in ('cell','work','spouse','other')),
  add column secondary_phone_label text not null default 'cell' check (secondary_phone_label in ('cell','work','spouse','other')),
  add column referred_by           text check (char_length(referred_by) <= 150);
grant update (phone_label, secondary_phone_label, referred_by) on public.customers to authenticated;
