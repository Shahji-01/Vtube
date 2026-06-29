/**
 * Feature: phase-2-quality-hardening, Property 8
 *
 * Property 8: Error handler always emits the uniform
 *   { statusCode, success:false, message, errors } shape.
 * Validates: Requirements 1.1, 15.7
 *
 * For arbitrary ApiErrors (status 400-599, arbitrary message, arbitrary
 * errors[]) and arbitrary generic errors, the response body is always
 * { statusCode, success:false, message, errors } with a JSON content-type,
 * an integer status, a non-empty message of <=500 chars, and an array `errors`.
 * req/res are mocked (no real HTTP, no real I/O).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { errorHandler } from "../../middlewares/error.middleware.js";
import { ApiError } from "../../utils/ApiError.js";

/** A capturing mock of the Express response object. */
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

const makeReq = () => ({ method: "GET", path: "/api/v1/anything" });

/** Assert the universal Error_Response invariants on a captured body. */
function assertUniformShape(res) {
  const { body } = res;
  // Exactly the four canonical fields are present (stack only in non-prod, not asserted here).
  expect(body).toHaveProperty("statusCode");
  expect(body).toHaveProperty("success");
  expect(body).toHaveProperty("message");
  expect(body).toHaveProperty("errors");

  // statusCode: integer in 400-599, mirrored by res.status().
  expect(Number.isInteger(body.statusCode)).toBe(true);
  expect(body.statusCode).toBeGreaterThanOrEqual(400);
  expect(body.statusCode).toBeLessThanOrEqual(599);
  expect(res.statusCode).toBe(body.statusCode);

  // success is always literally false.
  expect(body.success).toBe(false);

  // message: non-empty string, 1-500 chars.
  expect(typeof body.message).toBe("string");
  expect(body.message.length).toBeGreaterThanOrEqual(1);
  expect(body.message.length).toBeLessThanOrEqual(500);

  // errors is always an array.
  expect(Array.isArray(body.errors)).toBe(true);

  // JSON content-type.
  expect(res.contentType).toBe("application/json");
}

describe("Property 8: error handler always emits the uniform shape", () => {
  it("uniform shape for arbitrary ApiErrors", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 599 }),
        fc.string(),
        fc.array(fc.oneof(fc.string(), fc.record({ field: fc.string(), msg: fc.string() }))),
        (status, message, errors) => {
          const err = new ApiError(status, message, errors);
          const res = makeRes();
          errorHandler(err, makeReq(), res, () => {});

          assertUniformShape(res);

          // When the ApiError message is client-safe (1-500 chars), it is used
          // verbatim along with its status and errors array.
          if (message.length >= 1 && message.length <= 500) {
            expect(res.body.statusCode).toBe(status);
            expect(res.body.message).toBe(message);
            expect(res.body.errors).toEqual(errors);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("uniform shape for arbitrary generic (non-ApiError) errors", () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        const err = new Error(message);
        const res = makeRes();
        errorHandler(err, makeReq(), res, () => {});

        assertUniformShape(res);
        // Generic errors always degrade to a 500 with an empty errors array.
        expect(res.body.statusCode).toBe(500);
        expect(res.body.errors).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});
