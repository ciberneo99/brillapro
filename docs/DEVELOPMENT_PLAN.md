# BrillaPro — Plan de desarrollo

Decisiones aprobadas en Fase 0: stack Next.js + Supabase + Drizzle; web pública con `/en` y `/es`;
cuentas Supabase/Vercel/GitHub se conectan solo con autorización; `git init` local autorizado; USD inicial con impuestos configurables.

| Fase | Contenido | Depende de |
|---|---|---|
| 0 | Arquitectura y planificación (completada) | — |
| 1 | Fundación: auth, tenants, roles, RLS, i18n, temas, sidebar, dashboard base | 0 |
| 2 | Clientes, prospectos, formulario público, conversión | 1 |
| 3 | Servicios, checklists, cotizaciones, PDF, Good/Better/Best | 2 |
| 4 | Trabajos, empleados, calendario, recurrencia, horas, notas, tareas | 3 |
| 5 | Facturas, pagos, gastos, PDF, envío manual | 4 |
| 6 | Inventario y reportes operativos | 5 |
| 7 | Venmo, importación bancaria, contabilidad de doble entrada | 5-6 |
| 8 | Integraciones | 4-5 |
| 9 | Landing, planes, Stripe Billing, Super Admin, lanzamiento | 1-8 |

Regla: no se avanza de fase sin aprobación explícita.

Riesgos: RLS mal diseñada; calendario + recurrencia (F4); contabilidad formal (validar con contador); alcance (Parte 24 excluida).
