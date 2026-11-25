import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

const parsedResponse = {
  source: "ai" as const,
  entries: [
    {
      name: "Ramesh",
      amount: 200,
      type: "gave_credit" as const,
      confidence: 0.95,
    },
  ],
};

describe("Express API", () => {
  it("returns the health response", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("validates the parse request body", async () => {
    const parseText = vi.fn(async () => parsedResponse);
    const app = createApp({ parseText });
    const missingText = await request(app).post("/api/parse").send({});
    const tooLong = await request(app).post("/api/parse").send({ text: "x".repeat(501) });

    expect(missingText.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(parseText).not.toHaveBeenCalled();
  });

  it("calls the injected parser and validates its response", async () => {
    const parseText = vi.fn(async () => parsedResponse);
    const response = await request(createApp({ parseText }))
      .post("/api/parse")
      .send({ text: "Ramesh ne 200 udhaar liya" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(parsedResponse);
    expect(parseText).toHaveBeenCalledWith("Ramesh ne 200 udhaar liya");
  });

  it("returns the rules fallback rather than a 500 when AI parsing fails", async () => {
    const parseText = vi.fn(async () => {
      throw new Error("model unavailable");
    });
    const response = await request(createApp({ parseText }))
      .post("/api/parse")
      .send({ text: "Ramesh ne 200 udhaar liya" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ source: "none", entries: [] });
  });

  it("allows localhost in development and configured origins in production", async () => {
    const development = await request(createApp({ nodeEnv: "development" }))
      .get("/health")
      .set("Origin", "http://localhost:3000");
    const production = await request(
      createApp({ nodeEnv: "production", frontendOrigins: ["https://shop.example"] }),
    )
      .get("/health")
      .set("Origin", "https://shop.example");
    const denied = await request(
      createApp({ nodeEnv: "production", frontendOrigins: ["https://shop.example"] }),
    )
      .get("/health")
      .set("Origin", "https://other.example");

    expect(development.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(production.headers["access-control-allow-origin"]).toBe("https://shop.example");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("limits parse requests per IP", async () => {
    const app = createApp({ parseText: async () => ({ source: "none", entries: [] }) });
    let response = await request(app).post("/api/parse").send({ text: "x" });
    for (let count = 1; count < 20; count += 1) {
      response = await request(app).post("/api/parse").send({ text: "x" });
    }
    expect(response.status).toBe(200);
    response = await request(app).post("/api/parse").send({ text: "x" });
    expect(response.status).toBe(429);
    expect(response.body.message).toMatch(/too many parse requests/iu);
  });
});
