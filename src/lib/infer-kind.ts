import type { ItemKind } from "@prisma/client";

/** Infer an item kind from free text (simple heuristic; editable later). */
export function inferKind(text: string): ItemKind {
  const t = text.toLowerCase();
  if (/(medicamento|quimioterap|ampolla|tableta|vial|jarabe|\bmg\b|\bml\b)/.test(t))
    return "MEDICATION";
  if (/(dispositivo|cat[eé]ter|sonda|pr[oó]tesis|stent|equipo)/.test(t))
    return "DEVICE";
  if (/(insumo|gasa|jeringa|guante|sutura)/.test(t)) return "SUPPLY";
  return "SERVICE";
}
