// Colombian locale formatting helpers (es-CO).

const currencyFmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatCurrency(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return currencyFmt.format(n);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return dateFmt.format(d);
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

/**
 * Flatten the unmapped source-file columns preserved on an item/rate
 * (`extra` JSON, {header: value}) into a single "Header: value | …" string,
 * so they can be shown/exported as one column.
 */
export function concatExtra(extra: unknown): string {
  if (!extra || typeof extra !== "object") return "";
  return Object.entries(extra as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join(" | ");
}
