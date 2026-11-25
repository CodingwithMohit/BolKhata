import { formatRupees } from "./ledger";

export type ReminderTone = "polite" | "friendly" | "firm";

const templates: Record<ReminderTone, (name: string, amount: string, shop: string) => string> = {
  polite: (name, amount, shop) =>
    `Namaste ${name} ji, ${shop} ke khate mein ${amount} baaki hain. Jab suvidha ho, kripya chuka dein. Dhanyavaad!`,
  friendly: (name, amount, shop) =>
    `Namaste ${name}! ${shop} ke khate mein aapke ${amount} baaki hain. Aaram se jab time mile bhej dijiyega.`,
  firm: (name, amount, shop) =>
    `Namaste ${name}, kripya ${shop} ke khate ke baaki ${amount} ka bhugtan jald karein. Shukriya.`,
};

export function normalizeIndianPhone(phone: string): string | undefined {
  let digits = phone.replace(/\D/gu, "");
  if (digits.startsWith("0091")) digits = digits.slice(2);
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return undefined;
}

export function createReminderMessage(
  customerName: string,
  balance: number,
  shopName: string,
  tone: ReminderTone,
): string {
  return templates[tone](
    customerName.trim(),
    formatRupees(balance),
    shopName.trim() || "My Shop",
  );
}

export function createWhatsAppReminderUrl(
  phone: string,
  customerName: string,
  balance: number,
  shopName: string,
  tone: ReminderTone,
): string | undefined {
  const normalizedPhone = normalizeIndianPhone(phone);
  if (!normalizedPhone || balance <= 0) return undefined;
  const message = createReminderMessage(customerName, balance, shopName, tone);
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
