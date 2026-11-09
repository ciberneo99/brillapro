# BrillaPro — Modelo de datos

Implementado hasta la Fase 3 (migraciones `db/migrations/0001`–`0008`). Lo de fases posteriores es propuesta.

## Tablas por fase
- F1: tenants, profiles, memberships, audit_log, tenant_settings, plans, subscriptions (trial por defecto)
- F2: customers, customer_documents
- F3: service_types, checklist_templates, checklist_template_items, quotes, quote_options, quote_lines
- F4: jobs, job_assignments, job_checklist_items (snapshot), recurring_schedules, time_entries, notes, tasks
- F5: invoices, invoice_lines, payments, expense_categories, expenses
- F6: inventory_items, inventory_movements
- F7: import_batches, bank_transactions, accounts, journal_entries, journal_lines, accounting_periods
- F8: integrations

## Fase 3 (implementado)
- service_types (7 por defecto por empresa, sin borrado: se desactivan), checklist_templates (una activa por tipo de servicio), checklist_template_items.
- quotes (numeración por empresa vía tenant_counters), quote_options (Good/Better/Best), quote_lines (conceptos extra sobre toda opción).
- Totales en SQL: función `quote_totals` y vista `quotes_overview`; estados vía `set_quote_status`, copia vía `duplicate_quote`. Solo los borradores se editan.
- tenant_settings: quote_prefix, quote_valid_days, default_tax_rate, quote_terms.

## Convenciones
UUID, `created_at`, `updated_at`, `archived_at`; `tenant_id NOT NULL` con FK; dinero en centavos enteros;
FK compuestas `(tenant_id, id)`; índices en `(tenant_id, ...)`; migraciones SQL versionadas, primero en staging;
cambios destructivos solo con aprobación.

## ER (alto nivel)
```mermaid
erDiagram
  tenants ||--o{ memberships : has
  profiles ||--o{ memberships : joins
  tenants ||--o{ customers : owns
  customers ||--o{ quotes : receives
  quotes ||--o| jobs : becomes
  customers ||--o{ jobs : has
  service_types ||--o{ checklist_templates : uses
  jobs ||--o{ job_checklist_items : snapshots
  jobs ||--o{ job_assignments : assigns
  jobs ||--o{ time_entries : logs
  jobs ||--o{ invoices : bills
  invoices ||--o{ invoice_lines : contains
  invoices ||--o{ payments : receives
  tenants ||--o{ expenses : records
  tenants ||--o{ inventory_items : stocks
  inventory_items ||--o{ inventory_movements : moves
  tenants ||--o{ subscriptions : pays
  plans ||--o{ subscriptions : defines
```
