"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";

/** Delete a generated comparison/report (lines cascade). */
export async function deleteComparison(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const id = String(formData.get("id"));
  const comparison = await prisma.comparison.findFirst({
    where: { id, process: { organizationId: session.organizationId } },
    select: { id: true },
  });
  if (!comparison) return { ok: false, message: "Reporte no encontrado." };
  await prisma.comparison.delete({ where: { id } });
  revalidatePath("/reportes");
  return { ok: true, message: "Reporte eliminado." };
}
