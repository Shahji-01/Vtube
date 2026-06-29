// Feature: phase-4-social-discovery, Property 13: A missing or out-of-enum report reason is rejected with 400 before any write
//
// Validates: Requirements 4.2
//
// For ANY report body that omits `reason` OR supplies a `reason` outside
// REPORT_REASONS (but otherwise carries a valid targetType in {Video, Comment}
// and a valid 24-hex ObjectId targetId), the REAL `validate(createReportSchema)`
// middleware rejects the request with the canonical Error_Response: an
// `ApiError` whose `statusCode === 400` naming the offending `reason` field —
// and the Report model's `create` is NEVER called (no write happens before
// validation passes).
//
// A mock Report model (call-recording spies) stands in for the controller's DB
// surface. Asserting `Report.create` has zero calls proves the rejection
// short-circuits before any persistence. A representative fully-valid body is
// also asserted to pass the middleware (next() with no error).

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

import { validate } from "../../middlewares/validate.middleware.js";
import { createReportSchema } from "../../validators/report.schema.js";
import { REPORT_REASONS } from "../../models/report.model.js";
import { ApiError } from "../../utils/ApiError.js";

const RUNS = { numRuns: 150 };

// A mock Report model whose every method is a spy. If the real controller were
// reached it would call `create` (and friends); asserting they are never
// called proves "no write before validation passes".
const Report = {
  create: vi.fn(),
  findOne: vi.fn(),
  findById: vi.fn(),
  findOneAndUpdate: vi.fn(),
};

function modelTouched() {
  return Object.values(Report).some((spy) => spy.mock.calls.length > 0);
}

// Build a fake Express request. params/query are empty so the (body-only)
// createReportSchema simply skips them.
function makeReq(body) {
  return { body, params: {}, query: {} };
}

const res = {}; // never used by validate()

// Run the REAL validate(createReportSchema) middleware and return the error (if
// any) plus the next spy. The controller (Report.create) is invoked only when
// validation calls next() with no error — exactly the Express flow.
function runValidate(req) {
  const next = vi.fn();
  validate(createReportSchema)(req, res, (err) => {
    next(err);
    if (!err) Report.create(req.body); // simulate the downstream controller write
  });
  return { error: next.mock.calls[0]?.[0], next };
}

// --- Generators -------------------------------------------------------------

// Valid targetType per the schema's oneOf(["Video", "Comment"]).
const validTargetType = fc.constantFrom("Video", "Comment");

// Valid 24-hex ObjectId-shaped string (what isObjectId accepts).
const validObjectId = fc.hexaString({ minLength: 24, maxLength: 24 });

// An arbitrary string that is NOT a member of REPORT_REASONS.
const invalidReasonString = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !REPORT_REASONS.includes(s));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Property 13: missing or out-of-enum report reason is rejected with 400 before any write", () => {
  it("omitted reason -> 400 ApiError naming `reason`, and Report.create never called", () => {
    fc.assert(
      fc.property(validTargetType, validObjectId, (targetType, targetId) => {
        // Body has valid targetType + targetId but no `reason` field at all.
        const { error } = runValidate(makeReq({ targetType, targetId }));

        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(400);
        expect(error.success).toBe(false);
        expect(Array.isArray(error.errors)).toBe(true);
        const named = error.errors.some(
          (e) =>
            e?.field === "reason" ||
            (typeof e?.message === "string" && e.message.includes("reason")),
        );
        expect(named).toBe(true);
        expect(modelTouched()).toBe(false);
      }),
      RUNS,
    );
  });

  it("reason explicitly undefined -> 400 ApiError naming `reason`, no write", () => {
    fc.assert(
      fc.property(validTargetType, validObjectId, (targetType, targetId) => {
        const { error } = runValidate(
          makeReq({ targetType, targetId, reason: undefined }),
        );

        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(400);
        expect(
          error.errors.some(
            (e) =>
              e?.field === "reason" ||
              (typeof e?.message === "string" && e.message.includes("reason")),
          ),
        ).toBe(true);
        expect(modelTouched()).toBe(false);
      }),
      RUNS,
    );
  });

  it("out-of-enum reason string -> 400 ApiError naming `reason`, no write", () => {
    fc.assert(
      fc.property(
        validTargetType,
        validObjectId,
        invalidReasonString,
        (targetType, targetId, reason) => {
          const { error } = runValidate(makeReq({ targetType, targetId, reason }));

          expect(error).toBeInstanceOf(ApiError);
          expect(error.statusCode).toBe(400);
          expect(error.success).toBe(false);
          expect(
            error.errors.some(
              (e) =>
                e?.field === "reason" ||
                (typeof e?.message === "string" && e.message.includes("reason")),
            ),
          ).toBe(true);
          expect(modelTouched()).toBe(false);
        },
      ),
      RUNS,
    );
  });

  it("representative fully-valid body passes validation with next() and no error", () => {
    fc.assert(
      fc.property(
        validTargetType,
        validObjectId,
        fc.constantFrom(...REPORT_REASONS),
        (targetType, targetId, reason) => {
          // Reset per-iteration: fast-check runs this predicate many times in a
          // single `it`, so spies would otherwise accumulate across runs.
          vi.clearAllMocks();

          const { error, next } = runValidate(
            makeReq({ targetType, targetId, reason }),
          );

          // next() called exactly once with no error argument.
          expect(next).toHaveBeenCalledTimes(1);
          expect(error).toBeUndefined();
          // The downstream write executes only on a valid body.
          expect(Report.create).toHaveBeenCalledTimes(1);
        },
      ),
      RUNS,
    );
  });
});
