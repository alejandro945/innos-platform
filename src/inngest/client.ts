import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "inoos-platform" });

/** Event names used across the app. */
export const EVENTS = {
  normalizeUpload: "upload/normalize.requested",
} as const;
