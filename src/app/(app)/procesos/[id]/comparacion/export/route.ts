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

  // One row per provider option, flattened for analysis in Excel.
  const rows: Record<string, string | number>[] = [];
  for (const line of comparison.lines) {
    for (const opt of line.data.options) {
      rows.push({
        "CUPS propio": line.data.canonicalCode,
        Ítem: line.data.canonicalName,
        Proveedor: opt.providerName,
        Valor: opt.value ?? "",
        "Mejor precio": opt.providerId === line.bestProviderId ? "SÍ" : "",
        Inclusiones: opt.inclusions ?? "",
        Exclusiones: opt.exclusions ?? "",
        "Mínimo del ítem": line.minValue ?? "",
        "Máximo del ítem": line.maxValue ?? "",
        "Promedio del ítem": line.avgValue ?? "",
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
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
