import { getDocumentProxy, extractText } from "unpdf";

/** Extract plain text from a PDF's raw bytes (serverless-friendly, no native canvas needed). */
export async function extractPdfText(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

const CHUNK_SIZE = 8000;
const CHUNK_OVERLAP = 500;

/**
 * Split extracted text into overlapping chunks for the LLM extraction pass.
 * Resolutions list codes in long tabular form, so overlap guards against a
 * code/description pair being split exactly at a chunk boundary.
 */
export function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): string[] {
  const clean = text.replace(/[ \t]+\n/g, "\n").trim();
  if (clean.length <= chunkSize) return clean ? [clean] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks;
}
