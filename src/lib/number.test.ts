import { describe, it, expect } from "vitest";
import { parseAmount, parsePrice, MAX_AMOUNT } from "./number";

describe("parseAmount", () => {
  it("parses plain numbers and integer strings", () => {
    expect(parseAmount(85000)).toBe(85000);
    expect(parseAmount("85000")).toBe(85000);
  });

  it("parses Colombian format (dot thousands, comma decimals)", () => {
    expect(parseAmount("85.000")).toBe(85000);
    expect(parseAmount("1.250.000")).toBe(1250000);
    expect(parseAmount("1.250.000,50")).toBe(1250000.5);
    expect(parseAmount("85,50")).toBe(85.5);
  });

  it("parses US format (comma thousands, dot decimals)", () => {
    expect(parseAmount("1,250,000.50")).toBe(1250000.5);
  });

  it("strips currency symbols and spaces", () => {
    expect(parseAmount("$ 450.000")).toBe(450000);
  });

  it("returns null for dates and non-numeric input", () => {
    expect(parseAmount("2025-01-01T05:00:16.000Z")).toBeNull();
    expect(parseAmount(new Date())).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe("parsePrice", () => {
  it("accepts values that fit Decimal(14,2)", () => {
    expect(parsePrice("999.999.999.999")).toBe(999999999999);
  });

  it("rejects values that would overflow the column (>= 10^12)", () => {
    expect(parsePrice("9001234567890123")).toBeNull();
    expect(parsePrice(MAX_AMOUNT)).toBeNull();
  });
});
