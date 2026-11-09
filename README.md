# BrillaPro

SaaS CRM y gestión para empresas de limpieza residencial y comercial. Multi-tenant, bilingüe (EN/ES), con tema claro/oscuro/sistema.

Documentación: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATABASE.md](docs/DATABASE.md) · [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)

## Requisitos
- Node 22+ (probado con 24) y npm
- Un proyecto de Supabase (usa uno **de desarrollo**)

## Configuración local
1. `npm install`
2. Copia `.env.example` a `.env.local` y completa:
   - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API; la clave publishable/anon).
   - `DATABASE_URL`: cadena **Session pooler** (Connect → Session pooler), con tu contraseña. Solo para migraciones y pruebas RLS.
   - `NEXT_PUBLIC_APP_URL=http://localhost:3200`
3. En Supabase → Authentication → URL Configuration, permite `http://localhost:3200/auth/callback`.
4. `npm run db:migrate` aplica `db/migrations/*.sql` (una sola vez cada una).
5. `npm run dev` → http://localhost:3200

Nunca subas `.env.local`. La clave `service_role` no se usa en la app todavía.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (puerto 3200) |
| `npm run build` | Build de producción |
| `npm run typecheck` / `npm run lint` | Tipos y lint |
| `npm test` | Pruebas unitarias |
| `npm run test:rls` | Pruebas de aislamiento entre empresas contra la BD real (`DATABASE_URL`). Crean y borran sus propios datos: usa solo una BD de desarrollo |
| `npm run db:migrate` | Aplica migraciones pendientes |

## Estructura
```
src/app/(auth)   login, registro, recuperación, onboarding
src/app/(app)    aplicación privada (dashboard, settings, módulos)
src/lib          permisos, sesión, clientes Supabase, preferencias
src/i18n + messages/{en,es}.json
db/migrations    SQL versionado (tablas + RLS)
tests/{unit,rls}
```

## Seguridad en una línea
La empresa activa sale de una membresía verificada en servidor; Postgres aplica RLS por `tenant_id` como segunda barrera; los permisos por rol se validan en cada acción.
