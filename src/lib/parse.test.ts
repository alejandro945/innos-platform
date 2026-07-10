import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseSpreadsheet } from "./parse";

function workbookBuffer(
  sheets: { name: string; cells: unknown[][] }[],
): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(s.cells as never),
      s.name,
    );
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseSpreadsheet", () => {
  it("parses a single-sheet file without a sheet column", () => {
    const buf = workbookBuffer([
      {
        name: "Tarifas",
        cells: [
          ["Descripción", "Valor"],
          ["Hemograma", 10000],
        ],
      },
    ]);
    const parsed = parseSpreadsheet(buf, "a.xlsx");
    expect(parsed.headers).toEqual(["Descripción", "Valor"]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]["Hoja"]).toBeUndefined();
  });

  it("concatenates rows from multiple data sheets and tags the source sheet", () => {
    const buf = workbookBuffer([
      {
        name: "Laboratorio",
        cells: [
          ["Descripción", "Valor"],
          ["Hemograma", 10000],
          ["Glicemia", 8000],
        ],
      },
      {
        name: "Imágenes",
        cells: [
          ["Descripción", "Valor", "Observación"],
          ["Radiografía de tórax", 45000, "Incluye lectura"],
        ],
      },
    ]);
    const parsed = parseSpreadsheet(buf, "a.xlsx");
    // Union of headers plus the sheet marker.
    expect(parsed.headers).toEqual([
      "Descripción",
      "Valor",
      "Observación",
      "Hoja",
    ]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      Descripción: "Hemograma",
      Hoja: "Laboratorio",
    });
    expect(parsed.rows[2]).toMatchObject({
      Descripción: "Radiografía de tórax",
      Observación: "Incluye lectura",
      Hoja: "Imágenes",
    });
    // Header missing on the first sheet is null, not undefined.
    expect(parsed.rows[0]["Observación"]).toBeNull();
  });

  it("skips cover/notes sheets that are not tabular data", () => {
    const buf = workbookBuffer([
      {
        name: "Portada",
        cells: [["ANEXO DE TARIFAS 2026"], ["Laboratorio Oviedo"]],
      },
      {
        name: "Tarifas",
        cells: [
          ["Descripción", "Valor"],
          ["Hemograma", 10000],
        ],
      },
    ]);
    const parsed = parseSpreadsheet(buf, "a.xlsx");
    expect(parsed.headers).toEqual(["Descripción", "Valor"]);
    expect(parsed.rows).toHaveLength(1);
  });

  it("throws when no sheet has data", () => {
    const buf = workbookBuffer([{ name: "Vacía", cells: [[]] }]);
    expect(() => parseSpreadsheet(buf, "vacio.xlsx")).toThrow(
      /No se encontraron datos/,
    );
  });
});
