import { getAnthropic, MODELS } from "@/lib/anthropic";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 90_000;

export type AiTier = "fast" | "reasoning";
export type LlmProvider = "anthropic" | "ollama" | "none";

/** Resolve which LLM backend to use (explicit override or by configured keys). */
export function getLlmProvider(): LlmProvider {
  const p = process.env.LLM_PROVIDER?.toLowerCase();
  if (p === "anthropic" || p === "ollama") return p;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OLLAMA_BASE_URL) return "ollama";
  return "none";
}

export function isLlmEnabled(): boolean {
  return getLlmProvider() !== "none";
}

function ollamaModel(): string {
  return process.env.OLLAMA_CHAT_MODEL || "qwen2.5";
}

function ollamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL || "http://localhost:11434";
}

/** Headers for Ollama, with optional bearer token (for a protected proxy). */
export function ollamaHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.OLLAMA_API_KEY)
    h.Authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
  return h;
}

export type StructuredRequest = {
  prompt: string;
  /** JSON Schema describing the expected object. */
  jsonSchema: Record<string, unknown>;
  toolName: string;
  toolDescription: string;
  tier?: AiTier;
  maxTokens?: number;
};

/**
 * Provider-agnostic structured generation. Returns the parsed object (still
 * untyped — callers validate with Zod) or null when no provider is configured
 * or the response can't be parsed.
 */
export async function structuredGenerate(
  req: StructuredRequest,
): Promise<Record<string, unknown> | null> {
  const provider = getLlmProvider();
  if (provider === "none") return null;

  try {
    if (provider === "ollama") return await runOllama(req);
    return await runAnthropic(req);
  } catch (e) {
    console.error(`LLM (${provider}) request failed:`, e);
    return null;
  }
}

async function runAnthropic(
  req: StructuredRequest,
): Promise<Record<string, unknown> | null> {
  const anthropic = getAnthropic();
  if (!anthropic) return null;
  const model = req.tier === "reasoning" ? MODELS.reasoning : MODELS.fast;

  const response = await anthropic.messages.create({
    model,
    max_tokens: req.maxTokens ?? 700,
    tools: [
      {
        name: req.toolName,
        description: req.toolDescription,
        input_schema: req.jsonSchema as never,
      },
    ],
    tool_choice: { type: "tool", name: req.toolName },
    messages: [{ role: "user", content: req.prompt }],
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (toolUse && toolUse.type === "tool_use") {
    return toolUse.input as Record<string, unknown>;
  }
  return null;
}

async function runOllama(
  req: StructuredRequest,
): Promise<Record<string, unknown> | null> {
  const res = await fetchWithTimeout(
    `${ollamaBaseUrl()}/api/chat`,
    {
      method: "POST",
      headers: ollamaHeaders(),
      body: JSON.stringify({
        model: ollamaModel(),
        stream: false,
        // Ollama supports a JSON Schema as `format` for structured output.
        format: req.jsonSchema,
        options: { temperature: 0 },
        messages: [{ role: "user", content: req.prompt }],
      }),
    },
    OLLAMA_TIMEOUT_MS,
  );
  if (!res.ok) {
    console.error("Ollama chat failed:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    console.error("Ollama returned non-JSON content:", content.slice(0, 200));
    return null;
  }
}
