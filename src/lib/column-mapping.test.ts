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
      code: null,
      ownCode: "CUPS PROPIO", // the institution's own code, not the provider's
      price: "VALOR", // not "TARIFARIO" (regression guard for the \btarifa\b fix)
      unit: null,
      type: null, // "TARIFARIO / CONTRATISTA" must not be claimed as tariff type
      inclusions: null,
      exclusions: "EXCLUSIONES",
    });
  });

  it("separates the provider code from the institution's own CUPS", () => {
    const m = heuristicMapping([
      "Descripción",
      "Código CUPS",
      "CUPS Propio",
      "Valor",
    ]);
    expect(m.ownCode).toBe("CUPS Propio");
    expect(m.code).toBe("Código CUPS");
  });

  it("maps a tariff-type column when present", () => {
    const m = heuristicMapping(["Descripción", "Valor", "Tipo de tarifa"]);
    expect(m.type).toBe("Tipo de tarifa");
    expect(m.price).toBe("Valor");
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
