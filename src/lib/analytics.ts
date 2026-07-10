import { prisma } from "@/lib/prisma";

/** Current rate cards (valid as of `now`) for an organization. */
async function currentRates(organizationId: string) {
  const now = new Date();
  return prisma.rateCard.findMany({
    where: {
      organizationId,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gte: now } }],
    },
    include: { canonicalItem: true, provider: true },
  });
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type PriceAnomaly = {
  rateId: string;
  itemCode: string;
  itemName: string;
  providerName: string;
  value: number;
  median: number;
  ratio: number;
  kind: "high" | "low";
};

/**
 * Flag current rates whose value deviates strongly from the item's median
 * (needs ≥3 prices per item to be meaningful).
 */
export async function detectPriceAnomalies(
  organizationId: string,
  highRatio = 1.5,
  lowRatio = 0.6,
): Promise<PriceAnomaly[]> {
  const rates = await currentRates(organizationId);
  const byItem = new Map<string, typeof rates>();
  for (const r of rates) {
    const list = byItem.get(r.canonicalItemId) ?? [];
    list.push(r);
    byItem.set(r.canonicalItemId, list);
  }

  const anomalies: PriceAnomaly[] = [];
  for (const list of byItem.values()) {
    if (list.length < 3) continue;
    const values = list.map((r) => Number(r.value));
    const med = median(values);
    if (med <= 0) continue;
    for (const r of list) {
      const value = Number(r.value);
      const ratio = value / med;
      if (ratio >= highRatio || ratio <= lowRatio) {
        anomalies.push({
          rateId: r.id,
          itemCode: r.canonicalItem.normativeCode ?? "",
          itemName: r.canonicalItem.name,
          providerName: r.provider.name,
          value,
          median: med,
          ratio,
          kind: ratio >= highRatio ? "high" : "low",
        });
      }
    }
  }
  return anomalies.sort((a, b) => b.ratio - a.ratio);
}

export type ExpiringRate = {
  rateId: string;
  itemCode: string;
  itemName: string;
  providerName: string;
  value: number;
  validTo: Date;
  daysLeft: number;
};

/** Current rates expiring within `days`. */
export async function expiringRates(
  organizationId: string,
  days = 30,
): Promise<ExpiringRate[]> {
  const now = new Date();
  const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const rates = await prisma.rateCard.findMany({
    where: {
      organizationId,
      validTo: { not: null, gte: now, lte: limit },
    },
    include: { canonicalItem: true, provider: true },
    orderBy: { validTo: "asc" },
  });
  return rates.map((r) => ({
    rateId: r.id,
    itemCode: r.canonicalItem.normativeCode ?? "",
    itemName: r.canonicalItem.name,
    providerName: r.provider.name,
    value: Number(r.value),
    validTo: r.validTo!,
    daysLeft: Math.ceil((r.validTo!.getTime() - now.getTime()) / 86400000),
  }));
}

export type SimulatorLine = {
  itemCode: string;
  itemName: string;
  bestProvider: string;
  bestValue: number;
  avgValue: number;
  providerCount: number;
  savings: number; // avg-of-providers - best
};

export type SavingsSimulation = {
  lines: SimulatorLine[];
  totalBest: number;
  totalAvg: number;
  totalSavings: number;
};

/**
 * Recommend the cheapest provider per item, comparing ACROSS providers.
 * Collapses each provider to its cheapest price for the item, and only
 * considers items with at least two distinct providers (a real comparison).
 * "savings" = average across providers − best provider's price.
 */
export async function savingsSimulator(
  organizationId: string,
): Promise<SavingsSimulation> {
  const rates = await currentRates(organizationId);
  const byItem = new Map<string, typeof rates>();
  for (const r of rates) {
    const list = byItem.get(r.canonicalItemId) ?? [];
    list.push(r);
    byItem.set(r.canonicalItemId, list);
  }

  const lines: SimulatorLine[] = [];
  for (const list of byItem.values()) {
    // Cheapest price per provider (ignore zero/blank).
    const perProvider = new Map<
      string,
      { name: string; value: number }
    >();
    for (const r of list) {
      const v = Number(r.value);
      if (!(v > 0)) continue;
      const cur = perProvider.get(r.providerId);
      if (!cur || v < cur.value)
        perProvider.set(r.providerId, { name: r.provider.name, value: v });
    }
    if (perProvider.size < 2) continue; // need ≥2 providers to compare

    const entries = [...perProvider.values()];
    const values = entries.map((e) => e.value);
    const best = entries.reduce((a, b) => (b.value < a.value ? b : a));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const ci = list[0].canonicalItem;
    lines.push({
      itemCode: ci.normativeCode ?? "",
      itemName: ci.name,
      bestProvider: best.name,
      bestValue: best.value,
      avgValue: Math.round(avg),
      providerCount: perProvider.size,
      savings: Math.round(avg - best.value),
    });
  }
  lines.sort((a, b) => b.savings - a.savings);

  return {
    lines,
    totalBest: lines.reduce((a, l) => a + l.bestValue, 0),
    totalAvg: lines.reduce((a, l) => a + l.avgValue, 0),
    totalSavings: lines.reduce((a, l) => a + l.savings, 0),
  };
}
