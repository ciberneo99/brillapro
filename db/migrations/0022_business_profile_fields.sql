-- Business profile: city, state, ZIP and website (the street goes in the existing address column).
alter table public.tenant_settings
  add column city     text check (char_length(city) <= 80),
  add column state    text check (char_length(state) <= 40),
  add column zip_code text check (char_length(zip_code) <= 10),
  add column website  text check (char_length(website) <= 200);
