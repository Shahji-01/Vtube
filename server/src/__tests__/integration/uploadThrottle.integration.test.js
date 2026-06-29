/**
 * Integration tests — upload-tier coverage for the thumbnail PATCH (Task 9.2).
 *
 * Feature: phase-2-quality-hardening
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 *
 * The app is assembled with a HIGH global limit and a LOW upload limit so the
 * upload tier is the one that triggers (the global tier never fires within the
 * test). A fresh app is built per test for a reset limiter store.
 *
 * No real MongoDB connection is required:
 *   - The throttled PATCH request is answered by the upload limiter before the
 *     controller runs.
 *   - Below-limit PATCH requests are rejected by `verifyJWT` (401) before the
 *     controller/DB (the upload limiter is mounted before the routers, so a
 *     429 happens before auth).
 *   - The GET assertions disable Mongoose command buffering so the read
 *     controllers fail fast (500) instead of hanging — proving the GETs reach
 *     past the upload limiter (i.e. are NOT throttled) without a live DB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../app.js";

const HIGH_GLOBAL_LOW_UPLOAD_ENV = {
  RATE_LIMIT_GLOBAL: "100",
  RATE_LIMIT_UPLOAD: "2",
  RL_GLOBAL_WINDOW_MS: "60000",
  RL_UPLOAD_WINDOW_MS: "60000",
  NODE_ENV: "test",
};

const UPLOAD_LIMIT = 2;
const VIDEO_ID = "507f1f77bcf86cd799439011";
const PATCH_PATH = `/api/v1/videos/${VIDEO_ID}`;

let originalBufferCommands;

beforeAll(() => {
  // Make read-path queries fail fast (instead of buffering for ~10s) when no
  // DB connection exists, so the "GETs are not throttled" assertions stay quick.
  originalBufferCommands = mongoose.get("bufferCommands");
  mongoose.set("bufferCommands", false);
});

afterAll(() => {
  mongoose.set("bufferCommands", originalBufferCommands);
});

describe("upload-tier throttling for thumbnail PATCH (integration)", () => {
  it("throttles PATCH /api/v1/videos/:id with a uniform Error_Response + RateLimit-* headers", async () => {
    const app = createApp({ env: HIGH_GLOBAL_LOW_UPLOAD_ENV });

    // Below-limit PATCH requests pass the limiter and hit verifyJWT (401);
    // they must NOT be 429 (Req 9.6).
    for (let i = 0; i < UPLOAD_LIMIT; i++) {
      const res = await request(app).patch(PATCH_PATH);
      expect(res.status).not.toBe(429);
    }

    // One more than the limit -> 429 from the upload tier (Req 9.1, 9.2).
    const limited = await request(app).patch(PATCH_PATH);
    expect(limited.status).toBe(429);

    // Uniform Error_Response shape (Req 9.3).
    expect(limited.body).toEqual(
      expect.objectContaining({
        statusCode: 429,
        success: false,
        message: expect.any(String),
        errors: expect.any(Array),
      })
    );

    // RateLimit-* headers present with the configured values (Req 9.5).
    expect(limited.headers["ratelimit-limit"]).toBe(String(UPLOAD_LIMIT));
    expect(limited.headers["ratelimit-remaining"]).toBe("0");
    expect(limited.headers["ratelimit-reset"]).toBeDefined();
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("does NOT throttle public GET list or GET by-id with the upload tier (Req 9.4)", async () => {
    const app = createApp({ env: HIGH_GLOBAL_LOW_UPLOAD_ENV });

    // Send more than the upload limit of GET requests against both public read
    // endpoints; none may be rejected with 429 because the upload tier is
    // scoped to POST/PATCH only.
    const totalGets = UPLOAD_LIMIT + 2; // 4 > 2

    for (let i = 0; i < totalGets; i++) {
      const listRes = await request(app).get("/api/v1/videos");
      expect(listRes.status).not.toBe(429);

      const byIdRes = await request(app).get(`/api/v1/videos/${VIDEO_ID}`);
      expect(byIdRes.status).not.toBe(429);
    }
  });
});
