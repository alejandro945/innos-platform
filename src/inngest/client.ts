import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "inoos-platform" });

/** Event names used across the app. */
export const EVENTS = {
  normalizeUpload: "upload/normalize.requested",
  // Internal: a run that hit its per-run batch limit re-triggers itself with
  // this event so a large file is processed across several runs (each one stays
  // under Inngest's 1000-step ceiling). Kept separate from `normalizeUpload` so
  // it does NOT trip the user-restart `cancelOn`.
  continueNormalizeUpload: "upload/normalize.continue",

  extractRegulatoryUpdate: "regulatory-update/extract.requested",
  // Same batching purpose as continueNormalizeUpload, for large PDFs.
  continueExtractRegulatoryUpdate: "regulatory-update/extract.continue",

  verifySisproVerification: "sispro-verification/run.requested",
  continueSisproVerification: "sispro-verification/run.continue",
} as const;
