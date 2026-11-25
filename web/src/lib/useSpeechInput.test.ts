import { describe, expect, it } from "vitest";
import {
  appendSpeechSegment,
  readSpeechResults,
} from "./useSpeechInput";

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

  it("collapses cumulative mobile recognition result segments", () => {
    const results = {
      length: 6,
      0: { 0: { transcript: "Ramesh" }, isFinal: true },
      1: { 0: { transcript: "Ramesh Ne" }, isFinal: true },
      2: { 0: { transcript: "Ramesh Ne ₹100" }, isFinal: true },
      3: { 0: { transcript: "Ramesh Ne ₹100 Udhar" }, isFinal: true },
      4: { 0: { transcript: "Ramesh Ne ₹100 Udhar Liye" }, isFinal: false },
      5: { 0: { transcript: "Ramesh Ne ₹100 Udhar Liye" }, isFinal: false },
    };

    expect(readSpeechResults(results)).toBe("Ramesh Ne ₹100 Udhar Liye");
  });

  it("merges overlapping recognition restarts without repeating their shared words", () => {
    expect(
      appendSpeechSegment(
        "Ramesh Ne ₹100 Udhar",
        "Ramesh Ne ₹100 Udhar Liye",
      ),
    ).toBe("Ramesh Ne ₹100 Udhar Liye");
    expect(appendSpeechSegment("Ramesh", "ne ₹100 udhar liye")).toBe(
      "Ramesh ne ₹100 udhar liye",
    );
  });
});
