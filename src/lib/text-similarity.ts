import { normalizeText } from "@/lib/embeddings";

/** Token Jaccard similarity — the lexical fallback shared by retrieval, catalog
 * dedupe, and SISPRO name verification. */
export function lexicalScore(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
