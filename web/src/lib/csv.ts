import type { Customer, Entry } from "./ledger";

export function escapeCsvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}

export function createLedgerCsv(customers: Customer[], entries: Entry[]): string {
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const rows: (string | number)[][] = [
    ["Customer", "Phone", "Entry type", "Amount (INR)", "Note", "Date", "Source"],
    ...entries.map((entry) => [
      customerById.get(entry.customerId)?.name ?? "Unknown customer",
      customerById.get(entry.customerId)?.phone ?? "",
      entry.type === "gave_credit" ? "Credit given" : "Payment received",
      entry.amount,
      entry.note ?? "",
      entry.createdAt,
      entry.source,
    ]),
  ];
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}
