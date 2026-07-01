import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Lightweight progress endpoint for polling during a SISPRO verification run. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const orgId = session?.user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const verification = await prisma.sisproVerification.findFirst({
    where: { id, organizationId: orgId },
    select: {
      status: true,
      scannedCount: true,
      _count: { select: { results: true } },
    },
  });
  if (!verification) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const active = verification.status === "RUNNING";
  const signature = `${verification.status}:${verification.scannedCount}:${verification._count.results}`;

  return NextResponse.json(
    { active, signature },
    { headers: { "Cache-Control": "no-store" } },
  );
}
