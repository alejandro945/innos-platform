import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { hasAnyRole } from "@/lib/rbac";

// Resolutions are uploaded straight from the browser to Blob storage (this
// route only issues a short-lived client token) — a Server Action's request
// body is capped at 1MB by Next.js, far too small for a multi-MB PDF.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user || !hasAnyRole(session.user.roles, "ADMIN")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: true,
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
