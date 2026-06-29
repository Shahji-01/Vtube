// Feature: phase-4-social-discovery, Property 14: Moderation actions enforce role and apply the correct state transitions
//
// Validates: Requirements 4.5, 4.6, 4.7, 4.8
//
// Two complementary halves prove the moderation surface is both gated and
// correct:
//
//   1. ROLE ENFORCEMENT (real `requireModerator`) — for ANY `req.user` whose
//      role is neither "moderator" nor "admin" (including an absent user →
//      anonymous), the guard fails the request with an ApiError carrying
//      statusCode 403 (whether surfaced via a synchronous throw or `next(err)`),
//      and never calls a clean `next()`. For role "moderator"/"admin" it calls
//      `next()` exactly once with no error.
//
//   2. STATE TRANSITIONS (real controllers, mocked models) — driven over the
//      status/targetType space:
//        - listReports  : `Report.find(filter)` is chainable
//                         (.sort().populate().populate().populate()); for
//                         `req.query.status = S` the captured filter is
//                         `{ status: S }` and every returned report has status S
//                         (seeded from a mixed-status dataset).
//        - resolveReport: hides the target (`Video`/`Comment`.findByIdAndUpdate
//                         called with `{ isHidden: true }`) and flips the report
//                         to "RESOLVED" (report mutated + saved).
//        - dismissReport: flips the report to "DISMISSED" and leaves the target
//                         untouched (no Video/Comment update).

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { isValidObjectId } from "mongoose";

// ── Hoisted mock state + Mongo-ish filter matcher shared by the model mocks ───
const { state, reportModel, videoModel, commentModel } = vi.hoisted(() => {
  const state = {
    // listReports
    reportDataset: [],
    capturedFindFilter: undefined,
    // resolve/dismiss
    reportToReturn: null,
  };

  const eq = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    return String(a) === String(b);
  };

  const matchesFilter = (filter, doc) => {
    for (const [key, cond] of Object.entries(filter || {})) {
      if (!eq(doc[key], cond)) return false;
    }
    return true;
  };

  return {
    state,
    reportModel: {
      // listReports: find(filter).sort().populate().populate().populate()
      find: vi.fn((filter) => {
        state.capturedFindFilter = filter;
        const matched = state.reportDataset.filter((d) => matchesFilter(filter, d));
        const chain = {
          sort: () => chain,
          populate: () => chain,
          then: (resolve) => resolve(matched),
        };
        return chain;
      }),
      // resolve/dismiss: findById(reportId) → the single report under test
      findById: vi.fn(async () => state.reportToReturn),
    },
    videoModel: {
      findByIdAndUpdate: vi.fn(async () => ({})),
    },
    commentModel: {
      findByIdAndUpdate: vi.fn(async () => ({})),
    },
  };
});

vi.mock("../../models/report.model.js", () => ({ Report: reportModel }));
vi.mock("../../models/video.model.js", () => ({ Video: videoModel }));
vi.mock("../../models/comment.model.js", () => ({ Comment: commentModel }));

const { requireModerator } = await import(
  "../../middlewares/moderation.middleware.js"
);
const { listReports, resolveReport, dismissReport } = await import(
  "../../controllers/report.controller.js"
);
const { ApiError } = await import("../../utils/ApiError.js");

// ── Helpers ──────────────────────────────────────────────────────────────────
const objectIdArb = fc
  .hexaString({ minLength: 24, maxLength: 24 })
  .filter((s) => isValidObjectId(s));

const STATUSES = ["OPEN", "RESOLVED", "DISMISSED"];
const statusArb = fc.constantFrom(...STATUSES);
const targetTypeArb = fc.constantFrom("Video", "Comment");

/** Chainable res spy capturing the ApiResponse handed to res.json. */
function makeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

