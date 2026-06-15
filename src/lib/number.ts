/** Largest value that fits a Postgres Decimal(14,2) integer part (< 10^12). */
export const MAX_AMOUNT = 1e12;

/**
 * Parse a money value from heterogeneous provider files.
 * Handles Colombian (1.234.567,89) and US (1,234,567.89) formats, plain
 * numbers, and currency symbols. Returns null for non-numeric input.
 */
export function parseAmount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return null;

  // Keep only digits, separators and sign.
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  // A stray dash anywhere but the front means it's not a number (e.g. a date).
  if (s.indexOf("-") > 0) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // The separator that appears last is the decimal one.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Decimal if 1–2 trailing digits, otherwise a thousands separator.
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    const parts = s.split(".");
    const grouping =
      parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
    if (grouping) s = s.replace(/\./g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse an amount and reject values that won't fit the rate columns.
 * Returns null for garbage / implausible values instead of crashing the insert.
 */
export function parsePrice(v: unknown): number | null {
  const n = parseAmount(v);
  if (n === null) return null;
  if (Math.abs(n) >= MAX_AMOUNT) return null;
  return n;
}
