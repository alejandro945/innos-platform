import * as XLSX from "xlsx";

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
};

/**
 * Parse an uploaded Excel/CSV buffer into headers + row objects.
 * Picks the sheet with the most data rows (provider files vary a lot).
 */
export function parseSpreadsheet(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
): ParsedSheet {
  const data = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(new Uint8Array(buffer));
  const wb = XLSX.read(data, { type: "buffer", cellDates: true });

  // Choose the densest sheet.
  let best: { name: string; count: number } = { name: "", count: -1 };
  for (const name of wb.SheetNames) {
    const ref = wb.Sheets[name]?.["!ref"];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const count = range.e.r - range.s.r;
    if (count > best.count) best = { name, count };
  }
  if (!best.name) {
    throw new Error(`No se encontraron datos en el archivo ${fileName}.`);
  }

  const sheet = wb.Sheets[best.name];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
  });

  const headerRowIndex = findHeaderRow(matrix);
  const headerRow = (matrix[headerRowIndex] ?? []).map((h, i) =>
    String(h ?? "").trim() || `Columna ${i + 1}`,
  );

  const rows: Record<string, unknown>[] = [];
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    if (raw.every((c) => c === null || String(c).trim() === "")) continue;
    const obj: Record<string, unknown> = {};
    headerRow.forEach((h, i) => {
      obj[h] = raw[i] ?? null;
    });
    rows.push(obj);
  }

  return { headers: headerRow, rows };
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
