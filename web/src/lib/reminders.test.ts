import { describe, expect, it } from "vitest";
import {
  createReminderMessage,
  createWhatsAppReminderUrl,
  normalizeIndianPhone,
} from "./reminders";

describe("Indian phone normalization", () => {
  it.each([
    ["9876543210", "919876543210"],
    ["+91 98765-43210", "919876543210"],
    ["0091 9876543210", "919876543210"],
  ])("normalizes %s", (phone, normalized) => {
    expect(normalizeIndianPhone(phone)).toBe(normalized);
  });

  it.each(["12345", "12345678901", "+1 202 555 0100", "91987654321099"])(
    "rejects invalid Indian number %s",
    (phone) => {
      expect(normalizeIndianPhone(phone)).toBeUndefined();
    },
  );
});

describe("WhatsApp reminders", () => {
  it.each(["polite", "friendly", "firm"] as const)(
    "includes the customer, amount, and shop in the %s template",
    (tone) => {
      const message = createReminderMessage("Ramesh", 1250, "Kumar Stores", tone);
      expect(message).toContain("Ramesh");
      expect(message).toContain("₹1,250");
      expect(message).toContain("Kumar Stores");
    },
  );

  it("creates an encoded WhatsApp link for a valid phone", () => {
    const url = createWhatsAppReminderUrl(
      "+91 98765 43210",
      "Ramesh",
      500,
      "Kumar Stores",
      "polite",
    );
    expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/u);
    expect(url).toContain(encodeURIComponent("Ramesh"));
  });

  it("does not create reminders for invalid phone or zero balance", () => {
    expect(
      createWhatsAppReminderUrl("12345", "Ramesh", 500, "Shop", "polite"),
    ).toBeUndefined();
    expect(
      createWhatsAppReminderUrl("9876543210", "Ramesh", 0, "Shop", "polite"),
    ).toBeUndefined();
  });
});
