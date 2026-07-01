import type { RegulatoryUpdateStatus, CupsChangeStatus } from "@prisma/client";

export const REGULATORY_STATUS_LABELS: Record<RegulatoryUpdateStatus, string> = {
  EXTRACTING: "Analizando",
  REVIEW: "Por revisar",
  APPLIED: "Aplicada",
  FAILED: "Error",
};

export const REGULATORY_STATUS_STYLES: Record<RegulatoryUpdateStatus, string> = {
  EXTRACTING: "bg-blue-100 text-blue-700",
  REVIEW: "bg-amber-100 text-amber-700",
  APPLIED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-rose-100 text-rose-700",
};

export const CUPS_CHANGE_STATUS_LABELS: Record<CupsChangeStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Descartado",
  APPLIED: "Aplicado",
};

export const CUPS_CHANGE_STATUS_STYLES: Record<CupsChangeStatus, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  APPLIED: "bg-blue-100 text-blue-700",
};
