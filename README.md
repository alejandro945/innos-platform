# INOOS · Comparador de Tarifas

Plataforma web para centralizar las tarifas de proveedores, **estandarizar
(homologar) sus ítems con IA** y comparar precios en cada proceso de
contratación.

---

## Arquitectura

```
┌────────────┐   HTTPS (pooled)   ┌─────────────────────┐
│  Vercel    │ ─────────────────▶ │  Neon (Postgres +   │
│  Next.js   │                    │  pgvector)          │
│  + /api/   │                    └─────────────────────┘
│   inngest  │   HTTPS (API key)
└─────┬──────┘ ─────────────────▶ ┌─────────────────────┐
      │                            │  Ollama Cloud API   │
      │  webhooks                  │  (LLM + embeddings) │
      ▼                            └─────────────────────┘
┌────────────┐
│  Inngest   │  cola durable de homologación
│  Cloud     │
└────────────┘
```

| Capa | Tecnología | Rol |
|---|---|---|
| App | **Next.js 16** (App Router, TS) en **Vercel** | UI + server actions + API |
| Datos | **Postgres (Neon) + pgvector** vía **Prisma** | data store + búsqueda vectorial |
| Auth | **Auth.js (NextAuth v5) + Microsoft Entra ID** | SSO + RBAC (5 roles); login local opcional |
| IA | **Ollama** (local o Cloud) / Anthropic / OpenAI | homologación + embeddings (agnóstico de proveedor) |
| Jobs | **Inngest** | pipeline de normalización durable (fallback inline en dev) |
| UI | **Tailwind CSS** + sonner | componentes, toasts |
| Archivos | **Vercel Blob** | evidencia de los archivos crudos |

### Flujo de negocio
Crear proceso → subir archivo del proveedor → parsear + **mapeo de columnas con
IA** → **homologar con IA + revisión humana** (que aprende) → **comparar** contra
el repositorio → **cargar las tarifas** homologadas al repositorio → exportar.

### Capa de IA — agnóstica de proveedor
Ver [src/lib/llm.ts](src/lib/llm.ts) y [src/lib/embeddings.ts](src/lib/embeddings.ts).
Se elige por `LLM_PROVIDER` / `EMBEDDINGS_PROVIDER` (o por las claves presentes).
**Sin ningún proveedor configurado, la recuperación cae a modo léxico y todo
sigue funcionando.**

- **Ollama** (local con Docker, o **Ollama Cloud** con API key) — `LLM_PROVIDER=ollama`
- **Anthropic** (Claude) para razonamiento + **OpenAI** para embeddings — opción nube
- `EMBEDDING_DIMS` **debe** coincidir con el modelo de embeddings (nomic=768, OpenAI 3-small=1536). Si cambia, re-ejecute `pnpm db:vector` + `pnpm backfill:embeddings`.

---

## Estructura del proyecto

```
prisma/schema.prisma     Modelo de datos (data store layer)
prisma/sql/              SQL de pgvector (referencia)
scripts/                 db:vector · backfill:embeddings
src/auth.config.ts       Config de auth edge-safe (usada por el proxy)
src/auth.ts              NextAuth + provisión JIT + roles + login local
src/proxy.ts             Protección de rutas (Next 16 proxy)
src/inngest/             Cliente + función durable de normalización
src/lib/                 prisma, llm, embeddings, retrieval, homologation,
                         normalize, comparison, analytics, nl-search, …
src/components/          modal, table-filters, combobox, mutate-button, …
src/app/(app)/           App autenticada (dashboard + secciones)
src/app/iniciar-sesion/  Login (SSO + admin local)
src/app/api/inngest/     Endpoint de Inngest
```

---

## Puesta en marcha local (Docker + Ollama)

Stack 100% local, sin claves de nube. Requiere Docker y pnpm.

```bash
# 1) Postgres (pgvector) + Ollama + descarga de modelos
docker compose up -d
docker compose logs -f ollama-init     # esperar a "Models ready"

# 2) Variables de entorno (la Opción A ya apunta a local)
cp .env.example .env.local && cp .env.example .env
#   genere AUTH_SECRET:  openssl rand -base64 32

# 3) Esquema + pgvector + datos de ejemplo
pnpm install
pnpm exec prisma migrate dev      # crea las tablas
pnpm db:vector                    # columna vector(EMBEDDING_DIMS) + índice HNSW
pnpm backfill:embeddings          # genera embeddings con Ollama
pnpm dev
```

