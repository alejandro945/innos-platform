/**
 * Embeddings abstraction for candidate retrieval.
 * Supports OpenAI and Ollama (local). Returns null when no provider is
 * configured so callers fall back to lexical retrieval.
 */

export type EmbeddingsProvider = "openai" | "ollama" | "none";

/** Vector dimension — MUST match the pgvector column. Configure per model. */
export const EMBEDDING_DIMS = Number(process.env.EMBEDDING_DIMS) || 1536;

function provider(): EmbeddingsProvider {
  const p = process.env.EMBEDDINGS_PROVIDER?.toLowerCase();
  if (p === "openai" || p === "ollama") return p;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.OLLAMA_BASE_URL) return "ollama";
  return "none";
}

export function isEmbeddingsEnabled(): boolean {
  return provider() !== "none";
}

/** Normalize text before embedding (lowercase, strip accents, collapse space). */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const OPENAI_MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";
const OLLAMA_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

function ollamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL || "http://localhost:11434";
}

async function openaiEmbed(inputs: string[]): Promise<(number[] | null)[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: OPENAI_MODEL, input: inputs }),
  });
  if (!res.ok) {
    console.error("OpenAI embeddings failed:", res.status);
    return inputs.map(() => null);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding ?? null);
}

async function ollamaEmbed(inputs: string[]): Promise<(number[] | null)[]> {
  const res = await fetch(`${ollamaBaseUrl()}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, input: inputs }),
  });
  if (!res.ok) {
    console.error("Ollama embeddings failed:", res.status);
    return inputs.map(() => null);
  }
  const data = (await res.json()) as { embeddings?: number[][] };
  if (!data.embeddings) return inputs.map(() => null);
  return inputs.map((_, i) => data.embeddings![i] ?? null);
}

async function embedBatch(inputs: string[]): Promise<(number[] | null)[]> {
  const p = provider();
  if (p === "openai") return openaiEmbed(inputs);
  if (p === "ollama") return ollamaEmbed(inputs);
  return inputs.map(() => null);
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  const input = normalizeText(text);
  if (!input || provider() === "none") return null;
  const [vec] = await embedBatch([input]);
  return vec ?? null;
}

/** Batch embeddings (preserves order). Returns null entries on failure. */
export async function getEmbeddings(
  texts: string[],
): Promise<(number[] | null)[]> {
  if (provider() === "none") return texts.map(() => null);
  return embedBatch(texts.map(normalizeText));
}
