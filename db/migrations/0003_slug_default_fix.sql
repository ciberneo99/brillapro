-- 0002 gave public_slug a column default, which ran before the BEFORE INSERT trigger and produced
-- generic "company-xxxxxx" slugs. Let the trigger (which sees the company name) be the only source.
alter table public.tenants alter column public_slug drop default;