**Login local sin SSO:** con `LOCAL_ADMIN_EMAIL` + `LOCAL_ADMIN_PASSWORD` (ya en
`.env.example`), el login muestra un formulario de administrador que entra con rol
`ADMIN`, sin Azure. Déjelas **vacías en producción** para deshabilitarlo.

**Comandos útiles:** `pnpm test` (Vitest) · `pnpm lint` · `pnpm build`.

---

## Despliegue en producción (Vercel + Neon + Ollama Cloud)

Todo gestionado, sin servidores de IA que administrar.

### 1. Base de datos → Neon
`pgvector` nativo, *serverless* y con **connection pooling** (lo que Vercel
necesita).
1. Crea un proyecto en [neon.tech](https://neon.tech).
2. Copia dos cadenas: **pooled** (`-pooler`) → `DATABASE_URL`; **direct** → `DIRECT_URL`.
3. Prepara el esquema (con `.env` apuntando a Neon):
   ```bash
   pnpm exec prisma migrate deploy
   pnpm db:vector
   pnpm backfill:embeddings
   ```

### 2. IA → Ollama (elige una)

**Opción A — Ollama Cloud** (gestionado, requiere suscripción para varios modelos):
1. API key en **ollama.com → Settings → Keys**.
2. `OLLAMA_BASE_URL=https://ollama.com` + `OLLAMA_API_KEY` + `OLLAMA_CHAT_MODEL`
   (nombre exacto del catálogo cloud que soporte `format`).

**Opción B — Ollama autohospedado en Oracle Cloud (Always Free)** — gratis, CPU:

1. **VM**: OCI → Compute → Instance → Ubuntu 22.04, shape
   **VM.Standard.A1.Flex** (Ampere ARM), 4 OCPU / 24 GB (Always Free). Guarda la
   IP pública y tu llave SSH.
2. **Red OCI**: en la VCN → Security List/NSG agrega Ingress TCP 80 y 443 desde
   `0.0.0.0/0`.
3. **Firewall del SO** (las imágenes de Oracle traen iptables restrictivo):
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
4. **Instala Ollama y baja modelos** (queda en `127.0.0.1:11434`, privado):
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ollama pull qwen2.5:3b
   ollama pull nomic-embed-text
   ```
5. **Caddy como proxy con token + HTTPS** (necesitas un dominio apuntando a la IP
   para TLS automático de Let's Encrypt):
   ```bash
   sudo apt install -y caddy
   ```
   `/etc/caddy/Caddyfile`:
   ```
   ollama.TU-DOMINIO.com {
     @unauth not header Authorization "Bearer {$OLLAMA_TOKEN}"
     respond @unauth 401
     reverse_proxy 127.0.0.1:11434
   }
   ```
   Define el token y reinicia:
   ```bash
   sudo systemctl edit caddy   # agrega: [Service]\nEnvironment=OLLAMA_TOKEN=<token-largo>
   sudo systemctl restart caddy
   ```
6. **Configura la app**:
   ```bash
   OLLAMA_BASE_URL=https://ollama.TU-DOMINIO.com
   OLLAMA_API_KEY=<el mismo OLLAMA_TOKEN>
   OLLAMA_CHAT_MODEL=qwen2.5:3b
   ```
   > Sin dominio puedes usar `http://IP_VM:11434` (la app llama server-to-server,
   > no hay mixed-content), pero el tráfico viajaría sin cifrar — usa el proxy con
   > token y, si puedes, HTTPS. Rendimiento: en CPU, `qwen2.5:3b` es el punto
   > dulce; modelos 7B+ funcionan pero más lentos (Inngest lo hace tolerable).

**Embeddings (cualquier opción):** `nomic-embed-text` (768) si tu Ollama lo
expone, OpenAI (1536), o vacío → modo léxico. Si fallan, el sistema cae a léxico
automáticamente.

