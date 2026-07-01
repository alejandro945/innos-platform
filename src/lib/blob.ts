import { put } from "@vercel/blob";

/**
 * Stores a raw file as evidence (audit trail) under `folder/subfolder/` and
 * returns its URL. Requires BLOB_READ_WRITE_TOKEN (Vercel Blob).
 */
export async function storeDocument(
  fileName: string,
  data: ArrayBuffer | Buffer,
  folder: string,
  subfolder: string,
): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "Almacenamiento de archivos no configurado (falta BLOB_READ_WRITE_TOKEN).",
    );
  }
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const key = `${folder}/${subfolder}/${safeName}`;
  const blob = await put(key, data, {
    access: "public",
    addRandomSuffix: true,
  });
  return blob.url;
}

/** Stores the raw provider file as evidence for a procurement process. */
export async function storeProviderFile(
  fileName: string,
  data: ArrayBuffer | Buffer,
  processId: string,
): Promise<string> {
  return storeDocument(fileName, data, "uploads", processId);
}
