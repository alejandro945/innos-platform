import { z } from "zod";
import { getAnthropic, MODELS } from "@/lib/anthropic";
import type { Candidate } from "@/lib/retrieval";

export type ProviderItemInput = {
  rawName: string;
  rawCode?: string | null;
  rawUnit?: string | null;
};

const decisionSchema = z.object({
  canonicalItemId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  suggestedNewItem: z
    .object({
      name: z.string(),
      kind: z.enum(["SERVICE", "MEDICATION", "DEVICE", "SUPPLY"]),
    })
    .nullable()
    .optional(),
});

export type HomologationDecision = z.infer<typeof decisionSchema>;

/**
 * Ask Claude to decide which canonical candidate (if any) matches the provider
 * item. Returns a structured decision with confidence and rationale.
 * When AI is unavailable, falls back to the top candidate's retrieval score.
 */
export async function decideHomologation(
  item: ProviderItemInput,
  candidates: Candidate[],
): Promise<HomologationDecision> {
  const anthropic = getAnthropic();

  if (!anthropic) {
    const top = candidates[0];
    if (top && top.score >= 0.6) {
      return {
        canonicalItemId: top.id,
        confidence: Math.min(top.score, 0.85),
        rationale: `Coincidencia léxica/vectorial automática (sin IA): "${top.name}".`,
      };
    }
    return {
      canonicalItemId: null,
      confidence: top?.score ?? 0,
      rationale: "Sin IA y sin candidato suficientemente similar.",
    };
  }

  const candidateList = candidates
    .map(
      (c, i) =>
        `${i + 1}. id=${c.id} | código=${c.canonicalCode} | ${c.name}${c.description ? ` — ${c.description}` : ""} | tipo=${c.kind} | similitud=${c.score.toFixed(2)}`,
    )
    .join("\n");

  const response = await anthropic.messages.create({
    model: MODELS.reasoning,
    max_tokens: 700,
    tools: [
      {
        name: "report_decision",
        description:
          "Reporta la homologación del ítem del proveedor al catálogo canónico.",
        input_schema: {
          type: "object",
          properties: {
            canonicalItemId: {
              type: ["string", "null"],
              description:
                "id del ítem canónico que corresponde, o null si ninguno.",
            },
            confidence: {
              type: "number",
              description: "Confianza de 0 a 1.",
            },
            rationale: {
              type: "string",
              description: "Justificación breve en español.",
            },
            suggestedNewItem: {
              type: ["object", "null"],
              description:
                "Si no hay match, sugiere crear un ítem canónico nuevo.",
              properties: {
                name: { type: "string" },
                kind: {
                  type: "string",
                  enum: ["SERVICE", "MEDICATION", "DEVICE", "SUPPLY"],
                },
              },
            },
          },
          required: ["canonicalItemId", "confidence", "rationale"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "report_decision" },
    messages: [
      {
        role: "user",
        content: `Eres un experto en homologación de servicios y productos de salud en Colombia (CUPS, CUM, ATC).
Determina a qué ítem canónico corresponde el ítem que envía el proveedor.

Reglas:
- Para medicamentos, compara principio activo, concentración y forma farmacéutica, no solo el nombre comercial.
- Si ningún candidato corresponde con seguridad razonable, devuelve canonicalItemId=null y, si aplica, sugiere crear uno nuevo.
- La confianza debe reflejar tu certeza real (0 a 1).

ÍTEM DEL PROVEEDOR:
- Nombre: ${item.rawName}
- Código: ${item.rawCode ?? "(ninguno)"}
- Unidad: ${item.rawUnit ?? "(ninguna)"}

CANDIDATOS DEL CATÁLOGO CANÓNICO:
${candidateList || "(no hay candidatos)"}

Reporta tu decisión con la herramienta.`,
      },
    ],
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (toolUse && toolUse.type === "tool_use") {
    const parsed = decisionSchema.safeParse(toolUse.input);
    if (parsed.success) {
      // Guard against hallucinated ids not in the candidate set.
      if (
        parsed.data.canonicalItemId &&
        !candidates.some((c) => c.id === parsed.data.canonicalItemId)
      ) {
        return {
          canonicalItemId: null,
          confidence: 0,
          rationale:
            "La IA devolvió un id fuera de los candidatos; se descarta.",
        };
      }
      return parsed.data;
    }
  }

  return {
    canonicalItemId: null,
    confidence: 0,
    rationale: "No se pudo obtener una decisión válida de la IA.",
  };
}
