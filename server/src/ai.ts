import { createHash } from "node:crypto";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type { ParseResponse } from "./api-schema.js";
import { parsedEntriesSchema } from "./schema.js";

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_CAPACITY = 500;
const TOTAL_BUDGET_MS = 20_000;
const ATTEMPT_TIMEOUT_MS = 8_000;

const entryResponseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      amount: { type: Type.INTEGER },
      type: {
        type: Type.STRING,
        enum: ["gave_credit", "received_payment"],
        nullable: true,
      },
      note: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
    },
    required: ["name", "amount", "type", "confidence"],
  },
};

interface CachedResult {
  expiresAt: number;
  result: ParseResponse;
}

interface QueueItem {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type GenerateContent = (
  model: string,
  prompt: string,
  signal: AbortSignal,
) => Promise<string>;

export interface AiParserOptions {
  apiKey: string;
  model?: string;
  fallbackModel?: string;
  generate?: GenerateContent;
  now?: () => number;
  random?: () => number;
}

class ConcurrencyGate {
  private active = 0;
  private readonly queue: QueueItem[] = [];

  acquire(deadline: number, now: () => number): Promise<void> {
    if (this.active < 2) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        resolve: () => {
          clearTimeout(item.timer);
          resolve();
        },
        reject,
        timer: setTimeout(() => {
          const index = this.queue.indexOf(item);
          if (index >= 0) this.queue.splice(index, 1);
          reject(new Error("AI request budget exceeded"));
        }, Math.max(0, deadline - now())),
      };
      this.queue.push(item);
    });
  }

  release() {
    const next = this.queue.shift();
    if (next) {
      next.resolve();
    } else {
      this.active -= 1;
    }
  }
}

const concurrencyGate = new ConcurrencyGate();
const resultCache = new Map<string, CachedResult>();

function noResult(): ParseResponse {
  return { source: "none", entries: [] };
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return undefined;
  }
  const status = error.status;
  return typeof status === "number" ? status : undefined;
}

function canRetry(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === undefined || [429, 500, 503].includes(status);
}

function cleanInput(text: string): string {
  return text.replace(/[\p{Nd}]{8,}/gu, "[redacted number]");
}

function createPrompt(text: string): string {
  return [
    "Parse the following Hindi, Hinglish, or English shop-ledger utterance.",
    "Return only entries explicitly present. Amounts are positive whole rupees.",
    "gave_credit means the customer took goods on credit; received_payment means the customer paid.",
    "Set type to null and confidence below 0.5 when direction is ambiguous.",
    "Keep item words in note and do not invent customer names or amounts.",
    `Utterance: ${cleanInput(text)}`,
  ].join("\n");
}

async function generateWithGemini(
  model: string,
  prompt: string,
  signal: AbortSignal,
  apiKey: string,
): Promise<string> {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: entryResponseSchema,
      abortSignal: signal,
    },
  });
  return response.text ?? "";
}

function cacheGet(key: string, now: number): ParseResponse | undefined {
  const cached = resultCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= now) {
    resultCache.delete(key);
    return undefined;
  }
  resultCache.delete(key);
  resultCache.set(key, cached);
  return cached.result;
}

function cacheSet(key: string, result: ParseResponse, now: number) {
  resultCache.delete(key);
  resultCache.set(key, { result, expiresAt: now + CACHE_TTL_MS });
  while (resultCache.size > CACHE_CAPACITY) {
    const oldest = resultCache.keys().next().value;
    if (oldest === undefined) break;
    resultCache.delete(oldest);
  }
}

export function createAiParser(options: AiParserOptions) {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const primaryModel = options.model || "gemini-2.5-flash";
  const fallbackModel = options.fallbackModel || "gemini-2.0-flash";
  const generate =
    options.generate ??
    ((model: string, prompt: string, signal: AbortSignal) =>
      generateWithGemini(model, prompt, signal, options.apiKey));

  return async function parseWithAi(text: string): Promise<ParseResponse> {
    if (!options.apiKey) return noResult();

    const cacheKey = createHash("sha256").update(text, "utf8").digest("hex");
    const cached = cacheGet(cacheKey, now());
    if (cached) return cached;

    const deadline = now() + TOTAL_BUDGET_MS;
    try {
      await concurrencyGate.acquire(deadline, now);
    } catch {
      return noResult();
    }

    let attempts = 0;
    let repairUsed = false;
    let prompt = createPrompt(text);

    try {
      while (attempts < 3 && now() < deadline) {
        attempts += 1;
        const model = attempts === 3 ? fallbackModel : primaryModel;
        const controller = new AbortController();
        const timeoutMs = Math.min(ATTEMPT_TIMEOUT_MS, deadline - now());
        let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

        try {
          const output = await Promise.race([
            generate(model, prompt, controller.signal),
            new Promise<never>((_resolve, reject) => {
              timeoutTimer = setTimeout(() => {
                controller.abort();
                reject(new Error("Gemini attempt timed out"));
              }, timeoutMs);
            }),
          ]);
          let decoded: unknown;
          try {
            decoded = JSON.parse(output) as unknown;
          } catch {
            decoded = undefined;
          }
          const parsed = parsedEntriesSchema.safeParse(decoded);
          if (parsed.success) {
            const result: ParseResponse = { source: "ai", entries: parsed.data };
            cacheSet(cacheKey, result, now());
            return result;
          }
          if (repairUsed || attempts >= 3 || now() >= deadline) {
            return noResult();
          }
          repairUsed = true;
          prompt = [
            "Repair this invalid JSON into the required JSON array of ledger entries.",
            "Each entry requires name, positive integer amount, type (gave_credit, received_payment, or null), optional note, and confidence from 0 to 1.",
            "Do not add facts. Return only valid JSON.",
            `Invalid output: ${cleanInput(output.slice(0, 4000))}`,
          ].join("\n");
        } catch (error) {
          if (!canRetry(error) || attempts >= 3 || now() >= deadline) {
            return noResult();
          }
          const backoffMs = Math.min(
            250 * 2 ** (attempts - 1) + Math.floor(random() * 200),
            deadline - now(),
          );
          if (backoffMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
          }
        } finally {
          if (timeoutTimer) clearTimeout(timeoutTimer);
        }
      }
      return noResult();
    } finally {
      concurrencyGate.release();
    }
  };
}

export function clearAiCacheForTests() {
  resultCache.clear();
}
