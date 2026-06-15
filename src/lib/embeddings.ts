/**
 * Embeddings abstraction for candidate retrieval.
 * Uses OpenAI embeddings when OPENAI_API_KEY is set; returns null otherwise so
 * callers can fall back to lexical retrieval.
 */

export const EMBEDDING_DIMS = 1536;

const MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";

export function isEmbeddingsEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Normalize text before embedding (lowercase, collapse whitespace). */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const input = normalizeText(text);
  if (!input) return null;

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input }),
  });
  if (!res.ok) {
    console.error("Embedding request failed:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0]?.embedding ?? null;
}

/** Batch embeddings (preserves order). Returns null entries on failure. */
export async function getEmbeddings(
  texts: string[],
): Promise<(number[] | null)[]> {
  if (!process.env.OPENAI_API_KEY) return texts.map(() => null);
  const inputs = texts.map(normalizeText);

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input: inputs }),
  });
  if (!res.ok) {
    console.error("Batch embedding failed:", res.status);
    return texts.map(() => null);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding ?? null);
}
