// Feature: phase-4-social-discovery, Property 12: Report creation yields one OPEN report and rejects duplicate-active reports
//
// Validates: Requirements 4.1, 4.3
//
// `createReport` (report.controller.js) must, for any authenticated reporter and
// existing target (Video or Comment) with a valid reason:
//   - on the FIRST report, create exactly one Report with status "OPEN" for
//     {reporter, target} and respond 201 (R4.1), and
//   - on a SECOND report for the same {reporter, target} while the first is OPEN,
//     reject with a 409 ApiError (via the duplicate-active `findOne` pre-check,
//     R4.3) and create NO additional report — the OPEN count for that pair stays 1.
//
// Strategy (mocked-model recorder, per the existing
// `commentOrdering.property.test.js` / `ownership.property.test.js` style): the
// `Report`, `Video`, and `Comment` models are mocked via `vi.mock` so there is
// no real DB I/O. An in-memory `reports` array backs the mock:
//   - `Video.findById` / `Comment.findById` always resolve a truthy target so the
//     existence check (R4.1) passes and the duplicate logic is exercised.
//   - `Report.findOne(filter)` returns the first stored report matching
//     {reporter, status:"OPEN", video|comment} — the controller's duplicate-active
//     pre-check.
//   - `Report.create(doc)` pushes the doc (assigning an `_id`, defaulting status to
//     "OPEN") and returns it.
// Driving the REAL `createReport` twice for the same pair proves the invariant for
// ANY reporter/target/reason: first call creates exactly one OPEN report (201),
// second call yields 409 and never grows the OPEN count past 1.

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { isValidObjectId } from "mongoose";

// REPORT_REASONS enum (mirrors report.model.js; the model is mocked here).
const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "HATE",
  "SEXUAL",
  "VIOLENCE",
  "MISINFORMATION",
  "OTHER",
];

// ── Hoisted mock state + model recorders ─────────────────────────────────────
const { state, reportModel, videoModel, commentModel } = vi.hoisted(() => {
  const state = { reports: [], idCounter: 0 };

  return {
    state,
    reportModel: {
      // Duplicate-active pre-check: first stored report matching the filter's
      // reporter + status + target key (video|comment).
      findOne: vi.fn(async (filter) => {
        const targetKey = "video" in filter ? "video" : "comment";
        return (
          state.reports.find(
            (r) =>
              String(r.reporter) === String(filter.reporter) &&
              r.status === filter.status &&
              String(r[targetKey]) === String(filter[targetKey]),
          ) ?? null
        );
      }),
      // Persist: push the doc, assigning an _id and defaulting status to OPEN.
      create: vi.fn(async (doc) => {
        const stored = { ...doc, _id: `report_${++state.idCounter}` };
        if (stored.status === undefined) stored.status = "OPEN";
        state.reports.push(stored);
        return stored;
      }),
    },
    // Targets always exist so the existence check passes.
    videoModel: { findById: vi.fn(async () => ({ _id: "video-exists" })) },
    commentModel: { findById: vi.fn(async () => ({ _id: "comment-exists" })) },
  };
});

vi.mock("../../models/report.model.js", () => ({ Report: reportModel }));
vi.mock("../../models/video.model.js", () => ({ Video: videoModel }));
vi.mock("../../models/comment.model.js", () => ({ Comment: commentModel }));

const { createReport } = await import("../../controllers/report.controller.js");

// ── Generators ───────────────────────────────────────────────────────────────
const objectIdArb = fc
  .hexaString({ minLength: 24, maxLength: 24 })
  .filter((s) => isValidObjectId(s));

const targetTypeArb = fc.constantFrom("Video", "Comment");
const reasonArb = fc.constantFrom(...REPORT_REASONS);

// ── Helper: drive the REAL createReport with a captured res + next spy ───────
async function runCreateReport({ reporterId, targetType, targetId, reason }) {
  const req = {
    body: { targetType, targetId, reason },
    user: { _id: reporterId },
  };

  // `asyncHandler` does not return its inner promise, so we resolve a settle
  // promise from whichever terminal fires: `res.json` (success) or `next`
  // (error). This flushes the controller's full multi-await chain.
  let settle;
  const settled = new Promise((resolve) => {
    settle = resolve;
  });

  let statusCode;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      settle();
      return this;
    },
  };

  const next = vi.fn(() => settle());

  createReport(req, res, next);
  await settled;

  return { statusCode, next };
}

// Count OPEN reports stored for a given reporter/target pair.
function openCountFor(reporterId, targetType, targetId) {
  const key = targetType === "Video" ? "video" : "comment";
  return state.reports.filter(
    (r) =>
      String(r.reporter) === String(reporterId) &&
      r.status === "OPEN" &&
      String(r[key]) === String(targetId),
  ).length;
}

describe("Property 12: report creation yields one OPEN report and rejects duplicate-active reports", () => {
  it("creates exactly one OPEN report on first report (201) and rejects a second with 409 without adding a report", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        targetTypeArb,
        objectIdArb,
        reasonArb,
        async (reporterId, targetType, targetId, reason) => {
          // Reset in-memory state + recorders per iteration.
          state.reports = [];
          state.idCounter = 0;
          reportModel.findOne.mockClear();
          reportModel.create.mockClear();

          // ── First report → 201, exactly one OPEN report for the pair ──
          const first = await runCreateReport({ reporterId, targetType, targetId, reason });

          expect(first.next).not.toHaveBeenCalled();
          expect(first.statusCode).toBe(201);
          expect(reportModel.create).toHaveBeenCalledTimes(1);
          expect(openCountFor(reporterId, targetType, targetId)).toBe(1);

          // The single stored report is OPEN for {reporter, target}.
          expect(state.reports.length).toBe(1);
          const stored = state.reports[0];
          expect(stored.status).toBe("OPEN");
          expect(String(stored.reporter)).toBe(String(reporterId));
          const key = targetType === "Video" ? "video" : "comment";
          expect(String(stored[key])).toBe(String(targetId));

          // ── Second report for the same pair (first still OPEN) → 409 ──
          const second = await runCreateReport({ reporterId, targetType, targetId, reason });

          expect(second.next).toHaveBeenCalledTimes(1);
          const err = second.next.mock.calls[0][0];
          expect(err).toBeInstanceOf(Error);
          expect(err.statusCode).toBe(409);

          // No additional report created; OPEN count for the pair stays 1.
          expect(reportModel.create).toHaveBeenCalledTimes(1);
          expect(state.reports.length).toBe(1);
          expect(openCountFor(reporterId, targetType, targetId)).toBe(1);
        },
      ),
      { numRuns: 150 },
    );
  });
});
