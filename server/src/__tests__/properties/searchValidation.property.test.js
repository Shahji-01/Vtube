// Feature: phase-4-social-discovery, Property 7: Invalid search filters are rejected with 400 before any database access
//
// Validates: Requirements 2.7
//
// For ANY invalid Search_Filters input on `GET /api/v1/videos`, the request is
// rejected with HTTP 400 in the canonical Error_Response shape (an `ApiError`
// with `statusCode === 400` naming the offending field) BEFORE any
// controller/DB access.
//
// This exercises the REAL middleware chain that the videos route wires:
//   1. `validate(getAllVideosQuery)` — per-field rules (date parseability,
//      durationBucket enum, sortBy enum, ...).
//   2. `enforceDateRange` — the cross-field `uploadDateFrom <= uploadDateTo`
//      check the per-field middleware cannot express.
//
// A mock Mongoose model (call-recording spy) stands in for the controller's DB
// surface so we can assert NO database method is ever called when validation
// rejects — the rejection happens before the controller runs.

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

import { validate } from "../../middlewares/validate.middleware.js";
import {
  getAllVideosQuery,
  enforceDateRange,
} from "../../validators/video.schema.js";
import { ApiError } from "../../utils/ApiError.js";

const RUNS = { numRuns: 150 };

// A mock model whose every method is a spy. If the real controller were
// reached it would call one of these (e.g. find / aggregate / countDocuments);
// asserting they are never called proves "no DB access before validation".
const Video = {
  find: vi.fn(),
  findOne: vi.fn(),
  findById: vi.fn(),
  aggregate: vi.fn(),
  countDocuments: vi.fn(),
  aggregatePaginate: vi.fn(),
};

function modelTouched() {
  return Object.values(Video).some((spy) => spy.mock.calls.length > 0);
}

// Build a fake Express request with the generated query. params/body are empty
// objects so the (params/body-less) schema parts are simply skipped.
function makeReq(query) {
  return { query, params: {}, body: {} };
}

const res = {}; // never used by these middlewares

/**
 * Run the REAL middleware chain exactly as the videos route wires it:
 *   validate(getAllVideosQuery)(req, res, next1)
 *   -> if next1 received no error, enforceDateRange(req, res, next2)
 * Returns the FIRST error encountered (or undefined when both pass) plus the
 * spies so callers can assert next()/error behavior.
 */
function runChain(req) {
  const next1 = vi.fn();
  validate(getAllVideosQuery)(req, res, next1);

  const validateErr = next1.mock.calls[0]?.[0];
  if (validateErr) {
    return { firstError: validateErr, stage: "validate", next1, next2: null };
  }

  // validate passed (called next() with no arg) — run the cross-field guard.
  const next2 = vi.fn();
  enforceDateRange(req, res, next2);
  const rangeErr = next2.mock.calls[0]?.[0];
  return {
    firstError: rangeErr,
    stage: rangeErr ? "enforceDateRange" : "passed",
    next1,
    next2,
  };
}

// Assert a rejection is the canonical 400 Error_Response naming a field, and
// that no DB method was touched.
function expectRejected(req, expectedField) {
  const { firstError } = runChain(req);

  expect(firstError).toBeInstanceOf(ApiError);
  expect(firstError.statusCode).toBe(400);
  expect(firstError.success).toBe(false);
  expect(Array.isArray(firstError.errors)).toBe(true);
  expect(firstError.errors.length).toBeGreaterThan(0);

  // The offending field is named somewhere in the errors.
  const named = firstError.errors.some(
    (e) =>
      e?.field === expectedField ||
      (typeof e?.message === "string" && e.message.includes(expectedField)),
  );
  expect(named).toBe(true);

  // No database access occurred before/while validation rejected.
  expect(modelTouched()).toBe(false);
}

// --- Generators -------------------------------------------------------------

// A string that Date.parse cannot parse (NaN). Excludes anything date-ish.
const unparseableDate = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => Number.isNaN(Date.parse(s)));

