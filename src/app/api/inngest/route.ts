import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  normalizeUploadFn,
  extractRegulatoryUpdateFn,
  verifySisproFn,
} from "@/inngest/functions";

// Each Inngest step homologates one item (~10-30s on CPU Ollama). Allow enough
// time per invocation. >60s requires a Vercel plan that permits it (Pro/Ent).
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [normalizeUploadFn, extractRegulatoryUpdateFn, verifySisproFn],
});
