import { put } from "@vercel/blob";

/**
 * Stores the raw provider file as evidence (audit trail) and returns its URL.
 * Requires BLOB_READ_WRITE_TOKEN (Vercel Blob).
 */
export async function storeProviderFile(
  fileName: string,
  data: ArrayBuffer | Buffer,
  processId: string,
): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "Almacenamiento de archivos no configurado (falta BLOB_READ_WRITE_TOKEN).",
    );
  }
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const key = `uploads/${processId}/${safeName}`;
  const blob = await put(key, data, {
    access: "public",
    addRandomSuffix: true,
  });
  return blob.url;
}
