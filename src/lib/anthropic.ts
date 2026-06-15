import Anthropic from "@anthropic-ai/sdk";

// Default models for the platform's AI features.
export const MODELS = {
  // Fast/cheap structured tasks (column mapping, simple extraction).
  fast: "claude-haiku-4-5-20251001",
  // Reasoning tasks (homologation decisions).
  reasoning: "claude-sonnet-4-6",
} as const;

let client: Anthropic | null = null;

/** Returns a configured Anthropic client, or null when no API key is set. */
export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
