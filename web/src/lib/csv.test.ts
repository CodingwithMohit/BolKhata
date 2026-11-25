import { describe, expect, it } from "vitest";
import { createLedgerCsv, escapeCsvCell } from "./csv";

describe("CSV export", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@command", "=@SUM(1,2)"])(
    "neutralizes formula cell %s",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`"'${value.replace(/"/gu, '""')}"`);
    },
  );

  it("quotes and escapes CSV delimiters", () => {
    expect(escapeCsvCell('Ramesh, "Bhai"')).toBe('"Ramesh, ""Bhai"""');
  });

  it("exports customers, phones, amounts, notes, dates, and sources", () => {
    const csv = createLedgerCsv(
      [
        {
          id: "c1",
          name: "Ramesh",
          phone: "9876543210",
          createdAt: "2026-01-01T10:00:00.000Z",
        },
      ],
      [
        {
          id: "e1",
          customerId: "c1",
          type: "gave_credit",
          amount: 200,
          note: "chai",
          createdAt: "2026-01-01T11:00:00.000Z",
          source: "typed",
        },
      ],
    );
    expect(csv).toContain('"Customer","Phone","Entry type"');
    expect(csv).toContain('"Ramesh","9876543210","Credit given","200","chai"');
  });

  it("neutralizes formula injection in customer names in the exported file", () => {
    const csv = createLedgerCsv(
      [
        {
          id: "c1",
          name: "=HYPERLINK",
          createdAt: "2026-01-01T10:00:00.000Z",
        },
      ],
      [
        {
          id: "e1",
          customerId: "c1",
          type: "received_payment",
          amount: 5,
          createdAt: "2026-01-01T11:00:00.000Z",
          source: "manual",
        },
      ],
    );
    expect(csv).toContain("\"'=HYPERLINK\"");
  });
});
