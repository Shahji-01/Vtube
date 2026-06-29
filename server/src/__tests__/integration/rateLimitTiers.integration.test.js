/**
 * Integration tests — rate-limit tiers (Task 9.1).
 *
 * Feature: phase-2-quality-hardening
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6
 *
 * These tests assemble the real Express app via `createApp({ env })` with tiny,
 * env-overridden limits so "one more than the limit" is a small number of
 * requests rather than hundreds. A fresh app (and therefore a fresh in-memory
 * limiter store) is built per test, so prior tests never affect the observed
 * counts (Req 2.5).
 *
 * No real MongoDB connection is required: the rate limiters are mounted before
 * (and independently of) the controllers, so the rejected request is answered
 * by the limiter, and the at/below-limit requests are intercepted by the
 * validation layer or `verifyJWT` before any database access.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";

// Tiny limits with a short (1s) window shared across tiers, per the task spec.
const TINY_ENV = {
  RATE_LIMIT_GLOBAL: "2",
  RATE_LIMIT_AUTH: "2",
  RATE_LIMIT_UPLOAD: "2",
  RL_GLOBAL_WINDOW_MS: "1000",
  RL_AUTH_WINDOW_MS: "1000",
  RL_UPLOAD_WINDOW_MS: "1000",
  NODE_ENV: "test",
};

const CONFIGURED_LIMIT = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Assert that a 429 response carries the standard rate-limit headers with the
 * expected values (Req 2.2).
 */
function expectRateLimitedHeaders(res) {
  expect(res.status).toBe(429);
  expect(res.headers["ratelimit-limit"]).toBe(String(CONFIGURED_LIMIT));
  expect(res.headers["ratelimit-remaining"]).toBe("0");

  // RateLimit-Reset and Retry-After must be present with a positive numeric value.
  expect(res.headers["ratelimit-reset"]).toBeDefined();
  expect(res.headers["retry-after"]).toBeDefined();
  expect(Number(res.headers["ratelimit-reset"])).toBeGreaterThan(0);
  expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
}

describe("rate-limit tiers (integration)", () => {
  describe("global tier", () => {
    // A non-matching /api/v1/ path is governed by the global limiter only and
    // falls through to the SPA catch-all (200) when below the limit — no DB.
    const PROBE_PATH = "/api/v1/__global_ratelimit_probe__";

    it("rejects the request after exceeding the configured limit with 429 + headers", async () => {
      const app = createApp({ env: TINY_ENV });

      // Requests at/below the limit are NOT rejected with 429 (Req 2.4).
      for (let i = 0; i < CONFIGURED_LIMIT; i++) {
        const res = await request(app).get(PROBE_PATH);
        expect(res.status).not.toBe(429);
      }

      // Exactly one more than the limit -> 429 (Req 2.1, 2.2).
      const limited = await request(app).get(PROBE_PATH);
      expectRateLimitedHeaders(limited);
    });

    it("starts from a reset counter in a fresh app (Req 2.5)", async () => {
      // A brand-new app must allow the first request through, proving the
      // limiter state did not carry over from the previous test.
      const app = createApp({ env: TINY_ENV });
      const first = await request(app).get(PROBE_PATH);
      expect(first.status).not.toBe(429);
    });

    it("no longer rejects once the window elapses (Req 2.6)", async () => {
      const app = createApp({ env: TINY_ENV });

      // Exhaust the limit (limit + 1 requests -> final is 429).
      for (let i = 0; i < CONFIGURED_LIMIT; i++) {
        await request(app).get(PROBE_PATH);
      }
      const limited = await request(app).get(PROBE_PATH);
      expect(limited.status).toBe(429);

      // Wait for the 1s window to elapse, then a subsequent request from the
      // same client must no longer be rejected with 429.
      await sleep(1100);
      const afterWindow = await request(app).get(PROBE_PATH);
      expect(afterWindow.status).not.toBe(429);
    });
  });

  describe("auth tier", () => {
    // The login path. Below-limit requests carry an empty body so the
    // validation layer answers them with 400 before any DB access; the limiter
    // runs first, so the over-limit request is a 429.
    const LOGIN_PATH = "/api/v1/users/login";

    it("rejects the login request after exceeding the limit with 429 + headers", async () => {
      const app = createApp({ env: TINY_ENV });

      for (let i = 0; i < CONFIGURED_LIMIT; i++) {
        const res = await request(app).post(LOGIN_PATH).send({});
        expect(res.status).not.toBe(429);
      }

      const limited = await request(app).post(LOGIN_PATH).send({});
      expectRateLimitedHeaders(limited);
    });
  });

  describe("upload tier", () => {
    // The multipart thumbnail-update path. Below-limit requests are rejected by
    // verifyJWT (401, no token) before the controller/DB; the limiter runs
    // first, so the over-limit request is a 429.
    const UPLOAD_PATH = "/api/v1/videos/507f1f77bcf86cd799439011";

    it("rejects the upload request after exceeding the limit with 429 + headers", async () => {
      const app = createApp({ env: TINY_ENV });

      for (let i = 0; i < CONFIGURED_LIMIT; i++) {
        const res = await request(app).patch(UPLOAD_PATH);
        expect(res.status).not.toBe(429);
      }

      const limited = await request(app).patch(UPLOAD_PATH);
      expectRateLimitedHeaders(limited);
    });
  });
});
