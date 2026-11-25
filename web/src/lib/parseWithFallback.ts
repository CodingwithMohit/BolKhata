import { parseResponseSchema, type ParsedEntry } from "./schema";

export type ParseMethod = "rules" | "ai";

export interface ParseResult {
  entries: ParsedEntry[];
  source: ParseMethod;
  message?: string;
}

interface ParseFallbackOptions {
  enabled: boolean;
  apiBaseUrl: string;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

export async function parseWithFallback(
  text: string,
  rulesEntries: ParsedEntry[],
  options: ParseFallbackOptions,
): Promise<ParseResult> {
  const rulesResult: ParseResult = { entries: rulesEntries, source: "rules" };
  if (
    rulesEntries.length === 0 ||
    rulesEntries.every((entry) => entry.confidence >= 0.8)
  ) {
    return rulesResult;
  }
  if (!options.enabled) {
    return {
      ...rulesResult,
      message: "Showing the rules result. AI parsing is turned off.",
    };
  }
  if (!options.apiBaseUrl) {
    return { ...rulesResult, message: "AI unavailable, showing rules result." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 20_000,
  );
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(`${options.apiBaseUrl}/api/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`AI request failed with status ${response.status}`);
    }
    const responseValue: unknown = await response.json();
    const result = parseResponseSchema.safeParse(responseValue);
    if (!result.success || result.data.source === "none" || result.data.entries.length === 0) {
      throw new Error("AI returned no usable entries");
    }
    return { entries: result.data.entries, source: "ai" };
  } catch {
    return {
      ...rulesResult,
      message: "AI unavailable, showing rules result.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
