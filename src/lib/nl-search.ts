import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { structuredGenerate, isLlmEnabled } from "@/lib/llm";

const querySchema = z.object({
  term: z.string().nullable(),
  onlyCurrent: z.boolean(),
  order: z.enum(["cheapest", "expensive", "recent"]),
});

export type ParsedQuery = z.infer<typeof querySchema>;

export type SearchResult = {
  id: string;
  itemCode: string;
  itemName: string;
  providerName: string;
  value: number;
  exclusions: string | null;
  validFrom: Date;
  validTo: Date | null;
};

/** Parse a natural-language query into structured filters (LLM, with fallback). */
async function parseQuery(query: string): Promise<ParsedQuery> {
  if (isLlmEnabled()) {
    const raw = await structuredGenerate({
      tier: "fast",
      maxTokens: 256,
      toolName: "report_query",
      toolDescription:
        "Convierte la búsqueda en lenguaje natural en filtros estructurados.",
      jsonSchema: {
        type: "object",
        properties: {
          term: {
            type: ["string", "null"],
            description:
              "Término del servicio/producto a buscar (p.ej. 'quimioterapia'), o null.",
          },
          onlyCurrent: {
            type: "boolean",
            description: "true si pide tarifas vigentes/actuales.",
          },
          order: {
            type: "string",
            enum: ["cheapest", "expensive", "recent"],
            description: "Orden solicitado.",
          },
        },
        required: ["term", "onlyCurrent", "order"],
      },
      prompt: `Interpreta esta búsqueda de tarifas de salud y responde solo con el objeto:\n"${query}"`,
    });
    const parsed = querySchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  // Fallback: whole text as term, default to cheapest current.
  return { term: query.trim() || null, onlyCurrent: true, order: "cheapest" };
}

export async function naturalSearch(
  organizationId: string,
  query: string,
): Promise<{ parsed: ParsedQuery; results: SearchResult[] }> {
  const parsed = await parseQuery(query);
  const now = new Date();

  const where: Prisma.RateCardWhereInput = {
    organizationId,
    ...(parsed.onlyCurrent
      ? {
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
        }
      : {}),
    ...(parsed.term
      ? {
          canonicalItem: {
            OR: [
              { name: { contains: parsed.term, mode: "insensitive" } },
              { canonicalCode: { contains: parsed.term, mode: "insensitive" } },
              { description: { contains: parsed.term, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const orderBy: Prisma.RateCardOrderByWithRelationInput =
    parsed.order === "expensive"
      ? { value: "desc" }
      : parsed.order === "recent"
        ? { validFrom: "desc" }
        : { value: "asc" };

  const rates = await prisma.rateCard.findMany({
    where,
    orderBy,
    take: 50,
    include: { canonicalItem: true, provider: true },
  });

  return {
    parsed,
    results: rates.map((r) => ({
      id: r.id,
      itemCode: r.canonicalItem.canonicalCode,
      itemName: r.canonicalItem.name,
      providerName: r.provider.name,
      value: Number(r.value),
      exclusions: r.exclusions,
      validFrom: r.validFrom,
      validTo: r.validTo,
    })),
  };
}
