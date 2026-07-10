import * as XLSX from "xlsx";

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
};

/**
 * Parse an uploaded Excel/CSV buffer into headers + row objects.
 *
 * Every sheet that looks like data (a header row with at least two named
 * columns and at least one data row) is included — provider files often split
 * the tariff across sheets by service category. When more than one sheet
 * qualifies, rows are concatenated under the union of all headers and the
 * source sheet is recorded in an extra "Hoja" column (which flows to the
 * unmapped-columns bucket unless explicitly mapped).
 */
export function parseSpreadsheet(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
): ParsedSheet {
  const data = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(new Uint8Array(buffer));
  const wb = XLSX.read(data, { type: "buffer", cellDates: true });

  const sheets: { name: string; headers: string[]; rows: Record<string, unknown>[] }[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet?.["!ref"]) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
    });
    const parsed = parseMatrix(matrix, { requireNamedHeaders: true });
    if (parsed) sheets.push({ name, ...parsed });
  }

  // Nothing passed the strict filter: fall back to the densest sheet without
  // the named-headers requirement (e.g. files whose headers aren't strings).
  if (sheets.length === 0) {
    const fallback = parseDensestSheet(wb);
    if (!fallback) {
      throw new Error(`No se encontraron datos en el archivo ${fileName}.`);
    }
    return fallback;
  }

  if (sheets.length === 1) {
    return { headers: sheets[0].headers, rows: sheets[0].rows };
  }

  // Union of headers, in first-seen order.
  const headers: string[] = [];
  for (const s of sheets) {
    for (const h of s.headers) if (!headers.includes(h)) headers.push(h);
  }
  const sheetCol = headers.includes("Hoja") ? "Hoja de origen" : "Hoja";
  headers.push(sheetCol);

  const rows: Record<string, unknown>[] = [];
  for (const s of sheets) {
    for (const row of s.rows) {
      const obj: Record<string, unknown> = {};
      for (const h of headers) obj[h] = row[h] ?? null;
      obj[sheetCol] = s.name;
      rows.push(obj);
    }
  }

  return { headers, rows };
}

/** Previous behavior, kept as fallback: pick the sheet with most data rows. */
function parseDensestSheet(wb: XLSX.WorkBook): ParsedSheet | null {
  let best: { name: string; count: number } = { name: "", count: -1 };
  for (const name of wb.SheetNames) {
    const ref = wb.Sheets[name]?.["!ref"];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const count = range.e.r - range.s.r;
    if (count > best.count) best = { name, count };
  }
  if (!best.name) return null;

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[best.name], {
    header: 1,
    blankrows: false,
    defval: null,
  });
  return parseMatrix(matrix, { requireNamedHeaders: false });
}

/** Extract headers + row objects from a sheet matrix, or null if it has no data. */
function parseMatrix(
  matrix: unknown[][],
  { requireNamedHeaders }: { requireNamedHeaders: boolean },
): ParsedSheet | null {
  if (matrix.length === 0) return null;

  const headerRowIndex = findHeaderRow(matrix);
  const rawHeader = matrix[headerRowIndex] ?? [];
  if (requireNamedHeaders) {
    const named = rawHeader.filter(
      (c) => typeof c === "string" && c.trim().length > 0,
    ).length;
    // A tariff sheet needs at least a name and a value column; anything with
    // fewer named headers is a cover/notes sheet.
    if (named < 2) return null;
  }
  const headers = rawHeader.map(
    (h, i) => String(h ?? "").trim() || `Columna ${i + 1}`,
  );

  const rows: Record<string, unknown>[] = [];
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    if (raw.every((c) => c === null || String(c).trim() === "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = raw[i] ?? null;
    });
    rows.push(obj);
  }
  if (rows.length === 0) return null;

  return { headers, rows };
}

/** Heuristic: the header row is the first row where most cells are non-empty strings. */
function findHeaderRow(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 15);
  let bestIdx = 0;
  let bestScore = -1;
  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? [];
    const score = row.filter(
      (c) => typeof c === "string" && c.trim().length > 0,
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = r;
    }
  }
  return bestIdx;
}