### 3. Inngest (cola durable — necesario en serverless)
La homologación de cientos de ítems excede el límite de una función de Vercel.
1. Cuenta en [inngest.com](https://www.inngest.com).
2. Conéctala a `https://TU-APP.vercel.app/api/inngest`.
3. Copia `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` a Vercel.

### 4. App en Vercel
1. Importa el repo (root = `inoos-platform/`).
2. Build con Prisma: usa `"build": "prisma generate && next build"` (o
   `postinstall: prisma generate`).
3. Storage → **Blob** → copia `BLOB_READ_WRITE_TOKEN`.
4. Carga las variables de entorno (abajo) y haz Deploy.

### 5. Microsoft Entra ID (SSO)
1. Registra una app en **Entra ID** (Azure Portal) y crea un *client secret*.
2. Redirect URI: `https://TU-APP.vercel.app/api/auth/callback/microsoft-entra-id`
   (local: `http://localhost:3000/api/auth/callback/microsoft-entra-id`).
3. Activa el claim de **grupos** en el token y mapéalos a roles en
   [src/lib/rbac.ts](src/lib/rbac.ts) (`ENTRA_GROUP_TO_ROLE`).

---

## Variables de entorno

En Next.js solo las variables `NEXT_PUBLIC_*` llegan al navegador; **todas las de
abajo son del servidor** (seguras). En Vercel se agregan al proyecto (scope
Production/Preview).

```bash
# Base de datos (Neon en prod; docker en local)
DATABASE_URL=
DIRECT_URL=

# Auth.js / Entra ID
AUTH_SECRET=                         # openssl rand -base64 32
AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ISSUER=      # https://login.microsoftonline.com/TENANT/v2.0

# Login local sin SSO (vacías en producción)
LOCAL_ADMIN_EMAIL=
LOCAL_ADMIN_PASSWORD=

# IA — Ollama (local http://localhost:11434 · Cloud https://ollama.com)
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=
OLLAMA_API_KEY=                      # requerido en Ollama Cloud
OLLAMA_CHAT_MODEL=
EMBEDDINGS_PROVIDER=ollama           # u "openai", o vacío (léxico)
OLLAMA_EMBED_MODEL=nomic-embed-text
EMBEDDING_DIMS=768                   # nomic=768 · OpenAI 3-small=1536
# OPENAI_API_KEY=                    # si EMBEDDINGS_PROVIDER=openai
# ANTHROPIC_API_KEY=                 # si LLM_PROVIDER=anthropic

# Jobs (sin esto, la homologación corre inline — solo dev)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Archivos
BLOB_READ_WRITE_TOKEN=
```

> **pgvector y Prisma:** la columna `embedding` la gestiona `pnpm db:vector`, NO
> Prisma. Evite `prisma db push` a secas (querrá borrarla); para cambios aditivos
> use `prisma migrate` o `prisma db execute`, y si recrea la columna vuelva a
> correr `pnpm backfill:embeddings`.

---

## Estado del proyecto

- [x] **Fase 0 — Fundaciones:** Next.js + Prisma + SSO Entra ID + RBAC + app shell.
- [x] **Fase 1 — Data store:** CRUD proveedores/catálogo/tarifas + importador Excel.
- [x] **Fase 2 — Carga y parseo:** procesos, subida de archivo, parseo, mapeo de columnas con IA.
- [x] **Fase 3 — Normalización con IA:** embeddings + pgvector, recuperación de candidatos, agente LLM, pipeline (Inngest + fallback inline), bandeja de revisión que aprende.
- [x] **Fase 4 — Comparación y reportes:** comparación por ítem (mín/máx/prom + mejor precio + ahorro), exportación Excel, reporte imprimible (PDF), página de reportes.
- [x] **Fase 5 — Avanzadas:** búsqueda en lenguaje natural (IA), simulador de ahorro / recomendación de adjudicación, anomalías de precio, alertas de vencimiento, alertas en el dashboard.
- [x] **UX:** toasts, modales accesibles, búsqueda + filtros en tablas, revisión en lote (alta confianza / crear-aprobar sin-match / selección múltiple) con typeahead y candidatos IA, error boundary, vista previa de mapeo, onboarding, comparación 1-por-proveedor, administración (usuarios + auditoría), homologación con progreso + pausar/reanudar resiliente.
- [ ] **Fase 6 — Hardening** (tests e2e, observabilidad)
