import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import { createAiParser } from "./ai.js";
import { parseRequestSchema } from "./api-schema.js";
import { parseResponseSchema } from "./schema.js";

const healthResponseSchema = z.object({ ok: z.literal(true) });
const MAX_BODY_BYTES = 10 * 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

export type ParseText = (text: string) => Promise<z.infer<typeof parseResponseSchema>>;

interface CreateAppOptions {
  parseText?: ParseText;
  frontendOrigins?: string[];
  nodeEnv?: string;
}

function getDefaultParseText(): ParseText {
  const parse = createAiParser({
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_MODEL,
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL,
  });
  return parse;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const origins = options.frontendOrigins ??
    (process.env.FRONTEND_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  const allowedOrigins = new Set(origins);
  if (nodeEnv !== "production") allowedOrigins.add("http://localhost:3000");

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || allowedOrigins.has(origin));
      },
    }),
  );
  app.use(express.json({ limit: MAX_BODY_BYTES }));

  const parseLimit = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(_request: Request, response: Response) {
      response.status(429).json({ message: "Too many parse requests. Please try again later." });
    },
  });

  app.get("/health", (_request, response) => {
    response.json(healthResponseSchema.parse({ ok: true }));
  });

  app.post("/api/parse", parseLimit, async (request, response) => {
    const body = parseRequestSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ message: "Request must include text of 500 characters or fewer." });
      return;
    }

    const parseText = options.parseText ?? getDefaultParseText();
    try {
      const parsed = await parseText(body.data.text);
      response.status(200).json(parseResponseSchema.parse(parsed));
    } catch {
      response.status(200).json({ source: "none", entries: [] });
    }
  });

  app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError) {
      response.status(400).json({ message: "Request body must be valid JSON." });
      return;
    }
    if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      response.status(413).json({ message: "Request body must be 10 KB or smaller." });
      return;
    }
    response.status(500).json({ message: "The server could not process this request." });
  });

  return app;
}
