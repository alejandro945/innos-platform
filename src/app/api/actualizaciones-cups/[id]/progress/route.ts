import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Lightweight progress endpoint for polling during resolution extraction. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const orgId = session?.user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const update = await prisma.regulatoryUpdate.findFirst({
    where: { id, organizationId: orgId },
    select: {
      status: true,
      chunksProcessed: true,
      chunksTotal: true,
      _count: { select: { changes: true } },
    },
  });
  if (!update) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const active = update.status === "EXTRACTING";
  const signature = `${update.status}:${update.chunksProcessed}:${update._count.changes}`;

  return NextResponse.json(
    { active, signature },
    { headers: { "Cache-Control": "no-store" } },
  );
}
