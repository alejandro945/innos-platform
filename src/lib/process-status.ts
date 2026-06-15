import type { ProcessStatus, UploadStatus } from "@prisma/client";

export const PROCESS_STATUS_LABELS: Record<ProcessStatus, string> = {
  DRAFT: "Borrador",
  PROCESSING: "En proceso",
  IN_REVIEW: "En revisión",
  COMPLETED: "Completado",
  ARCHIVED: "Archivado",
};

export const PROCESS_STATUS_STYLES: Record<ProcessStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PROCESSING: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-slate-100 text-slate-400",
};

export const UPLOAD_STATUS_LABELS: Record<UploadStatus, string> = {
  UPLOADED: "Cargado",
  PARSING: "Procesando",
  MAPPING: "Mapeo pendiente",
  NORMALIZING: "Normalizando",
  READY: "Listo",
  FAILED: "Error",
};
