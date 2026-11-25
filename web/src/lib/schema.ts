// This schema must stay identical to /server/src/schema.ts.
import { z } from "zod";

export const parsedEntrySchema = z.object({
  name: z.string().trim().min(1).max(100),
  amount: z.number().int().positive(),
  type: z.enum(["gave_credit", "received_payment"]).nullable(),
  note: z.string().trim().max(200).optional(),
  confidence: z.number().min(0).max(1),
});

export const parsedEntriesSchema = z.array(parsedEntrySchema);
export const parseResponseSchema = z.object({
  source: z.enum(["ai", "none"]),
  entries: parsedEntriesSchema,
});

export type ParsedEntry = z.infer<typeof parsedEntrySchema>;
