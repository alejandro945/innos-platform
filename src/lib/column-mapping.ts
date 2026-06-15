import { z } from "zod";
import { structuredGenerate, isLlmEnabled } from "@/lib/llm";

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
  if (!isLlmEnabled()) {
    return { mapping: heuristicMapping(headers), method: "heuristic" };
  }

  const sample = sampleRows.slice(0, 5);
  const raw = await structuredGenerate({
    tier: "fast",
    maxTokens: 512,
    toolName: "report_mapping",
    toolDescription:
      "Reporta a qué encabezado del archivo corresponde cada campo lógico.",
    jsonSchema: {
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
    prompt: `Eres un asistente que mapea columnas de archivos de tarifas de proveedores de salud (Colombia).
Dado los encabezados y filas de ejemplo, identifica qué encabezado corresponde a cada campo lógico.
Usa EXACTAMENTE el texto del encabezado, o null si no existe.

Encabezados: ${JSON.stringify(headers)}

Filas de ejemplo: ${JSON.stringify(sample)}

Responde únicamente con el objeto solicitado.`,
  });

  if (raw) {
    const parsed = mappingSchema.safeParse(raw);
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

  return { mapping: heuristicMapping(headers), method: "heuristic" };
}
