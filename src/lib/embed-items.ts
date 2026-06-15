import { prisma } from "@/lib/prisma";
import { getEmbedding, isEmbeddingsEnabled } from "@/lib/embeddings";
import { upsertItemEmbedding } from "@/lib/vector";

/** Compose the text used to embed a canonical item. */
function itemText(item: { name: string; description: string | null }): string {
  return [item.name, item.description].filter(Boolean).join(". ");
}

/** Generate and store the embedding for one canonical item (no-op without keys). */
export async function embedCanonicalItem(canonicalItemId: string): Promise<void> {
  if (!isEmbeddingsEnabled()) return;
  const item = await prisma.canonicalItem.findUnique({
    where: { id: canonicalItemId },
    select: { id: true, name: true, description: true },
  });
  if (!item) return;
  const vector = await getEmbedding(itemText(item));
  if (vector) await upsertItemEmbedding(item.id, vector);
}

/** Backfill embeddings for all canonical items in an organization. */
export async function backfillEmbeddings(organizationId: string): Promise<number> {
  if (!isEmbeddingsEnabled()) return 0;
  const items = await prisma.canonicalItem.findMany({
    where: { organizationId },
    select: { id: true, name: true, description: true },
  });
  let done = 0;
  for (const item of items) {
    const vector = await getEmbedding(itemText(item));
    if (vector) {
      await upsertItemEmbedding(item.id, vector);
      done++;
    }
  }
  return done;
}
