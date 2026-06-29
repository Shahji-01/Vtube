/**
 * Feature: phase-2-quality-hardening, Property 9
 *
 * Property 9: Generic and production errors never leak internals.
 * Validates: Requirements 1.1, 15.7
 *
 * For any forwarded error that is NOT an ApiError (or whose statusCode is
 * missing / outside 400-599), and with NODE_ENV=production, the handler
 * responds with HTTP 500, a generic message, an empty errors array, and no
 * stack — and the serialized body contains none of the internal substrings
 * (raw messages, fs paths, stack frames) embedded in the underlying error.
 * req/res are mocked (no real I/O).
 */

import { describe, it, expect, afterEach } from "vitest";
import fc from "fast-check";

import { errorHandler } from "../../middlewares/error.middleware.js";
import { ApiError } from "../../utils/ApiError.js";

function makeRes() {
  return {
    statusCode: undefined,
    contentType: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    type(t) {
      this.contentType = t;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

const makeReq = () => ({ method: "POST", path: "/api/v1/secret" });

const originalEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

// A distinctive secret/internal marker that must never appear in the response.
const sentinelArb = fc
  .tuple(
    fc.constantFrom(
      "/var/secret/path/to/file.js",
      "C:\\\\Users\\\\admin\\\\app\\\\db.js",
      "at Object.<anonymous> (internal/module.js:12:34)",
      "MongoServerError: E11000 duplicate key",
      "ECONNREFUSED 127.0.0.1:27017",
    ),
    fc.hexaString({ minLength: 8, maxLength: 16 }),
  )
  .map(([base, salt]) => `${base}#${salt}`);

describe("Property 9: generic and production errors never leak internals", () => {
  it("non-ApiError in production -> generic 500, no internals leaked", () => {
    fc.assert(
      fc.property(sentinelArb, (sentinel) => {
        process.env.NODE_ENV = "production";

        const err = new Error(sentinel);
        err.stack = `Error: ${sentinel}\n    at ${sentinel}`;

        const res = makeRes();
        errorHandler(err, makeReq(), res, () => {});

        expect(res.body.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.errors).toEqual([]);
        expect(res.body.message).toBe("Internal Server Error");
        // No stack in production.
        expect(res.body.stack).toBeUndefined();
        // The embedded internal marker survives nowhere in the body.
        expect(JSON.stringify(res.body)).not.toContain(sentinel);
      }),
      { numRuns: 200 },
    );
  });

  it("ApiError with out-of-range status in production -> treated as generic 500", () => {
    fc.assert(
      fc.property(
        // statusCode outside the valid 400-599 band.
        fc.oneof(fc.integer({ min: -100, max: 399 }), fc.integer({ min: 600, max: 1000 })),
        sentinelArb,
        (badStatus, sentinel) => {
          process.env.NODE_ENV = "production";

          const err = new ApiError(badStatus, sentinel, [{ leak: sentinel }]);
          err.stack = `ApiError: ${sentinel}\n    at ${sentinel}`;

          const res = makeRes();
          errorHandler(err, makeReq(), res, () => {});

          expect(res.body.statusCode).toBe(500);
          expect(res.body.message).toBe("Internal Server Error");
          expect(res.body.errors).toEqual([]);
          expect(res.body.stack).toBeUndefined();
          expect(JSON.stringify(res.body)).not.toContain(sentinel);
        },
      ),
      { numRuns: 200 },
    );
  });
});
