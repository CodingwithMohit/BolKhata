import { describe, expect, it, vi } from "vitest";
import { parseWithFallback } from "./parseWithFallback";
import type { ParsedEntry } from "./schema";

const uncertainRulesEntry: ParsedEntry = {
  name: "Ramesh",
  amount: 250,
  type: null,
  confidence: 0.35,
};

const aiResult = {
  source: "ai",
  entries: [
    {
      name: "Ramesh",
      amount: 250,
      type: "gave_credit",
      confidence: 0.92,
    },
  ],
};

describe("parseWithFallback", () => {
  it("uses confident rules results without a network request", async () => {
    const fetcher = vi.fn();
    const entry = { ...uncertainRulesEntry, confidence: 0.95 };
    await expect(
      parseWithFallback("phrase", [entry], {
        enabled: true,
        apiBaseUrl: "https://api.example",
        fetcher,
      }),
    ).resolves.toEqual({ entries: [entry], source: "rules" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps the rules result when the API fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(
      parseWithFallback("phrase", [uncertainRulesEntry], {
        enabled: true,
        apiBaseUrl: "https://api.example",
        fetcher,
      }),
    ).resolves.toEqual({
      entries: [uncertainRulesEntry],
      source: "rules",
      message: "AI unavailable, showing rules result.",
    });
  });

  it("keeps the rules result when the server returns no result", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ source: "none", entries: [] }), {
        status: 200,
      }),
    );
    const result = await parseWithFallback("phrase", [uncertainRulesEntry], {
      enabled: true,
      apiBaseUrl: "https://api.example",
      fetcher,
    });
    expect(result.entries).toEqual([uncertainRulesEntry]);
    expect(result.source).toBe("rules");
    expect(result.message).toMatch(/AI unavailable/);
  });

  it("keeps the rules result when the API response is invalid", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ source: "ai", entries: [{ amount: "invalid" }] }), {
        status: 200,
      }),
    );
    const result = await parseWithFallback("phrase", [uncertainRulesEntry], {
      enabled: true,
      apiBaseUrl: "https://api.example",
      fetcher,
    });
    expect(result.entries).toEqual([uncertainRulesEntry]);
    expect(result.source).toBe("rules");
    expect(result.message).toMatch(/AI unavailable/);
  });

  it("uses validated AI entries for uncertain rules results", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(aiResult), { status: 200 }),
    );
    await expect(
      parseWithFallback("phrase", [uncertainRulesEntry], {
        enabled: true,
        apiBaseUrl: "https://api.example",
        fetcher,
      }),
    ).resolves.toEqual({
      entries: aiResult.entries,
      source: "ai",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example/api/parse",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not call AI when parsing is disabled", async () => {
    const fetcher = vi.fn();
    const result = await parseWithFallback("phrase", [uncertainRulesEntry], {
      enabled: false,
      apiBaseUrl: "https://api.example",
      fetcher,
    });
    expect(result.source).toBe("rules");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
