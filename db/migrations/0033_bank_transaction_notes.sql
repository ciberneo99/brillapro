-- Optional free-text notes on a bank transaction.
alter table public.bank_transactions add column notes text check (notes is null or char_length(notes) <= 500);
