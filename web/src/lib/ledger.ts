import { z } from "zod";

export const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  phone: z.string().optional(),
  createdAt: z.string().datetime(),
});

export const entrySchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  type: z.enum(["gave_credit", "received_payment"]),
  amount: z.number().int().positive(),
  note: z.string().max(200).optional(),
  createdAt: z.string().datetime(),
  source: z.enum(["voice", "typed", "manual"]),
});

export const ledgerSettingsSchema = z.object({
  shopName: z.string().trim().max(100).default("My Shop"),
  aiEnabled: z.boolean().default(true),
  language: z.enum(["en", "hi"]).default("en"),
});

export const ledgerSchema = z.object({
  version: z.literal(1),
  customers: z.array(customerSchema),
  entries: z.array(entrySchema),
  settings: ledgerSettingsSchema.default({
    shopName: "My Shop",
    aiEnabled: true,
    language: "en",
  }),
});

export type Customer = z.infer<typeof customerSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type LedgerSettings = z.infer<typeof ledgerSettingsSchema>;
export type Ledger = z.infer<typeof ledgerSchema>;

export const LEDGER_STORAGE_KEY = "bolkhata-ledger";

export function createEmptyLedger(): Ledger {
  return {
    version: 1,
    customers: [],
    entries: [],
    settings: { shopName: "My Shop", aiEnabled: true, language: "en" },
  };
}

export function parseLedger(value: string | null): Ledger {
  if (!value) {
    return createEmptyLedger();
  }
  try {
    const storedValue: unknown = JSON.parse(value);
    const result = ledgerSchema.safeParse(storedValue);
    return result.success ? result.data : createEmptyLedger();
  } catch {
    return createEmptyLedger();
  }
}

export function calculateBalance(customerId: string, entries: Entry[]): number {
  return entries.reduce((balance, entry) => {
    if (entry.customerId !== customerId) {
      return balance;
    }
    return balance + (entry.type === "gave_credit" ? entry.amount : -entry.amount);
  }, 0);
}

export function calculateTotalOutstanding(entries: Entry[]): number {
  return entries.reduce(
    (total, entry) =>
      total + (entry.type === "gave_credit" ? entry.amount : -entry.amount),
    0,
  );
}

export function formatRupees(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const HONORIFICS = new Set([
  "ji",
  "bhai",
  "didi",
  "bhaiya",
  "sir",
  "madam",
]);

export function normalizeCustomerName(name: string): string {
  return name
    .toLocaleLowerCase("en-IN")
    .split(/\s+/u)
    .filter((word) => word && !HONORIFICS.has(word))
    .join(" ")
    .trim();
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function matchCustomerName(
  name: string,
  customers: Customer[],
): { exact?: Customer; suggestion?: Customer } {
  const normalized = normalizeCustomerName(name);
  const exact = customers.find(
    (customer) => normalizeCustomerName(customer.name) === normalized,
  );
  if (exact) {
    return { exact };
  }

  const suggestion = customers.find(
    (customer) =>
      levenshteinDistance(
        normalized,
        normalizeCustomerName(customer.name),
      ) <= 1,
  );
  return suggestion ? { suggestion } : {};
}

export function summarizeToday(entries: Entry[], now = new Date()) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const todaysEntries = entries.filter((entry) => {
    const createdAt = new Date(entry.createdAt).getTime();
    return createdAt >= dayStart.getTime() && createdAt < dayEnd.getTime();
  });
  const creditGiven = todaysEntries
    .filter((entry) => entry.type === "gave_credit")
    .reduce((total, entry) => total + entry.amount, 0);
  const paymentsReceived = todaysEntries
    .filter((entry) => entry.type === "received_payment")
    .reduce((total, entry) => total + entry.amount, 0);
  return {
    creditGiven,
    paymentsReceived,
    net: creditGiven - paymentsReceived,
    entryCount: todaysEntries.length,
  };
}
