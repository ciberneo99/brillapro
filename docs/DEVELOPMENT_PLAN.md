# BrillaPro — Plan de desarrollo

Decisiones aprobadas en Fase 0: stack Next.js + Supabase (sin Drizzle: SQL manual + supabase-js); web pública con `/en` y `/es`;
cuentas Supabase/Vercel/GitHub se conectan solo con autorización; `git init` local autorizado; USD inicial con impuestos configurables.

| Fase | Contenido | Depende de |
|---|---|---|
| 0 | Arquitectura y planificación — **completada** (v0.0) | — |
| 1 | Fundación: auth, tenants, roles, RLS, i18n, temas, sidebar, dashboard base — **completada** (`v0.1-fase1`) | 0 |
| 2 | Clientes, prospectos, formulario público, conversión — **completada** (`v0.2-fase2`), con 2 pendientes | 1 |
| 3 | Servicios, checklists, cotizaciones, PDF, Good/Better/Best — **completada** (`v0.3-fase3`); convertir cotización → trabajo pasa al inicio de la Fase 4 | 2 |
| 4 | Trabajos, empleados, calendario, recurrencia, horas, notas, tareas — **completada** (`v0.4-fase4`) | 3 |
| 5 | Facturas, pagos, gastos con recibos, PDF, envío manual — **completada** (`v0.5-fase5`, pendiente de aprobación) | 4 |
| 6 | Inventario y reportes operativos | 5 |
| 7 | Venmo, importación bancaria, contabilidad de doble entrada | 5-6 |
| 8 | Integraciones | 4-5 |
| 9 | Landing, planes, Stripe Billing, Super Admin, lanzamiento | 1-8 |

Regla: no se avanza de fase sin aprobación explícita.

Riesgos: RLS mal diseñada; calendario + recurrencia (F4); contabilidad formal (validar con contador); alcance (Parte 24 excluida).

## Pendientes arrastrados
- **Documentos del cliente** (subida de archivos con Supabase Storage y políticas por empresa): se hará cuando haya otro módulo que también suba archivos (recibos de gastos, Fase 5), para diseñar el almacenamiento una sola vez.
- **Pruebas E2E con Playwright** (registro, login, cliente, solicitud pública): pendientes; se incorporan antes de la Fase 9 y como puerta de CI.
- **Captcha (Turnstile)** en el formulario público: Fase 9.

## Decisiones de producto registradas
- Fechas en formato de la empresa (por defecto MM/DD/YYYY); semana del calendario empieza en domingo.
- Teléfonos xxx-xxx-xxxx, correo estricto, nombres/direcciones con primera letra en mayúscula (el nombre de empresa no se modifica), códigos postales de 5 o 9 dígitos, dinero en centavos.
- Estado (state) del cliente es texto libre.
