# INOOS · Comparador de Tarifas

Plataforma web para centralizar las tarifas de proveedores, estandarizar
(homologar) sus ítems con IA y comparar precios en cada proceso de contratación.

> UI en español · código en inglés. Ver el spec completo en
> [`../SPEC_PLATAFORMA_INOOS.md`](../SPEC_PLATAFORMA_INOOS.md).

## Stack

- **Next.js 16** (App Router, TypeScript) — desplegado en Vercel
- **PostgreSQL (Neon) + pgvector** — datos + búsqueda vectorial
- **Prisma** — ORM y migraciones
- **Auth.js (NextAuth v5) + Microsoft Entra ID** — SSO corporativo + RBAC
- **Tailwind CSS** — UI
- **Inngest** — jobs durables del pipeline de normalización (Fase 3)
- **Claude (Anthropic)** — agente de homologación (Fase 3)

## Estado del proyecto

- [x] **Fase 0 — Fundaciones:** Next.js + Prisma + SSO Entra ID + RBAC + app shell.
- [x] **Fase 1 — Data store:** CRUD proveedores/catálogo/tarifas + importador Excel.
- [x] **Fase 2 — Carga y parseo:** procesos, subida de archivo, parseo, mapeo de columnas con IA.
- [x] **Fase 3 — Normalización con IA:** embeddings + pgvector, recuperación de candidatos, agente Claude, pipeline (Inngest + fallback inline), bandeja de revisión que aprende.
- [x] **Fase 4 — Comparación y reportes:** comparación por ítem (mín/máx/prom + mejor precio + ahorro), exportación Excel, reporte imprimible (PDF), página de reportes.
- [ ] **Fase 5 — Avanzadas** · [ ] **Fase 6 — Hardening**

### Activar la IA (Fase 3)

- `ANTHROPIC_API_KEY` — agente de homologación (sin esto usa heurística/léxico).
- `OPENAI_API_KEY` — embeddings para recuperación vectorial (sin esto usa léxico).
- pgvector: `psql "$DIRECT_URL" -f prisma/sql/001_pgvector.sql`, luego `pnpm backfill:embeddings`.
- `INNGEST_EVENT_KEY` — orquestación durable (sin esto la homologación corre inline).

## Puesta en marcha

1. Instalar dependencias:

   ```bash
   pnpm install
   ```

2. Copiar variables de entorno y completarlas:

   ```bash
   cp .env.example .env.local
   ```

   - `DATABASE_URL` / `DIRECT_URL`: Postgres (Neon) con la extensión `vector`.
   - `AUTH_SECRET`: `openssl rand -base64 32`.
   - `AUTH_MICROSOFT_ENTRA_ID_*`: del registro de la app en Entra ID.
   - `ANTHROPIC_API_KEY`: para el agente de homologación (Fase 3).

3. Crear el esquema en la base de datos:

   ```bash
   pnpm exec prisma migrate dev
   ```

4. Levantar el entorno de desarrollo:

   ```bash
   pnpm dev
   ```

## Configuración de Microsoft Entra ID

1. Registrar una aplicación en **Microsoft Entra ID** (Azure Portal).
2. Redirect URI (Web):
   `https://TU-DOMINIO/api/auth/callback/microsoft-entra-id`
   (en local: `http://localhost:3000/api/auth/callback/microsoft-entra-id`).
3. Crear un *client secret*.
4. Configurar el claim de **grupos** en el token y mapear los grupos a roles en
   [`src/lib/rbac.ts`](src/lib/rbac.ts) (`ENTRA_GROUP_TO_ROLE`).

## Estructura

```
prisma/schema.prisma     Modelo de datos (data store layer)
src/auth.config.ts       Config de auth edge-safe (proxy)
src/auth.ts              NextAuth + provisión de usuario (JIT) + roles
src/proxy.ts             Protección de rutas (Next 16 proxy)
src/lib/                 prisma, rbac, format, nav, utils
src/components/          sidebar, topbar, ui
src/app/(app)/           App autenticada (dashboard + secciones)
src/app/iniciar-sesion/  Login SSO
```
