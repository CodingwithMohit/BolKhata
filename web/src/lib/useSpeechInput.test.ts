import { describe, expect, it } from "vitest";
import { readSpeechResults } from "./useSpeechInput";

describe("readSpeechResults", () => {
  it("builds a transcript from the current result snapshot", () => {
    const firstSnapshot = {
      length: 1,
      0: { 0: { transcript: "Ramesh ne" }, isFinal: true },
    };
    const secondSnapshot = {
      length: 2,
      0: { 0: { transcript: "Ramesh ne" }, isFinal: true },
      1: { 0: { transcript: "do hazar" }, isFinal: false },
    };

    expect(readSpeechResults(firstSnapshot)).toBe("Ramesh ne");
    expect(readSpeechResults(secondSnapshot)).toBe("Ramesh ne do hazar");
    expect(readSpeechResults(secondSnapshot)).toBe("Ramesh ne do hazar");
  });

  it("ignores empty result segments", () => {
    const results = {
      length: 3,
      0: { 0: { transcript: "  " }, isFinal: true },
      1: { 0: { transcript: "Ramesh" }, isFinal: true },
      2: { 0: { transcript: "" }, isFinal: false },
    };
    expect(readSpeechResults(results)).toBe("Ramesh");
  });
});
