import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { getLatestComparison } from "@/lib/comparison";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const comparison = await getLatestComparison(id, session.user.organizationId);
  if (!comparison) {
    return NextResponse.json(
      { error: "Sin comparación" },
      { status: 404 },
    );
  }

  // One row per provider option, flattened for analysis in Excel. Comparison
  // lines are grouped by normative CUPS, so "Ítem" reflects the specific
  // internal catalog entry that particular price was homologated to (it can
  // differ row to row within the same normative-code group). Any column from
  // the provider's source file that wasn't recognized as one of the known
  // fields (name/code/price/unit/inclusions/exclusions) was preserved as JSON
  // per row (`opt.extra`) — put back here as its own column, the inverse of
  // that import-time step.
  const FIXED_COLUMNS = [
    "CUPS normativo",
    "Ítem",
    "Código del proveedor",
    "Proveedor",
    "Valor",
    "Mejor precio",
    "Inclusiones",
    "Exclusiones",
    "Mínimo del ítem",
    "Máximo del ítem",
    "Promedio del ítem",
  ] as const;

  const rows: Record<string, string | number>[] = [];
  const extraColumns = new Set<string>();
  for (const line of comparison.lines) {
    for (const opt of line.data.options) {
      for (const key of Object.keys(opt.extra ?? {})) extraColumns.add(key);
      rows.push({
        "CUPS normativo": line.data.normativeCode ?? "",
        Ítem: opt.internalName,
        "Código del proveedor": opt.providerCode ?? "",
        Proveedor: opt.providerName,
        Valor: opt.value ?? "",
        "Mejor precio": opt.providerId === line.bestProviderId ? "SÍ" : "",
        Inclusiones: opt.inclusions ?? "",
        Exclusiones: opt.exclusions ?? "",
        "Mínimo del ítem": line.minValue ?? "",
        "Máximo del ítem": line.maxValue ?? "",
        "Promedio del ítem": line.avgValue ?? "",
        ...Object.fromEntries(
          Object.entries(opt.extra ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)]),
        ),
      });
    }
  }

  const header = [...FIXED_COLUMNS, ...extraColumns];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comparación");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const fileName = `comparacion_${comparison.processName.replace(/[^\w]+/g, "_")}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
