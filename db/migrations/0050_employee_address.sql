-- Employees: home address (street, city, state, ZIP) and one optional additional phone. All optional; existing rows stay valid.
alter table public.employees
  add column address  text check (char_length(address)  <= 300),
  add column city     text check (char_length(city)     <= 100),
  add column state    text check (char_length(state)    <= 60),
  add column zip_code text check (char_length(zip_code) <= 20),
  add column phone_2  text check (char_length(phone_2)  <= 30);

grant update (address, city, state, zip_code, phone_2) on public.employees to authenticated;
