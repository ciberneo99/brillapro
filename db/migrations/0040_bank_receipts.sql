-- Bank statement lines can carry a receipt file and can be matched with an expense that was entered from a receipt.

alter table public.bank_transactions
  add column receipt_path text check (receipt_path is null or char_length(receipt_path) <= 300),
  add column expense_id uuid references public.expenses(id) on delete set null;

-- An expense matches at most one bank line.
create unique index bank_transactions_expense_idx on public.bank_transactions (expense_id) where expense_id is not null;

-- Accountants manage the bank lines, so they may also attach their receipt files.
drop policy receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.has_role(public.storage_tenant(name), array['owner','admin','office_staff','accountant']));
drop policy receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.has_role(public.storage_tenant(name), array['owner','admin','office_staff','accountant']));
