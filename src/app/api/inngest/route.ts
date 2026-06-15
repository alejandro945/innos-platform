import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { normalizeUploadFn } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [normalizeUploadFn],
});
