import { describe, expect, it } from "vitest";
import { parsedEntrySchema } from "./schema.js";

describe("ParsedEntry schema", () => {
  it("accepts a valid parsed credit entry", () => {
    expect(
      parsedEntrySchema.safeParse({
        name: "Ramesh",
        amount: 200,
        type: "gave_credit",
        note: "saman",
        confidence: 0.95,
      }).success,
    ).toBe(true);
  });

  it("rejects non-positive or fractional amounts", () => {
    for (const amount of [0, -1, 2.5]) {
      expect(
        parsedEntrySchema.safeParse({
          name: "Ramesh",
          amount,
          type: "gave_credit",
          confidence: 0.95,
        }).success,
      ).toBe(false);
    }
  });
});
