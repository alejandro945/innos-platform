import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { hasAnyRole } from "@/lib/rbac";

// Provider tariff files are uploaded straight from the browser to Blob
// storage (this route only issues a short-lived client token) — a Server
// Action's request body is capped by Next.js and by the hosting platform
// (~4.5MB on Vercel), too small for real tariff files.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (
    !session?.user ||
    !hasAnyRole(session.user.roles, "ADMIN", "PROCUREMENT_ANALYST")
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
          "application/vnd.ms-excel", // .xls
          "text/csv",
          // Some browsers report Excel/CSV files as a generic binary type.
          "application/octet-stream",
        ],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: true,
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
