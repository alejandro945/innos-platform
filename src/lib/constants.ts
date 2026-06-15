import type { ItemKind, CodeSystem } from "@prisma/client";

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  SERVICE: "Servicio",
  MEDICATION: "Medicamento",
  DEVICE: "Dispositivo",
  SUPPLY: "Insumo",
};

export const CODE_SYSTEM_LABELS: Record<CodeSystem, string> = {
  CUPS: "CUPS",
  CUM: "CUM",
  ATC: "ATC",
  IUM: "IUM",
  OTHER: "Otro",
};

export const ITEM_KINDS = Object.keys(ITEM_KIND_LABELS) as ItemKind[];
