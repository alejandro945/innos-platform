import { z } from "zod";
import { getAnthropic, MODELS } from "@/lib/anthropic";

/** Logical fields the platform needs from a provider file. */
export const MAPPING_FIELDS = [
  "name",
  "code",
  "price",
  "unit",
  "exclusions",
] as const;
export type MappingField = (typeof MAPPING_FIELDS)[number];

/** Maps each logical field to a source header name (or null if absent). */
export type ColumnMapping = Record<MappingField, string | null>;

export const FIELD_LABELS: Record<MappingField, string> = {
  name: "Nombre del servicio/producto",
  code: "Código (CUPS/CUM)",
  price: "Valor / precio",
  unit: "Unidad",
  exclusions: "Exclusiones",
};

const mappingSchema = z.object({
  name: z.string().nullable(),
  code: z.string().nullable(),
  price: z.string().nullable(),
  unit: z.string().nullable(),
  exclusions: z.string().nullable(),
});

const KEYWORDS: Record<MappingField, RegExp> = {
  name: /(nombre|descrip|servicio|producto|concepto|item|ítem|detalle)/i,
  code: /(cups|cum|c[oó]digo|code|atc)/i,
  // \btarifa\b avoids matching "tarifario" (the contractor column).
  price: /(valor|precio|\btarifa\b|costo|vr\.?|importe|total)/i,
  unit: /(unidad|medida|presenta|um\b)/i,
  exclusions: /(exclus|no incluye|observa|nota)/i,
};

/** Keyword-based mapping used as fallback (and when AI is disabled). */
export function heuristicMapping(headers: string[]): ColumnMapping {
  const result: ColumnMapping = {
    name: null,
    code: null,
    price: null,
    unit: null,
    exclusions: null,
  };
  for (const field of MAPPING_FIELDS) {
    const match = headers.find((h) => KEYWORDS[field].test(h));
    if (match) result[field] = match;
  }
  return result;
}

/**
 * Suggest a column mapping for a provider file. Uses Claude when available,
 * otherwise falls back to keyword heuristics. Returns the mapping plus the
 * method used so the UI can show how it was produced.
 */
export async function suggestColumnMapping(
  headers: string[],
  sampleRows: Record<string, unknown>[],
): Promise<{ mapping: ColumnMapping; method: "ai" | "heuristic" }> {
  const anthropic = getAnthropic();
  if (!anthropic) {
    return { mapping: heuristicMapping(headers), method: "heuristic" };
  }

  try {
    const sample = sampleRows.slice(0, 5);
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 512,
      tools: [
        {
          name: "report_mapping",
          description:
            "Reporta a qué encabezado del archivo corresponde cada campo lógico.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: ["string", "null"] },
              code: { type: ["string", "null"] },
              price: { type: ["string", "null"] },
              unit: { type: ["string", "null"] },
              exclusions: { type: ["string", "null"] },
            },
            required: [...MAPPING_FIELDS],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_mapping" },
      messages: [
        {
          role: "user",
          content: `Eres un asistente que mapea columnas de archivos de tarifas de proveedores de salud (Colombia).
Dado los encabezados y filas de ejemplo, identifica qué encabezado corresponde a cada campo lógico.
Usa EXACTAMENTE el texto del encabezado, o null si no existe.

Encabezados: ${JSON.stringify(headers)}

Filas de ejemplo: ${JSON.stringify(sample)}`,
        },
      ],
    });

    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") {
      const parsed = mappingSchema.safeParse(toolUse.input);
      if (parsed.success) {
        // Keep only headers that actually exist.
        const mapping = { ...parsed.data };
        for (const field of MAPPING_FIELDS) {
          if (mapping[field] && !headers.includes(mapping[field]!)) {
            mapping[field] = null;
          }
        }
        return { mapping, method: "ai" };
      }
    }
  } catch (e) {
    console.error("AI column mapping failed, using heuristic:", e);
  }

  return { mapping: heuristicMapping(headers), method: "heuristic" };
}
