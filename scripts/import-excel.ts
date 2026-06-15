/**
 * One-off importer: seeds the data store from the legacy Excel workbook
 * (COMPARADOR_TARIFAS_INOOS.xlsx) — canonical items + providers + rates.
 *
 * Usage: pnpm import:excel [path/to/file.xlsx]
 */
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient, type ItemKind } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_FILE = path.resolve(
  process.cwd(),
  "..",
  "COMPARADOR_TARIFAS_INOOS.xlsx",
);

function yes(v: unknown): boolean {
  return String(v ?? "").trim().toUpperCase() === "SI";
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const parsed = new Date(String(v));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** Infer item kind from the description text (simple heuristic). */
function inferKind(text: string): ItemKind {
  const t = text.toLowerCase();
  if (/(medicamento|quimioterap|ampolla|tableta|vial|mg|ml)/.test(t))
    return "MEDICATION";
  if (/(dispositivo|cat[eé]ter|sonda|prótesis|stent)/.test(t)) return "DEVICE";
  if (/(insumo|gasa|jeringa|guante)/.test(t)) return "SUPPLY";
  return "SERVICE";
}

async function main() {
  const file = process.argv[2] ?? DEFAULT_FILE;
  console.log(`Importing from: ${file}`);
  const wb = XLSX.readFile(file, { cellDates: true });

  const org = await prisma.organization.upsert({
    where: { nit: "INOOS-DEFAULT" },
    update: {},
    create: { name: "INOOS SAS", nit: "INOOS-DEFAULT" },
  });

  // --- CUPS CANÓNICO -> CanonicalItem (+ CUPS code) -------------------------
  const canon = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["CUPS CANÓNICO"], {
    header: 1,
    range: 4, // data starts at row 5 (0-indexed 4)
    blankrows: false,
  });

  let itemCount = 0;
  for (const row of canon) {
    const normativeCode = String(row[0] ?? "").trim();
    const canonicalCode = String(row[2] ?? "").trim();
    const description = String(row[3] ?? "").trim();
    if (!canonicalCode) continue;

    await prisma.canonicalItem.upsert({
      where: {
        organizationId_canonicalCode: {
          organizationId: org.id,
          canonicalCode,
        },
      },
      update: {
        normativeCode: normativeCode || null,
        name: description || canonicalCode,
        description: description || null,
        includesFees: yes(row[4]),
        includesSupplies: yes(row[5]),
        kind: inferKind(description),
      },
      create: {
        organizationId: org.id,
        canonicalCode,
        normativeCode: normativeCode || null,
        name: description || canonicalCode,
        description: description || null,
        includesFees: yes(row[4]),
        includesSupplies: yes(row[5]),
        kind: inferKind(description),
        codes: normativeCode
          ? { create: [{ system: "CUPS", code: normativeCode }] }
          : undefined,
      },
    });
    itemCount++;
  }
  console.log(`Canonical items: ${itemCount}`);

  // --- TARIFAS -> Provider + RateCard ---------------------------------------
  const tarifas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["TARIFAS"], {
    header: 1,
    range: 4,
    blankrows: false,
  });

  let rateCount = 0;
  for (const row of tarifas) {
    const canonicalCode = String(row[0] ?? "").trim();
    const tariffSource = String(row[2] ?? "").trim();
    const value = Number(row[3]);
    if (!canonicalCode || !tariffSource || Number.isNaN(value)) continue;

    // Provider name = text after an em/hyphen dash, else the whole source.
    const providerName =
      tariffSource.split(/[—-]/).pop()?.trim() || tariffSource;

    const item = await prisma.canonicalItem.findUnique({
      where: {
        organizationId_canonicalCode: {
          organizationId: org.id,
          canonicalCode,
        },
      },
    });
    if (!item) {
      console.warn(`  ! no canonical item for ${canonicalCode}, skipping rate`);
      continue;
    }

    const provider = await prisma.provider.upsert({
      where: {
        organizationId_name: { organizationId: org.id, name: providerName },
      },
      update: {},
      create: { organizationId: org.id, name: providerName },
    });

    await prisma.rateCard.create({
      data: {
        organizationId: org.id,
        canonicalItemId: item.id,
        providerId: provider.id,
        tariffSource,
        value,
        exclusions: String(row[4] ?? "").trim() || null,
        validFrom: toDate(row[5]),
        validTo: row[6] ? toDate(row[6]) : null,
      },
    });
    rateCount++;
  }
  console.log(`Rate cards: ${rateCount}`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
