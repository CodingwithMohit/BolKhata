import { describe, expect, it } from "vitest";
import { translate } from "./i18n";

describe("English and Hindi UI labels", () => {
  it("provides both languages for core ledger and settings labels", () => {
    expect(translate("en", "home.outstanding")).toBe("Total outstanding udhaar");
    expect(translate("hi", "home.outstanding")).toBe("कुल बाकी उधार");
    expect(translate("en", "settings.delete")).toBe("Delete all data");
    expect(translate("hi", "settings.delete")).toBe("सारा डेटा हटाएँ");
  });

  it("explains speech recognition privacy in both languages", () => {
    expect(translate("en", "settings.voicePrivacy")).toMatch(/Chrome and Edge/u);
    expect(translate("en", "settings.voicePrivacy")).toMatch(/never uses the microphone/u);
    expect(translate("hi", "settings.voicePrivacy")).toMatch(/Chrome और Edge/u);
  });
});
