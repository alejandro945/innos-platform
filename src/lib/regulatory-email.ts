import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export type RegulatoryEmailDraft = {
  providerId: string;
  providerName: string;
  contactEmail: string | null;
  subject: string;
  body: string;
};

/**
 * Build one email draft per provider affected by an applied regulatory
 * update — deterministic template, no LLM call (the content is mechanical
 * data substitution, more reliable than generation). The admin copies and
 * sends it manually; the platform never sends email itself.
 */
export async function buildRegulatoryEmailDrafts(
  regulatoryUpdateId: string,
): Promise<RegulatoryEmailDraft[]> {
  const update = await prisma.regulatoryUpdate.findUnique({
    where: { id: regulatoryUpdateId },
    select: { resolutionNumber: true, resolutionDate: true },
  });
  if (!update) return [];

  const applied = await prisma.cupsCodeChange.findMany({
    where: {
      regulatoryUpdateId,
      status: "APPLIED",
      createdItemId: { not: null },
      newCode: { not: null },
    },
    select: { oldCode: true, newCode: true, createdItemId: true },
  });
  if (applied.length === 0) return [];

  const changeByCreatedItemId = new Map(
    applied.map((c) => [c.createdItemId as string, c]),
  );

  // The repoint that ran when each change was applied already moved these
  // providers' rates onto the new item — that's exactly who needs to know.
  const rates = await prisma.rateCard.findMany({
    where: { canonicalItemId: { in: [...changeByCreatedItemId.keys()] } },
    select: {
      canonicalItemId: true,
      provider: { select: { id: true, name: true, contactEmail: true } },
    },
    distinct: ["canonicalItemId", "providerId"],
  });

  const byProvider = new Map<
    string,
    {
      providerId: string;
      providerName: string;
      contactEmail: string | null;
      pairs: { oldCode: string; newCode: string }[];
    }
  >();

  for (const rate of rates) {
    const change = changeByCreatedItemId.get(rate.canonicalItemId);
    if (!change?.newCode) continue;

    let entry = byProvider.get(rate.provider.id);
    if (!entry) {
      entry = {
        providerId: rate.provider.id,
        providerName: rate.provider.name,
        contactEmail: rate.provider.contactEmail,
        pairs: [],
      };
      byProvider.set(rate.provider.id, entry);
    }
    if (!entry.pairs.some((p) => p.oldCode === change.oldCode)) {
      entry.pairs.push({ oldCode: change.oldCode, newCode: change.newCode });
    }
  }

  const resolutionLabel = update.resolutionNumber
    ? `la Resolución ${update.resolutionNumber}${update.resolutionDate ? ` del ${formatDate(update.resolutionDate)}` : ""}`
    : "una resolución reciente del Ministerio de Salud";

  return [...byProvider.values()].map((entry) => {
    const list = entry.pairs
      .map((p) => `  • CUPS ${p.oldCode} → CUPS ${p.newCode}`)
      .join("\n");
    return {
      providerId: entry.providerId,
      providerName: entry.providerName,
      contactEmail: entry.contactEmail,
      subject: "Actualización de códigos CUPS en tarifas vigentes con INOOS SAS",
      body: `Estimados ${entry.providerName},

Por ${resolutionLabel} del Ministerio de Salud, se actualizaron los siguientes códigos CUPS normativos. Las tarifas que actualmente tenemos registradas con ustedes para estos servicios quedan asociadas al nuevo código, sin cambios en el servicio prestado ni en el valor pactado:

${list}

Les agradecemos confirmar o remitirnos un tarifario actualizado que referencie los nuevos códigos CUPS.

Cordialmente,
INOOS SAS`,
    };
  });
}