/** Flush queued micro/macro tasks so asyncHandler's promise chain settles. */
async function flush() {
  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Drive an asyncHandler-wrapped controller to completion. */
async function run(handler, req) {
  const res = makeRes();
  const next = vi.fn();
  handler(req, res, next);
  await flush();
  return { res, next };
}

/**
 * Invoke the real `requireModerator` and normalize the outcome. The guard may
 * surface a failure either by throwing synchronously or by calling `next(err)`;
 * either way we capture the resulting error and whether a clean `next()` ran.
 */
function runGuard(req) {
  const res = makeRes();
  const next = vi.fn();
  let thrown = null;
  try {
    requireModerator(req, res, next);
  } catch (e) {
    thrown = e;
  }
  const calls = next.mock.calls;
  const nextErr = calls.length > 0 ? calls[0][0] : undefined;
  const error = thrown || nextErr || null;
  const calledCleanNext = calls.length === 1 && (nextErr === undefined || nextErr == null);
  return { error, calledCleanNext, nextCallCount: calls.length };
}

beforeEach(() => {
  state.reportDataset = [];
  state.capturedFindFilter = undefined;
  state.reportToReturn = null;
  reportModel.find.mockClear();
  reportModel.findById.mockClear();
  videoModel.findByIdAndUpdate.mockClear();
  commentModel.findByIdAndUpdate.mockClear();
});

describe("Property 14: moderation actions enforce role and apply the correct state transitions", () => {
  // ── Part 1: role enforcement (real requireModerator) ────────────────────────
  it("requireModerator: rejects non-moderator/anonymous with 403 and admits moderator/admin", async () => {
    // user shapes: ordinary user, moderator, admin, arbitrary role, and absent.
    const reqArb = fc.oneof(
      fc.constant({ user: { role: "user" } }),
      fc.constant({ user: { role: "moderator" } }),
      fc.constant({ user: { role: "admin" } }),
      fc.record({ user: fc.record({ role: fc.string() }) }),
      fc.constant({ user: undefined }),
      fc.constant({}), // no user key at all → anonymous
    );

    await fc.assert(
      fc.property(reqArb, (req) => {
        const role = req.user?.role;
        const authorized =
          !!req.user && (role === "moderator" || role === "admin");

        const { error, calledCleanNext, nextCallCount } = runGuard(req);

        if (authorized) {
          // Passes through exactly once, no error.
          expect(error).toBeNull();
          expect(calledCleanNext).toBe(true);
          expect(nextCallCount).toBe(1);
        } else {
          // Blocked with a 403 ApiError; never a clean pass-through.
          expect(error).toBeInstanceOf(ApiError);
          expect(error.statusCode).toBe(403);
          expect(calledCleanNext).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  // ── Part 2a: listReports filters by status ──────────────────────────────────
  it("listReports: find filter is { status: S } and every returned report has status S", async () => {
    await fc.assert(
      fc.asyncProperty(
        // A mixed-status dataset…
        fc.array(
          fc.record({ id: objectIdArb, status: statusArb }),
          { minLength: 0, maxLength: 10 },
        ),
        // …and the status we filter on.
        statusArb,
        async (reports, S) => {
          state.reportDataset = reports.map((r) => ({
            _id: r.id,
            status: r.status,
            targetType: "Video",
          }));

          const { res, next } = await run(listReports, { query: { status: S } });
          expect(next).not.toHaveBeenCalled();

          // Controller passed the exact status filter to the model.
          expect(state.capturedFindFilter).toEqual({ status: S });

          // Every surfaced report carries the requested status, and the set is
          // exactly the dataset's reports of that status.
          const docs = res.body.data;
          for (const d of docs) {
            expect(d.status).toBe(S);
          }
          const expected = state.reportDataset.filter((d) => d.status === S);
          expect(new Set(docs.map((d) => String(d._id)))).toEqual(
            new Set(expected.map((d) => String(d._id))),
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  // ── Part 2b: resolveReport hides target + marks RESOLVED ─────────────────────
  it("resolveReport: hides the target with { isHidden: true } and sets report.status RESOLVED", async () => {
    await fc.assert(
      fc.asyncProperty(
        targetTypeArb,
        objectIdArb, // report id
        objectIdArb, // target id
        async (targetType, reportId, targetId) => {
          // Reset per-iteration (beforeEach only runs once per `it`, but the
          // property body runs many times — spies must not accumulate calls).
          videoModel.findByIdAndUpdate.mockClear();
          commentModel.findByIdAndUpdate.mockClear();

          const save = vi.fn(async function save() {
            return this;
          });
          const report = {
            _id: reportId,
            targetType,
            video: targetType === "Video" ? targetId : undefined,
            comment: targetType === "Comment" ? targetId : undefined,
            status: "OPEN",
            save,
          };
          state.reportToReturn = report;

          const { res, next } = await run(resolveReport, {
            params: { reportId },
          });
          expect(next).not.toHaveBeenCalled();

          // The correct target model was hidden with the right payload, and the
          // OTHER model was not touched.
          if (targetType === "Video") {
            expect(videoModel.findByIdAndUpdate).toHaveBeenCalledWith(
              targetId,
              { isHidden: true },
            );
            expect(commentModel.findByIdAndUpdate).not.toHaveBeenCalled();
          } else {
            expect(commentModel.findByIdAndUpdate).toHaveBeenCalledWith(
              targetId,
              { isHidden: true },
            );
            expect(videoModel.findByIdAndUpdate).not.toHaveBeenCalled();
          }

          // The report was mutated to RESOLVED and persisted.
          expect(report.status).toBe("RESOLVED");
          expect(save).toHaveBeenCalledTimes(1);
          expect(res.body.data.status).toBe("RESOLVED");
        },
      ),
      { numRuns: 150 },
    );
  });

  // ── Part 2c: dismissReport marks DISMISSED + leaves target untouched ─────────
  it("dismissReport: sets report.status DISMISSED and never touches the target", async () => {
    await fc.assert(
      fc.asyncProperty(
        targetTypeArb,
        objectIdArb, // report id
        objectIdArb, // target id
        async (targetType, reportId, targetId) => {
          // Reset per-iteration so the "target untouched" assertion checks only
          // this iteration's calls.
          videoModel.findByIdAndUpdate.mockClear();
          commentModel.findByIdAndUpdate.mockClear();

          const save = vi.fn(async function save() {
            return this;
          });
          const report = {
            _id: reportId,
            targetType,
            video: targetType === "Video" ? targetId : undefined,
            comment: targetType === "Comment" ? targetId : undefined,
            status: "OPEN",
            save,
          };
          state.reportToReturn = report;

          const { res, next } = await run(dismissReport, {
            params: { reportId },
          });
          expect(next).not.toHaveBeenCalled();

          // No target was hidden — dismissal leaves content untouched.
          expect(videoModel.findByIdAndUpdate).not.toHaveBeenCalled();
          expect(commentModel.findByIdAndUpdate).not.toHaveBeenCalled();

          // The report was mutated to DISMISSED and persisted.
          expect(report.status).toBe("DISMISSED");
          expect(save).toHaveBeenCalledTimes(1);
          expect(res.body.data.status).toBe("DISMISSED");
        },
      ),
      { numRuns: 150 },
    );
  });
});
