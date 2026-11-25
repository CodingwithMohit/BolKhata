import { describe, expect, it } from "vitest";
import {
  calculateBalance,
  calculateTotalOutstanding,
  createEmptyLedger,
  customerSchema,
  entrySchema,
  formatRupees,
  matchCustomerName,
  normalizeCustomerName,
  parseLedger,
  summarizeToday,
  type Customer,
  type Entry,
} from "./ledger";

const customers: Customer[] = [
  { id: "ramesh", name: "Ramesh ji", createdAt: "2026-01-01T10:00:00.000Z" },
  { id: "rakesh", name: "Rakesh", createdAt: "2026-01-01T10:00:00.000Z" },
];

const entries: Entry[] = [
  {
    id: "credit",
    customerId: "ramesh",
    type: "gave_credit",
    amount: 500,
    createdAt: "2026-01-01T10:00:00.000Z",
    source: "typed",
  },
  {
    id: "payment",
    customerId: "ramesh",
    type: "received_payment",
    amount: 125,
    createdAt: "2026-01-01T11:00:00.000Z",
    source: "manual",
  },
  {
    id: "other-credit",
    customerId: "rakesh",
    type: "gave_credit",
    amount: 300,
    createdAt: "2026-01-01T11:00:00.000Z",
    source: "voice",
  },
];

describe("ledger calculations", () => {
  it("calculates a customer's credit less received payments", () => {
    expect(calculateBalance("ramesh", entries)).toBe(375);
  });

  it("does not include other customers in a balance", () => {
    expect(calculateBalance("rakesh", entries)).toBe(300);
  });

  it("calculates total outstanding across customers", () => {
    expect(calculateTotalOutstanding(entries)).toBe(675);
  });

  it("formats rupees using the Indian numbering system", () => {
    expect(formatRupees(12500)).toContain("12,500");
    expect(formatRupees(12500)).toContain("₹");
  });

  it("summarizes only entries from the current local day", () => {
    const now = new Date(2026, 0, 1, 15, 0, 0);
    const todayEntries = entries.map((entry) => ({
      ...entry,
      createdAt: new Date(2026, 0, 1, 11, 0, 0).toISOString(),
    }));
    const summary = summarizeToday(todayEntries, now);
    expect(summary).toEqual({
      creditGiven: 800,
      paymentsReceived: 125,
      net: 675,
      entryCount: 3,
    });
  });
});

describe("local ledger parsing and validation", () => {
  it("starts with an empty versioned ledger", () => {
    expect(createEmptyLedger()).toEqual({
      version: 1,
      customers: [],
      entries: [],
      settings: { shopName: "My Shop", aiEnabled: true, language: "en" },
    });
  });

  it("starts fresh for an empty or corrupt stored value", () => {
    expect(parseLedger(null)).toEqual(createEmptyLedger());
    expect(parseLedger("{not-json")).toEqual(createEmptyLedger());
  });

  it("starts fresh when a stored ledger does not match the schema", () => {
    expect(parseLedger(JSON.stringify({ version: 99, customers: [], entries: [] }))).toEqual(
      createEmptyLedger(),
    );
  });

  it("loads a valid stored ledger", () => {
    const ledger = { version: 1, customers, entries };
    expect(parseLedger(JSON.stringify(ledger))).toEqual({
      ...ledger,
      settings: { shopName: "My Shop", aiEnabled: true, language: "en" },
    });
  });

  it("validates customer and entry record shapes", () => {
    expect(
      customerSchema.safeParse({
        id: "customer",
        name: "Ramesh",
        createdAt: "2026-01-01T10:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      entrySchema.safeParse({
        id: "entry",
        customerId: "customer",
        type: "gave_credit",
        amount: 10,
        createdAt: "2026-01-01T10:00:00.000Z",
        source: "typed",
      }).success,
    ).toBe(true);
  });
});

describe("customer name matching", () => {
  it("normalizes case, whitespace, and honorifics", () => {
    expect(normalizeCustomerName("  RAMESH   bhai  ji ")).toBe("ramesh");
  });

  it("returns an exact match for a normalized name", () => {
    expect(matchCustomerName("ramesh", customers).exact?.id).toBe("ramesh");
  });

  it("suggests a one-edit match without selecting it", () => {
    const match = matchCustomerName("Ramesh", [customers[1]]);
    expect(match.exact).toBeUndefined();
    expect(match.suggestion?.id).toBe("rakesh");
  });

  it("does not merge Ramesh and Rakesh as an exact match", () => {
    expect(matchCustomerName("Rakesh", [customers[0]]).exact).toBeUndefined();
    expect(matchCustomerName("Ramesh", [customers[1]]).exact).toBeUndefined();
  });

  it("returns no match or suggestion for unrelated names", () => {
    expect(matchCustomerName("Sunita", customers)).toEqual({});
  });
});
