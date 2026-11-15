-- Payment methods are now editable text codes (0043). Keep the database strict about their shape: lowercase letters, digits and underscores only.
alter table public.payments add constraint payments_method_format check (method ~ '^[a-z0-9_]{1,40}$');
alter table public.expenses add constraint expenses_payment_method_format check (payment_method is null or payment_method ~ '^[a-z0-9_]{1,40}$');
