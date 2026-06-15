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

### Capa de IA — proveedores

La IA es agnóstica de proveedor (ver [src/lib/llm.ts](src/lib/llm.ts) y
[src/lib/embeddings.ts](src/lib/embeddings.ts)). Sin ningún proveedor, el sistema
usa recuperación **léxica** y sigue funcionando.

- **Ollama (local):** `LLM_PROVIDER=ollama` + `EMBEDDINGS_PROVIDER=ollama` (ver abajo).
- **Nube:** `ANTHROPIC_API_KEY` (homologación, Claude) + `OPENAI_API_KEY` (embeddings).
- **pgvector:** `pnpm db:vector` (usa `EMBEDDING_DIMS`), luego `pnpm backfill:embeddings`.
- **Inngest** (`INNGEST_EVENT_KEY`): orquestación durable; sin esto la homologación corre inline.

## Puesta en marcha local (Docker + Ollama)

Stack 100% local, sin claves de nube. Requiere Docker y pnpm.

1. **Levantar Postgres (pgvector) + Ollama** y descargar los modelos:

   ```bash
   docker compose up -d        # arranca db + ollama y descarga qwen2.5 + nomic-embed-text
   docker compose logs -f ollama-init   # ver el progreso de descarga (la primera vez tarda)
   ```

2. **Variables de entorno** (la Opción A del ejemplo ya apunta a local):

   ```bash
   cp .env.example .env.local && cp .env.example .env
   # genere AUTH_SECRET: openssl rand -base64 32
   ```

3. **Esquema + pgvector + datos de ejemplo**:

   ```bash
   pnpm install
   pnpm exec prisma migrate dev      # crea las tablas
   pnpm db:vector                    # crea la columna vector con EMBEDDING_DIMS (768)
   pnpm import:excel                 # siembra catálogo + tarifas desde el Excel
   pnpm backfill:embeddings          # genera embeddings con Ollama
   pnpm dev
   ```

> **Modelos:** chat = `qwen2.5` (soporta salida estructurada), embeddings =
> `nomic-embed-text` (768 dims). Si cambia el modelo de embeddings, ajuste
> `EMBEDDING_DIMS` y vuelva a correr `pnpm db:vector` + `pnpm backfill:embeddings`.
>
> **Nota SSO:** Entra ID requiere una app registrada en Azure aunque corra local
> (el redirect a `localhost:3000` funciona). Sin credenciales válidas no podrá
> iniciar sesión; el resto del stack (BD, IA local) sí corre.

## Puesta en marcha (nube)

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
