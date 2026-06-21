import { describe, it, expect } from "vitest";
import { heuristicMapping } from "./column-mapping";

describe("heuristicMapping", () => {
  it("maps the legacy INOOS headers correctly", () => {
    const headers = [
      "CUPS PROPIO",
      "DESCRIPCIÓN ESPECÍFICA",
      "TARIFARIO / CONTRATISTA",
      "VALOR",
      "EXCLUSIONES",
      "VIGENCIA DESDE",
      "VIGENCIA HASTA",
    ];
    expect(heuristicMapping(headers)).toEqual({
      name: "DESCRIPCIÓN ESPECÍFICA",
      code: "CUPS PROPIO",
      price: "VALOR", // not "TARIFARIO" (regression guard for the \btarifa\b fix)
      unit: null,
      inclusions: null,
      exclusions: "EXCLUSIONES",
    });
  });

  it("detects common provider variants", () => {
    const m = heuristicMapping([
      "Nombre del servicio",
      "Código CUM",
      "Precio",
      "Unidad",
    ]);
    expect(m.name).toBe("Nombre del servicio");
    expect(m.code).toBe("Código CUM");
    expect(m.price).toBe("Precio");
    expect(m.unit).toBe("Unidad");
  });
});
