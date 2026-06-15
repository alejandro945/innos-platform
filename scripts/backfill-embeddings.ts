/**
 * Generate embeddings for all canonical items (requires OPENAI_API_KEY +
 * pgvector installed). Run after importing/seeding the catalog:
 *   pnpm backfill:embeddings
 */
import { PrismaClient } from "@prisma/client";
import { backfillEmbeddings } from "../src/lib/embed-items";

const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    const n = await backfillEmbeddings(org.id);
    console.log(`${org.name}: ${n} embeddings generadas.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
