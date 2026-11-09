# BrillaPro — Arquitectura (Fase 0, aprobada)

## Stack
| Capa | Decisión |
|---|---|
| App | Next.js (App Router) + TypeScript, monolito modular |
| UI | Tailwind CSS + tokens CSS + componentes propios sobre Radix |
| BD | PostgreSQL en Supabase, con RLS |
| Auth | Supabase Auth (JWT integrado con RLS) |
| ORM / migraciones | Drizzle ORM, migraciones SQL versionadas |
| Archivos | Supabase Storage, rutas `tenant_id/...` con políticas |
| PDF | @react-pdf/renderer (servidor) |
| Email | Resend (Fase 8) |
| i18n | next-intl (en, es) |
| Temas | next-themes + tokens CSS |
| Pruebas | Vitest, Playwright, pruebas SQL de RLS |
| Hosting | Vercel + Supabase (dev, staging, prod) |
| SaaS billing | Stripe Billing (Fases 8-9; solo suscripciones de BrillaPro) |

Nota: antes de la Fase 1 se lee la documentación de la versión instalada de Next.js y se fijan versiones exactas.

## Capas
UI (RSC) → Server Actions / Route Handlers (sesión, permisos, Zod) → Servicios de dominio → Repositorios (Drizzle + RLS).
Un módulo solo usa el `service` de otro, nunca sus tablas.

## Áreas
`(marketing)` web pública · `(app)` CRM del negocio · `(admin)` Super Admin.

## Multi-tenant
- Esquema compartido, `tenant_id NOT NULL` en toda tabla de negocio, RLS como segunda barrera.
- `memberships(user_id, tenant_id, role)`: un usuario puede pertenecer a varias empresas.
- El tenant activo sale de la sesión y de la membresía verificada en servidor, nunca del navegador.
- Cada consulta corre en una transacción con los claims del usuario (RLS siempre activa).
- `service_role` solo en un módulo aislado y auditado (Super Admin, webhooks).
- FKs compuestas `(tenant_id, id)` para impedir referencias cruzadas entre empresas.
- Storage con prefijo `tenant_id/` validado por política.
- Pruebas de aislamiento (dos tenants, leer/editar/borrar/descargar) bloquean el CI.

## Permisos
Roles de empresa: owner, admin, manager, office_staff, employee, accountant_readonly.
Rol de plataforma: super_admin (tabla aparte). Matriz `recurso:acción` verificada en cada acción de servidor.
`employee` solo ve trabajos asignados (impuesto también por RLS). Acciones sensibles → `audit_log`.

## i18n
`messages/en.json` y `messages/es.json` por módulo. Web pública con `/en` y `/es`; app privada usa el idioma del perfil.
Idioma de documentos (PDF/email) independiente de la interfaz. Prueba de CI por claves faltantes.

## Temas
Tokens semánticos en `:root` y `[data-theme=dark]`; script inline en `<head>` contra destellos;
preferencia en `profiles.theme` + cookie; System Default sigue `prefers-color-scheme`. Contraste WCAG AA.

## Dinero y numeración
Centavos enteros; moneda por empresa (inicial USD, impuestos configurables). Numeración secuencial por empresa vía contador transaccional.
Saldos y estados vencida/parcial se derivan de los pagos.

## Estructura
```
src/app/{(marketing),(app),(admin),api}
src/modules/<dominio>/{actions,service,repo,schema,components}
src/components/ui · src/lib/{db,auth,permissions,i18n,money,audit} · src/styles/tokens.css
messages/ · db/{migrations,policies,seeds} · tests/{unit,e2e,rls} · docs/
```

## Git
Repo `brillapro`, rama `main` protegida, ramas `feat/ fix/ chore/`, Conventional Commits, tag por fase.
Sin push ni conexión a cuentas externas sin autorización expresa.
