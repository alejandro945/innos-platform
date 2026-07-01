import * as cheerio from "cheerio";
import { prisma } from "@/lib/prisma";
import { lexicalScore } from "@/lib/text-similarity";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const SISPRO_URL =
  "https://web.sispro.gov.co/WebPublico/Consultas/ConsultarDetalleReferenciaBasica.aspx?Code=CUPS";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const SISPRO_TIMEOUT_MS = Number(process.env.SISPRO_TIMEOUT_MS) || 15_000;
// Lenient on purpose — accents/abbreviations/capitalization differ often
// between our catalog and SISPRO's wording for the same real service.
const SISPRO_MIN_NAME_SIMILARITY = 0.5;

type SisproLookup =
  | { found: true; code: string; name: string; enabled: boolean }
  | { found: false };

/**
 * Best-effort scrape of the public SISPRO CUPS lookup — NOT an official API.
 * `ConsultarDetalleReferenciaBasica.aspx` is a classic ASP.NET WebForms page
 * (postback-based). Confirmed by manually inspecting the live page: the
 * "search by code" form has no anti-forgery `__EVENTVALIDATION` field, so a
 * fresh GET (for a session cookie + `__VIEWSTATE`) followed by a POST
 * replaying that viewstate + the code field + the search button works and
 * returns a filtered results table (verified against known codes, e.g.
 * "010101" → "PUNCIÓN CISTERNAL- VÍA LATERAL"; an unknown code returns no
 * results table at all).
 *
 * If SISPRO changes their markup this breaks. Every call is wrapped in
 * try/catch by `verifyOneItem` so one failure never aborts a batch — but if
 * lookups start failing consistently, this file is where to look first.
 */
async function lookupCups(code: string): Promise<SisproLookup> {
  const getRes = await fetchWithTimeout(
    SISPRO_URL,
    { headers: { "User-Agent": USER_AGENT } },
    SISPRO_TIMEOUT_MS,
  );
  if (!getRes.ok) throw new Error(`SISPRO GET falló: ${getRes.status}`);
  const cookie = getRes.headers.get("set-cookie")?.split(";")[0];
  const $get = cheerio.load(await getRes.text());
  const viewState = $get("#__VIEWSTATE").attr("value") ?? "";
  const viewStateGenerator = $get("#__VIEWSTATEGENERATOR").attr("value") ?? "";
  if (!viewState) {
    throw new Error("SISPRO: no se encontró __VIEWSTATE (la página pudo haber cambiado).");
  }

  const form = new FormData();
  form.set("__VIEWSTATE", viewState);
  form.set("__VIEWSTATEGENERATOR", viewStateGenerator);
  form.set("__EVENTTARGET", "");
  form.set("__EVENTARGUMENT", "");
  form.set("__LASTFOCUS", "");
  form.set("ctl00$cntContenido$txtBuscarCodigo", code);
  form.set("ctl00$cntContenido$txtBuscarNombre", "");
  form.set("ctl00$cntContenido$btnBuscar", "Buscar");

  const postRes = await fetchWithTimeout(
    SISPRO_URL,
    {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: form,
    },
    SISPRO_TIMEOUT_MS,
  );
  if (!postRes.ok) throw new Error(`SISPRO POST falló: ${postRes.status}`);

  const $ = cheerio.load(await postRes.text());
  const rows = $("table[id$='grvTablaReferencia'] tr").toArray();
  // Row 0 is the header (Tabla, Codigo, Nombre, Descripcion, Habilitado, Aplicacion).
  for (const row of rows.slice(1)) {
    const cells = $(row)
      .find("td")
      .toArray()
      .map((c) => $(c).text().trim());
    if (cells.length >= 5 && cells[1] === code) {
      return { found: true, code: cells[1], name: cells[2], enabled: cells[4] === "SI" };
    }
  }
  return { found: false };
}

/**
 * Verify one canonical item's normativeCode against SISPRO and persist a
 * result row — but only for exceptions (MISMATCH/NOT_FOUND/ERROR); a clean
 * match isn't stored, keeping the results table to just what needs review.
 */
export async function verifyOneItem(
  verificationId: string,
  item: { id: string; name: string; normativeCode: string | null },
): Promise<void> {
  if (!item.normativeCode) return;

  try {
    const result = await lookupCups(item.normativeCode);
    if (!result.found) {
      await prisma.sisproVerificationResult.create({
        data: {
          verificationId,
          canonicalItemId: item.id,
          normativeCode: item.normativeCode,
          status: "NOT_FOUND",
        },
      });
      return;
    }

    const similarity = lexicalScore(item.name, result.name);
    if (similarity < SISPRO_MIN_NAME_SIMILARITY) {
      await prisma.sisproVerificationResult.create({
        data: {
          verificationId,
          canonicalItemId: item.id,
          normativeCode: item.normativeCode,
          status: "MISMATCH",
          sisproName: result.name,
          note: `Similitud de nombre: ${Math.round(similarity * 100)}%.`,
        },
      });
    }
  } catch (err) {
    await prisma.sisproVerificationResult.create({
      data: {
        verificationId,
        canonicalItemId: item.id,
        normativeCode: item.normativeCode,
        status: "ERROR",
        note: (err as Error).message.slice(0, 200),
      },
    });
  }
}

/** Mark a verification run complete. */
export async function finalizeSisproVerification(
  verificationId: string,
  scannedCount: number,
): Promise<void> {
  await prisma.sisproVerification.update({
    where: { id: verificationId },
    data: { status: "DONE", scannedCount },
  });
}

/**
 * Non-durable fallback for local dev without Inngest configured: run the
 * whole verification inline, start to finish (mirrors normalizeUpload()'s
 * fallback pattern). No throttling between requests here — fine for the
 * small catalogs typical in dev; production always goes through the batched
 * Inngest job with a pause between lookups.
 */
export async function runSisproVerificationInline(
  verificationId: string,
): Promise<void> {
  const verification = await prisma.sisproVerification.findUnique({
    where: { id: verificationId },
    select: { organizationId: true },
  });
  if (!verification) return;

  const items = await prisma.canonicalItem.findMany({
    where: {
      organizationId: verification.organizationId,
      isActive: true,
      normativeCode: { not: null },
    },
    select: { id: true, name: true, normativeCode: true },
    orderBy: { canonicalCode: "asc" },
  });

  for (const item of items) {
    await verifyOneItem(verificationId, item);
  }

  await finalizeSisproVerification(verificationId, items.length);
}
