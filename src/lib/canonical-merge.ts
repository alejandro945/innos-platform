import type { Prisma } from "@prisma/client";

/**
 * Repoint every RateCard/ItemMapping/CanonicalCode from one canonical item to
 * another. Used both when an admin manually merges two catalog duplicates
 * (`mergeCanonicalItems`) and when a regulatory update replaces an item's
 * normative code with a freshly-created successor item — same operation,
 * different trigger. Codes that would collide with one `toId` already has are
 * left behind (the caller is expected to delete/deactivate `fromId` after).
 */
export async function repointCanonicalItem(
  tx: Prisma.TransactionClient,
  { fromId, toId }: { fromId: string; toId: string },
): Promise<void> {
  await tx.rateCard.updateMany({
    where: { canonicalItemId: fromId },
    data: { canonicalItemId: toId },
  });
  await tx.itemMapping.updateMany({
    where: { canonicalItemId: fromId },
    data: { canonicalItemId: toId },
  });

  const fromCodes = await tx.canonicalCode.findMany({
    where: { canonicalItemId: fromId },
  });
  for (const code of fromCodes) {
    const clash = await tx.canonicalCode.findFirst({
      where: { canonicalItemId: toId, system: code.system, code: code.code },
      select: { id: true },
    });
    if (!clash) {
      await tx.canonicalCode.update({
        where: { id: code.id },
        data: { canonicalItemId: toId },
      });
    }
  }
}
