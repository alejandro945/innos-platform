# Despliegue — INOOS Comparador de Tarifas

Arquitectura objetivo (sin servidores que administrar):

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
│  Inngest   │  (cola durable de homologación)
│  Cloud     │
└────────────┘
```

- **App** → Vercel
- **IA** → **Ollama Cloud API** (solo una API key, sin infra)
- **Base de datos** → **Neon** (Postgres + pgvector)
- **Jobs largos** → Inngest Cloud (la homologación de cientos de ítems no cabe en una función serverless)
- **Archivos crudos** → Vercel Blob

> El código ya es agnóstico de proveedor: apuntar Ollama a la nube es solo
> configurar `OLLAMA_BASE_URL` + `OLLAMA_API_KEY` (sin cambios de código).

---

## 1. Base de datos → Neon

**Por qué Neon:** trae `pgvector` nativo, es *serverless* e incluye
**connection pooling**, que es lo que Vercel necesita.

1. Crea un proyecto en [neon.tech](https://neon.tech).
2. Copia **dos** cadenas:
   - **Pooled** (incluye `-pooler`) → `DATABASE_URL`
   - **Direct** (sin `-pooler`) → `DIRECT_URL`
3. Prepara el esquema (desde tu máquina, con `.env` apuntando a Neon):
   ```bash
   pnpm exec prisma migrate deploy     # crea las tablas
   pnpm db:vector                       # columna vector(EMBEDDING_DIMS) + índice
   pnpm import:excel                    # opcional: siembra catálogo + tarifas
   pnpm backfill:embeddings             # genera embeddings (con Ollama Cloud)
   ```

---

## 2. IA → Ollama Cloud API

1. Crea una API key en **ollama.com → Settings → Keys**.
2. No hay nada que desplegar: la app llamará a la API de Ollama en la nube.
3. Configura en Vercel:
   ```bash
   LLM_PROVIDER="ollama"
   OLLAMA_BASE_URL="https://ollama.com"
   OLLAMA_API_KEY="<tu API key de ollama.com>"
   OLLAMA_CHAT_MODEL="<modelo de chat del catálogo cloud>"
   ```

**Embeddings** — dos caminos según lo que ofrezca tu plan de Ollama Cloud:

- **A) Ollama Cloud tiene modelo de embeddings** (p. ej. `nomic-embed-text`):
  ```bash
  EMBEDDINGS_PROVIDER="ollama"
  OLLAMA_EMBED_MODEL="nomic-embed-text"
  EMBEDDING_DIMS="768"
  ```
- **B) Si Ollama Cloud no expone embeddings**: usa OpenAI solo para embeddings…
  ```bash
  EMBEDDINGS_PROVIDER="openai"
  OPENAI_API_KEY="sk-..."
  EMBEDDINGS_MODEL="text-embedding-3-small"
  EMBEDDING_DIMS="1536"
  ```
  …o **déjalo sin configurar**: la recuperación cae a modo **léxico** (por
  texto) y todo sigue funcionando, solo con menos precisión semántica.

> `EMBEDDING_DIMS` debe coincidir con el modelo. Si lo cambias, vuelve a correr
> `pnpm db:vector` y `pnpm backfill:embeddings`.

> **Verifica** en el catálogo de modelos de Ollama Cloud el nombre exacto del
> modelo de chat (y si hay uno de embeddings) y ponlo en las variables.

---

## 3. Inngest (cola durable)

La homologación de cientos de ítems excede el límite de una función de Vercel,
por eso en producción corre por Inngest (ya integrado: `src/inngest` +
`/api/inngest`).

1. Crea cuenta en [inngest.com](https://www.inngest.com) (free tier).
2. Conecta la app al endpoint `https://TU-APP.vercel.app/api/inngest`.
3. Copia `INNGEST_EVENT_KEY` y `INNGEST_SIGNING_KEY` a Vercel.

> Con `INNGEST_EVENT_KEY` definido, "Iniciar homologación" encola el trabajo
> automáticamente. Sin él intenta correr inline (no apto para serverless).

---

## 4. App en Vercel

1. Importa el repo en [vercel.com](https://vercel.com) (root = `inoos-platform/`).
2. Asegura `prisma generate` en el build: cambia el script a
   `"build": "prisma generate && next build"` (o agrega `postinstall: prisma generate`).
3. Storage → **Blob** → copia `BLOB_READ_WRITE_TOKEN`.
4. Carga las variables de entorno (sección 6) y haz Deploy.

---

## 5. Microsoft Entra ID (SSO en producción)

Agrega el Redirect URI de producción en el registro de Azure:
```
https://TU-APP.vercel.app/api/auth/callback/microsoft-entra-id
```
Deja `LOCAL_ADMIN_*` **vacías** en producción (deshabilita el login local).

---

## 6. Variables de entorno (Vercel)

```bash
# Base de datos (Neon)
DATABASE_URL="postgresql://...-pooler.../inoos?sslmode=require"
DIRECT_URL="postgresql://.../inoos?sslmode=require"

# Auth.js / Entra ID
AUTH_SECRET="openssl rand -base64 32"
AUTH_MICROSOFT_ENTRA_ID_ID="..."
AUTH_MICROSOFT_ENTRA_ID_SECRET="..."
AUTH_MICROSOFT_ENTRA_ID_ISSUER="https://login.microsoftonline.com/TENANT/v2.0"

# IA — Ollama Cloud
LLM_PROVIDER="ollama"
OLLAMA_BASE_URL="https://ollama.com"
OLLAMA_API_KEY="..."
OLLAMA_CHAT_MODEL="..."           # nombre exacto del modelo cloud
EMBEDDINGS_PROVIDER="ollama"      # u "openai", o vacío (léxico)
OLLAMA_EMBED_MODEL="nomic-embed-text"
EMBEDDING_DIMS="768"

# Jobs
INNGEST_EVENT_KEY="..."
INNGEST_SIGNING_KEY="..."

# Archivos
BLOB_READ_WRITE_TOKEN="..."
```

---

## 7. Checklist de primer despliegue

- [ ] Neon creado; `migrate deploy` + `db:vector` ejecutados
- [ ] API key de Ollama Cloud creada; modelo de chat confirmado
- [ ] Embeddings decididos (Ollama / OpenAI / léxico) y `EMBEDDING_DIMS` correcto
- [ ] Inngest conectado a `/api/inngest`
- [ ] Vercel Blob creado
- [ ] Entra ID con redirect de producción
- [ ] `prisma generate` en el build
- [ ] Variables en Vercel → Deploy
- [ ] Smoke test: login → crear proceso → subir archivo → homologar → comparar
