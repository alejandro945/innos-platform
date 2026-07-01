import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ComparisonOption = {
  providerId: string;
  providerName: string;
  value: number | null;
  inclusions: string | null;
  exclusions: string | null;
};

export type ComparisonLineData = {
  canonicalItemId: string;
  canonicalCode: string;
  canonicalName: string;
  minValue: number | null;
  maxValue: number | null;
  avgValue: number | null;
  bestProviderId: string | null;
  savings: number | null; // max - min (potential)
  options: ComparisonOption[];
};

/**
 * Build and persist a comparison for a process: groups approved homologations
 * by canonical item and computes min/max/avg + best price + potential savings.
 */
export async function generateComparison(
  processId: string,
  organizationId: string,
): Promise<string> {
  const items = await prisma.providerItem.findMany({
    where: {
      upload: { processId, process: { organizationId } },
      mapping: {
        canonicalItemId: { not: null },
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
      },
    },
    include: {
      provider: true,
      mapping: { include: { canonicalItem: true } },
    },
  });

  // Group by canonical item.
  const groups = new Map<string, ComparisonLineData>();
  for (const it of items) {
    const ci = it.mapping?.canonicalItem;
    if (!ci) continue;
    const value = it.rawPrice ? Number(it.rawPrice) : null;

    let line = groups.get(ci.id);
    if (!line) {
      line = {
        canonicalItemId: ci.id,
        canonicalCode: ci.canonicalCode,
        canonicalName: ci.name,
        minValue: null,
        maxValue: null,
        avgValue: null,
        bestProviderId: null,
        savings: null,
        options: [],
      };
      groups.set(ci.id, line);
    }
    line.options.push({
      providerId: it.providerId,
      providerName: it.provider.name,
      value,
      inclusions: it.inclusions,
      exclusions: it.exclusions,
    });
  }

  // Compute stats per line.
  for (const line of groups.values()) {
    const priced = line.options.filter(
      (o): o is ComparisonOption & { value: number } => o.value !== null,
    );
    if (priced.length > 0) {
      const values = priced.map((o) => o.value);
      line.minValue = Math.min(...values);
      line.maxValue = Math.max(...values);
      line.avgValue =
        Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      line.savings = line.maxValue - line.minValue;
      line.bestProviderId =
        priced.find((o) => o.value === line.minValue)?.providerId ?? null;
    }
  }

  const lines = [...groups.values()].sort((a, b) =>
    a.canonicalCode.localeCompare(b.canonicalCode),
  );

  const totalSavings = lines.reduce((acc, l) => acc + (l.savings ?? 0), 0);

  const comparison = await prisma.$transaction(async (tx) => {
    const created = await tx.comparison.create({
      data: {
        processId,
        summary: {
          itemCount: lines.length,
          totalSavings,
        } as Prisma.InputJsonValue,
      },
    });
    if (lines.length > 0) {
      await tx.comparisonLine.createMany({
        data: lines.map((l) => ({
          comparisonId: created.id,
          canonicalItemId: l.canonicalItemId,
          minValue: l.minValue,
          maxValue: l.maxValue,
          avgValue: l.avgValue,
          optionCount: l.options.length,
          bestProviderId: l.bestProviderId,
          options: {
            canonicalCode: l.canonicalCode,
            canonicalName: l.canonicalName,
            savings: l.savings,
            options: l.options,
          } as Prisma.InputJsonValue,
        })),
      });
    }
    await tx.procurementProcess.update({
      where: { id: processId },
      data: { status: "COMPLETED" },
    });
    return created;
  });

  return comparison.id;
}

/** Shape stored in ComparisonLine.options (denormalized for rendering/export). */
export type StoredLineOptions = {
  canonicalCode: string;
  canonicalName: string;
  savings: number | null;
  options: ComparisonOption[];
};

export type LoadedComparisonLine = {
  id: string;
  minValue: string | null;
  maxValue: string | null;
  avgValue: string | null;
  bestProviderId: string | null;
  optionCount: number;
  data: StoredLineOptions;
};

export type LoadedComparison = {
  id: string;
  generatedAt: Date;
  processName: string;
  totalSavings: number;
  totalItems: number;
  page: number;
  pageSize: number | null;
  lines: LoadedComparisonLine[];
};

function toLine(l: {
  id: string;
  minValue: Prisma.Decimal | null;
  maxValue: Prisma.Decimal | null;
  avgValue: Prisma.Decimal | null;
  bestProviderId: string | null;
  optionCount: number;
  options: unknown;
}): LoadedComparisonLine {
  return {
    id: l.id,
    minValue: l.minValue?.toString() ?? null,
    maxValue: l.maxValue?.toString() ?? null,
    avgValue: l.avgValue?.toString() ?? null,
    bestProviderId: l.bestProviderId,
    optionCount: l.optionCount,
    data: l.options as unknown as StoredLineOptions,
  };
}

/**
 * Load the most recent comparison for a process (scoped to the org).
 *
 * Without `pagination`, returns every line (used by the Excel export and the
 * printable report, which need the full dataset). With `pagination`, returns
 * only that page's lines so the UI never renders thousands of rows at once —
 * ordering by canonical code is resolved with a lightweight id+code pass
 * first, so only the requested page pays for the full (heavier) option JSON.
 */
export async function getLatestComparison(
  processId: string,
  organizationId: string,
  pagination?: { page: number; pageSize: number },
): Promise<LoadedComparison | null> {
  const comparison = await prisma.comparison.findFirst({
    where: { processId, process: { organizationId } },
    orderBy: { generatedAt: "desc" },
    select: { id: true, generatedAt: true, summary: true, process: { select: { name: true } } },
  });
  if (!comparison) return null;

  const summary = (comparison.summary ?? {}) as {
    totalSavings?: number;
    itemCount?: number;
  };

  if (!pagination) {
    const lines = await prisma.comparisonLine.findMany({
      where: { comparisonId: comparison.id },
    });
    return {
      id: comparison.id,
      generatedAt: comparison.generatedAt,
      processName: comparison.process.name,
      totalSavings: summary.totalSavings ?? 0,
      totalItems: lines.length,
      page: 1,
      pageSize: null,
      lines: lines
        .map(toLine)
        .sort((a, b) => a.data.canonicalCode.localeCompare(b.data.canonicalCode)),
    };
  }

  const { page, pageSize } = pagination;

  // Lightweight pass: order is stored inside the JSON `options` column, so we
  // fetch just id + canonicalCode for every line to compute the sorted page
  // window, without paying to deserialize the full option list for all rows.
  const index = await prisma.comparisonLine.findMany({
    where: { comparisonId: comparison.id },
    select: { id: true, options: true },
  });
  const sorted = index
    .map((l) => ({ id: l.id, code: (l.options as { canonicalCode?: string }).canonicalCode ?? "" }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const start = (page - 1) * pageSize;
  const pageIds = sorted.slice(start, start + pageSize).map((l) => l.id);
  const pageOrder = new Map(pageIds.map((id, i) => [id, i]));

  const lines = pageIds.length
    ? await prisma.comparisonLine.findMany({ where: { id: { in: pageIds } } })
    : [];
  lines.sort((a, b) => (pageOrder.get(a.id) ?? 0) - (pageOrder.get(b.id) ?? 0));

  return {
    id: comparison.id,
    generatedAt: comparison.generatedAt,
    processName: comparison.process.name,
    totalSavings: summary.totalSavings ?? 0,
    totalItems: sorted.length,
    page,
    pageSize,
    lines: lines.map(toLine),
  };
}
