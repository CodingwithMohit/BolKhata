import { z } from "zod";
import type { parseResponseSchema } from "./schema.js";

export const parseRequestSchema = z.object({
  text: z.string().max(500),
});

export type ParseResponse = z.infer<typeof parseResponseSchema>;
