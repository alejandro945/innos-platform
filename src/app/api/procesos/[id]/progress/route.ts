import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Lightweight progress endpoint for polling during homologation.
 * Returns minimal data so the client doesn't re-render the whole page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const orgId = session?.user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const uploads = await prisma.processUpload.findMany({
    where: { processId: id, process: { organizationId: orgId } },
    select: {
      id: true,
      status: true,
      _count: { select: { providerItems: true } },
    },
  });

  const result = await Promise.all(
    uploads.map(async (u) => ({
      id: u.id,
      status: u.status,
      total: u._count.providerItems,
      mapped: await prisma.itemMapping.count({
        where: { providerItem: { uploadId: u.id } },
      }),
    })),
  );

  const active = result.some((u) => u.status === "NORMALIZING");
  // Signature changes only when something meaningful moved.
  const signature = result
    .map((u) => `${u.id}:${u.status}:${u.mapped}`)
    .join("|");

  return NextResponse.json(
    { active, signature, uploads: result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
