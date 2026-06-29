/**
 * Feature: phase-2-quality-hardening, Property 12
 *
 * Property 12: Success responses preserve the ApiResponse contract.
 * Validates: Requirements 1.1, 8.9, 15.1
 *
 * For arbitrary (statusCode, data, message) inputs, `new ApiResponse(...)`
 * preserves every field with its established type: a numeric `statusCode`, the
 * `data` payload as supplied, a string `message`, and a boolean `success` that
 * is exactly `statusCode < 400`.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { ApiResponse } from "../../utils/ApiResponse.js";

describe("Property 12: success responses preserve the ApiResponse contract", () => {
  it("preserves fields with correct types and derives success === statusCode < 400", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 599 }),
        fc.anything(),
        fc.string(),
        (statusCode, data, message) => {
          const res = new ApiResponse(statusCode, data, message);

          // Fields preserved exactly as supplied.
          expect(res.statusCode).toBe(statusCode);
          expect(res.data).toBe(data);
          expect(res.message).toBe(message);

          // success is a boolean equal to statusCode < 400.
          expect(typeof res.success).toBe("boolean");
          expect(res.success).toBe(statusCode < 400);

          // Established types.
          expect(typeof res.statusCode).toBe("number");
          expect(typeof res.message).toBe("string");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("success is true for every 2xx/3xx status and false for every 4xx/5xx status", () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 599 }), fc.anything(), (statusCode, data) => {
        const res = new ApiResponse(statusCode, data);
        if (statusCode < 400) {
          expect(res.success).toBe(true);
        } else {
          expect(res.success).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });
});
