/**
 * Feature: phase-2-quality-hardening, Property 1: Field-rule validation rejects
 * every violating input.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 * (Phase-1 design Property 1 — Validates Requirements 1.3, 1.4, 1.8, 1.9, 1.10)
 *
 * For any validation schema and any request whose body/params/query violates at
 * least one field rule, `validate(schema)` forwards a 400 ApiError whose `errors`
 * array contains an entry naming EACH violating field, and the downstream
 * controller is never invoked (no resource is mutated).
 *
 * The middleware is exercised in isolation with a mocked req/res/next. The
 * expected set of violating fields is derived independently from the same pure
 * field rules (the oracle), so the test asserts that `validate` faithfully
 * aggregates per-field failures across all three request parts, emits a single
 * 400 ApiError, names every failing field, and short-circuits the controller.
 *
 * No DB or network I/O: the rules are pure and the controller is a spy.
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

import { validate } from "../../middlewares/validate.middleware.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  required,
  nonBlank,
  maxLen,
  isObjectId,
  optional,
  firstError,
  asArray,
} from "../../validators/validators.js";

const RUNS = { numRuns: 200 };

// A schema covering every rule type across all three request parts.
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

// A rich value generator spanning the cases the rules care about: absent,
// null, blank, whitespace-only, short/long strings, numbers, and 24-hex
// ObjectId-shaped strings.
const fieldValue = () =>
  fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constant(""),
    fc.constant("   "),
    fc.string(),
    fc.string({ minLength: 0, maxLength: 6000 }),
    fc.integer(),
    fc.hexaString({ minLength: 24, maxLength: 24 }),
    fc.lorem({ maxCount: 3 }),
  );

// Build an arbitrary request whose three parts each carry the schema's fields
// with arbitrary values.
function reqArb() {
  return fc.record({
    params: fc.record({ id: fieldValue(), video_Id: fieldValue() }),
    query: fc.record({ page: fieldValue() }),
    body: fc.record({
      title: fieldValue(),
      description: fieldValue(),
      content: fieldValue(),
    }),
  });
}

// Oracle: the set of fields that independently fail their rules, in the same
// part-iteration order the middleware uses.
function expectedFailingFields(req) {
  const failing = [];
  for (const part of ["params", "query", "body"]) {
    const partSchema = SCHEMA[part];
    for (const [field, rules] of Object.entries(partSchema)) {
      if (firstError(asArray(rules), req[part]?.[field])) failing.push(field);
    }
  }
  return failing;
}

describe("Property 1: field-rule validation rejects every violating input", () => {
  it("forwards a 400 ApiError naming each violating field and never invokes the controller", () => {
    fc.assert(
      fc.property(reqArb(), (req) => {
        const expected = expectedFailingFields(req);
        // Only test inputs that violate at least one rule.
        fc.pre(expected.length > 0);

        const next = vi.fn();
        const controller = vi.fn();
        const res = {};

        // Express flow: validate runs, then the controller would run only if
        // next() was called with no error. Model that explicitly.
        validate(SCHEMA)(req, res, (err) => {
          next(err);
          if (!err) controller(req, res, () => {});
        });

        // next called exactly once.
        expect(next).toHaveBeenCalledTimes(1);

        // ...with a 400 ApiError.
        const err = next.mock.calls[0][0];
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(400);
        expect(Array.isArray(err.errors)).toBe(true);

        // Every violating field is named in the errors array; valid fields are
        // never named. The error message is prefixed with the field name.
        const erroredFields = err.errors.map((e) => e.field);
        expect(new Set(erroredFields)).toEqual(new Set(expected));
        for (const e of err.errors) {
          expect(typeof e.message).toBe("string");
          expect(e.message.startsWith(`${e.field} `)).toBe(true);
        }

        // The downstream controller was never reached.
        expect(controller).not.toHaveBeenCalled();
      }),
      RUNS,
    );
  });
});
