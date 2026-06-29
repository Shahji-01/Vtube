/**
 * Feature: phase-2-quality-hardening, Property 2: Valid input preserves request
 * shape and passes control.
 *
 * Validates: Requirements 1.1, 1.2
 * (Phase-1 design Property 2 — Validates Requirements 1.5)
 *
 * For any schema and any request that satisfies every field rule,
 * `validate(schema)` calls the next handler exactly once with no error and
 * leaves `req.body`, `req.params`, and `req.query` deep-equal to their
 * pre-validation values.
 *
 * The middleware is exercised in isolation with a mocked req/res/next. No DB or
 * network I/O.
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

import { validate } from "../../middlewares/validate.middleware.js";
import {
  required,
  nonBlank,
  maxLen,
  isObjectId,
  optional,
} from "../../validators/validators.js";

const RUNS = { numRuns: 200 };

const SCHEMA = {
  params: {
    id: isObjectId,
    video_Id: isObjectId,
  },
  query: {
    page: optional(maxLen(10)),
  },
  body: {
    title: [required, nonBlank, maxLen(200)],
    description: [required, nonBlank, maxLen(5000)],
    content: [required, nonBlank, maxLen(5000)],
  },
};

// A non-blank string whose TRIMMED length is within [1, max] (so it satisfies
// required + nonBlank + maxLen(max)).
const validString = (max) =>
  fc
    .string({ minLength: 1, maxLength: Math.min(max, 60) })
    .map((s) => s.trim())
    .filter((s) => s.length >= 1 && s.length <= max);

// A valid 24-character hex ObjectId string.
const validObjectId = () => fc.hexaString({ minLength: 24, maxLength: 24 });

// A value the `optional(maxLen(10))` rule accepts: absent, empty, or a string
// trimmed to <= 10 chars.
const validOptionalPage = () =>
  fc.oneof(
    fc.constant(undefined),
    fc.constant(""),
    fc
      .string({ minLength: 1, maxLength: 10 })
      .map((s) => s.trim())
      .filter((s) => s.length <= 10),
  );

// Build a request that satisfies every rule, optionally carrying extra fields
// not covered by the schema (which must also be preserved untouched).
function validReqArb() {
  return fc.record({
    params: fc.record({
      id: validObjectId(),
      video_Id: validObjectId(),
      extraParam: fc.string(),
    }),
    query: fc.record({
      page: validOptionalPage(),
      extraQuery: fc.string(),
    }),
    body: fc.record({
      title: validString(200),
      description: validString(5000),
      content: validString(5000),
      extraBody: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
    }),
  });
}

describe("Property 2: valid input preserves request shape and passes control", () => {
  it("calls next() once with no argument and leaves body/params/query deep-equal", () => {
    fc.assert(
      fc.property(validReqArb(), (req) => {
        const before = structuredClone({
          params: req.params,
          query: req.query,
          body: req.body,
        });

        const next = vi.fn();
        validate(SCHEMA)(req, {}, next);

        // Control passes exactly once, with no error argument.
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0].length === 0 || next.mock.calls[0][0] === undefined).toBe(
          true,
        );

        // The documented request shape is untouched.
        expect(req.params).toEqual(before.params);
        expect(req.query).toEqual(before.query);
        expect(req.body).toEqual(before.body);
      }),
      RUNS,
    );
  });
});
