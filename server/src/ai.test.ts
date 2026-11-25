import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAiCacheForTests,
  createAiParser,
  type GenerateContent,
} from "./ai.js";

const validEntries = JSON.stringify([
  {
    name: "Ramesh",
    amount: 200,
    type: "gave_credit",
    note: "saman",
    confidence: 0.95,
  },
]);

beforeEach(() => {
  clearAiCacheForTests();
});

describe("AI parsing fallback", () => {
  it("returns no result immediately when no API key is configured", async () => {
    const generate = vi.fn<GenerateContent>();
    const parse = createAiParser({ apiKey: "", generate });
    await expect(parse("Ramesh ne 200 udhaar liya")).resolves.toEqual({
      source: "none",
      entries: [],
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("repairs one invalid JSON response and validates the repaired entries", async () => {
    const generate = vi
      .fn<GenerateContent>()
      .mockResolvedValueOnce("{invalid")
      .mockResolvedValueOnce(validEntries);
    const parse = createAiParser({ apiKey: "test-key", generate });

    await expect(parse("Ramesh ne 200 udhaar liya")).resolves.toMatchObject({
      source: "ai",
      entries: [{ name: "Ramesh", amount: 200, type: "gave_credit" }],
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][1]).toContain("Repair this invalid JSON");
  });

  it("returns rules-fallback shape after an invalid repair response", async () => {
    const generate = vi
      .fn<GenerateContent>()
      .mockResolvedValueOnce("{invalid")
      .mockResolvedValueOnce("{still invalid");
    const parse = createAiParser({ apiKey: "test-key", generate });
    await expect(parse("Ramesh ne 200 udhaar liya")).resolves.toEqual({
      source: "none",
      entries: [],
    });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("retries 429 and 503 errors and uses the fallback model on the last attempt", async () => {
    const generate = vi
      .fn<GenerateContent>()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce(validEntries);
    const parse = createAiParser({
      apiKey: "test-key",
      model: "primary-flash",
      fallbackModel: "fallback-flash",
      generate,
      random: () => 0,
    });
    await expect(parse("Ramesh ne 200 udhaar liya")).resolves.toMatchObject({
      source: "ai",
    });
    expect(generate.mock.calls.map(([model]) => model)).toEqual([
      "primary-flash",
      "primary-flash",
      "fallback-flash",
    ]);
  });

  it("does not retry unauthorized responses", async () => {
    const generate = vi.fn<GenerateContent>().mockRejectedValue({ status: 401 });
    const parse = createAiParser({ apiKey: "test-key", generate });
    await expect(parse("Ramesh ne 200 udhaar liya")).resolves.toEqual({
      source: "none",
      entries: [],
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("strips long digit sequences before sending text to Gemini", async () => {
    const generate = vi.fn<GenerateContent>().mockResolvedValue(validEntries);
    const parse = createAiParser({ apiKey: "test-key", generate });
    await parse("Call 9876543210; Ramesh ne 200 udhaar liya");
    expect(generate.mock.calls[0][1]).not.toContain("9876543210");
    expect(generate.mock.calls[0][1]).toContain("[redacted number]");
  });

  it("strips long Devanagari digit sequences before sending text to Gemini", async () => {
    const generate = vi.fn<GenerateContent>().mockResolvedValue(validEntries);
    const parse = createAiParser({ apiKey: "test-key", generate });
    await parse("नंबर ९८७६५४३२१०; रमेश ने २०० उधार लिया");
    expect(generate.mock.calls[0][1]).not.toContain("९८७६५४३२१०");
    expect(generate.mock.calls[0][1]).toContain("[redacted number]");
  });

  it("caches validated results by text", async () => {
    const generate = vi.fn<GenerateContent>().mockResolvedValue(validEntries);
    const parse = createAiParser({ apiKey: "test-key", generate });
    const first = await parse("Ramesh ne 200 udhaar liya");
    const second = await parse("Ramesh ne 200 udhaar liya");
    expect(first).toEqual(second);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps concurrent Gemini calls to two", async () => {
    let active = 0;
    let maximumActive = 0;
    const generate: GenerateContent = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return validEntries;
    };
    const parse = createAiParser({ apiKey: "test-key", generate });

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        parse(`Customer ${index} ne 200 udhaar liya`),
      ),
    );
    expect(maximumActive).toBe(2);
  });
});