// A valid ISO date string within a bounded range so ordering is meaningful.
const validIsoDate = fc
  .date({
    min: new Date("2000-01-01T00:00:00.000Z"),
    max: new Date("2035-12-31T23:59:59.000Z"),
  })
  .map((d) => d.toISOString());

const VALID_BUCKETS = ["short", "medium", "long"];
const VALID_SORT_BY = ["relevance", "date", "views", "createdAt", "duration"];

// A token that is NOT one of the allowed members of `allowed`.
const notOneOf = (allowed) =>
  fc.string({ minLength: 1, maxLength: 16 }).filter((s) => !allowed.includes(s));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Property 7: invalid search filters are rejected with 400 before any DB access", () => {
  it("unparseable uploadDateFrom and/or uploadDateTo -> 400 from validate", () => {
    fc.assert(
      fc.property(
        unparseableDate,
        // which bound(s) carry the bad value: 0=from, 1=to, 2=both
        fc.integer({ min: 0, max: 2 }),
        (bad, which) => {
          const query = {};
          if (which === 0 || which === 2) query.uploadDateFrom = bad;
          if (which === 1 || which === 2) query.uploadDateTo = bad;

          expectRejected(makeReq(query), "uploadDate");
        },
      ),
      RUNS,
    );
  });

  it("uploadDateFrom later than uploadDateTo -> 400 from enforceDateRange naming uploadDateFrom", () => {
    fc.assert(
      fc.property(validIsoDate, validIsoDate, (a, b) => {
        // Ensure strictly from > to (skip equal/inverted via ordering).
        const [earlier, later] = Date.parse(a) <= Date.parse(b) ? [a, b] : [b, a];
        if (Date.parse(earlier) === Date.parse(later)) return; // need from > to

        const query = { uploadDateFrom: later, uploadDateTo: earlier };
        const { firstError, stage } = runChain(makeReq(query));

        // Per-field date checks pass; the cross-field guard is the rejecter.
        expect(stage).toBe("enforceDateRange");
        expect(firstError).toBeInstanceOf(ApiError);
        expect(firstError.statusCode).toBe(400);
        expect(
          firstError.errors.some((e) => e?.field === "uploadDateFrom"),
        ).toBe(true);
        expect(modelTouched()).toBe(false);
      }),
      RUNS,
    );
  });

  it("unrecognized durationBucket -> 400", () => {
    fc.assert(
      fc.property(notOneOf(VALID_BUCKETS), (bucket) => {
        expectRejected(makeReq({ durationBucket: bucket }), "durationBucket");
      }),
      RUNS,
    );
  });

  it("unrecognized sortBy -> 400", () => {
    fc.assert(
      fc.property(notOneOf(VALID_SORT_BY), (sortBy) => {
        expectRejected(makeReq({ sortBy }), "sortBy");
      }),
      RUNS,
    );
  });

  it("fully-valid filters pass BOTH middlewares with next() and no error", () => {
    fc.assert(
      fc.property(
        validIsoDate,
        validIsoDate,
        fc.constantFrom(...VALID_BUCKETS),
        fc.constantFrom(...VALID_SORT_BY),
        (a, b, durationBucket, sortBy) => {
          // Order the bounds so from <= to (a valid range).
          const [from, to] = Date.parse(a) <= Date.parse(b) ? [a, b] : [b, a];
          const query = {
            uploadDateFrom: from,
            uploadDateTo: to,
            durationBucket,
            sortBy,
          };

          const { firstError, stage, next1, next2 } = runChain(makeReq(query));

          expect(stage).toBe("passed");
          expect(firstError).toBeUndefined();
          // Both middlewares called next() with no argument.
          expect(next1).toHaveBeenCalledTimes(1);
          expect(next1.mock.calls[0].length === 0 || next1.mock.calls[0][0] === undefined).toBe(true);
          expect(next2).toHaveBeenCalledTimes(1);
          expect(next2.mock.calls[0].length === 0 || next2.mock.calls[0][0] === undefined).toBe(true);
          // Validation itself never touches the DB.
          expect(modelTouched()).toBe(false);
        },
      ),
      RUNS,
    );
  });
});
