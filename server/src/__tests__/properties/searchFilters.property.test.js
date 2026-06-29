// Feature: phase-4-social-discovery, Property 6: Date-range and duration-bucket filters restrict results to the requested band
//
// Validates: Requirements 2.4, 2.5
//
// The band restriction is enforced by the DB `$match` stage that `getAllVideos`
// builds: every video the database returns must satisfy that `$match`, so the
// returned set is *exactly* the requested band. We therefore verify the
// restriction STRUCTURALLY — by capturing the `matchFilter` the controller
// builds and asserting its `createdAt` / `duration` constraints equal the
// requested band — which is a stronger guarantee than checking a finite sample
// of returned docs (the DB applies the same `$match` to the whole collection).
//
// Strategy (mocked-model, per the existing `searchOrdering.property.test.js`
// style): `Video` is mocked via `vi.mock` so there is no real DB I/O.
// `Video.aggregate(pipeline)` records the pipeline (we extract its `$match`
// stage); the SAME object is passed to `Video.countDocuments(matchFilter)`, so
// capturing either yields the controller's match. The real `getAllVideos` is
// driven with `req = { query, user: {} }` and a `res` stub, then we assert on
// the captured `$match`.

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

// ── Hoisted mock state ───────────────────────────────────────────────────────
const { state, videoModel } = vi.hoisted(() => {
  const state = { lastPipeline: null, lastCountFilter: null };
  return {
    state,
    videoModel: {
      aggregate: vi.fn(async (pipeline) => {
        state.lastPipeline = pipeline;
        return [];
      }),
      countDocuments: vi.fn(async (filter) => {
        state.lastCountFilter = filter;
        return 0;
      }),
    },
  };
});

vi.mock("../../models/video.model.js", () => ({
  Video: videoModel,
}));

const { getAllVideos } = await import("../../controllers/video.controller.js");

// ── Helpers ──────────────────────────────────────────────────────────────────

// Extract the captured `$match` stage object from the last recorded pipeline.
function capturedMatch() {
  const stage = (state.lastPipeline || []).find((s) => s && s.$match);
  return stage ? stage.$match : null;
}

// Drive the real controller and resolve once the `res` stub's `json` fires.
// `asyncHandler` does not return the inner promise, so we resolve on `json`.
function runGetAllVideos(query) {
  return new Promise((resolve, reject) => {
    state.lastPipeline = null;
    state.lastCountFilter = null;
    const req = { query, user: {} };
    const res = {
      status() {
        return this;
      },
      json(payload) {
        resolve(payload);
        return this;
      },
    };
    const next = (err) => reject(err || new Error("next() called unexpectedly"));
    getAllVideos(req, res, next);
  });
}

// ── Generators ───────────────────────────────────────────────────────────────
const dateArb = fc.date({
  min: new Date("2000-01-01T00:00:00.000Z"),
  max: new Date("2030-12-31T23:59:59.000Z"),
});

// An optional query so we exercise both the relevance and legacy branches.
const optionalQueryArb = fc.option(fc.string({ minLength: 1, maxLength: 10 }), {
  nil: undefined,
});

const bucketArb = fc.constantFrom("short", "medium", "long");

describe("Property 6: date-range and duration-bucket filters restrict results to the requested band", () => {
  it("always includes the public-visibility constraints in the $match", async () => {
    await fc.assert(
      fc.asyncProperty(optionalQueryArb, async (query) => {
        const q = { limit: 1000 };
        if (query !== undefined) q.query = query;

        await runGetAllVideos(q);

        const match = capturedMatch();
        expect(match.isPublished).toBe(true);
        expect(match.isHidden).toEqual({ $ne: true });

        // The aggregate `$match` and the countDocuments filter are the same
        // object — the band restriction applies identically to both.
        expect(state.lastCountFilter).toBe(match);
      }),
      { numRuns: 120 },
    );
  });

  it("maps uploadDateFrom/uploadDateTo onto createdAt $gte/$lte bounds (only present bounds set)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(dateArb, { nil: undefined }),
        fc.option(dateArb, { nil: undefined }),
        optionalQueryArb,
        async (from, to, query) => {
          const q = { limit: 1000 };
          if (from !== undefined) q.uploadDateFrom = from.toISOString();
          if (to !== undefined) q.uploadDateTo = to.toISOString();
          if (query !== undefined) q.query = query;

          await runGetAllVideos(q);

          const match = capturedMatch();

          if (from === undefined && to === undefined) {
            // No range requested → no createdAt band imposed.
            expect(match.createdAt).toBeUndefined();
            return;
          }

          expect(match.createdAt).toBeDefined();

          if (from !== undefined) {
            expect(match.createdAt.$gte).toBeInstanceOf(Date);
            expect(match.createdAt.$gte.getTime()).toBe(from.getTime());
          } else {
            expect("$gte" in match.createdAt).toBe(false);
          }

          if (to !== undefined) {
            expect(match.createdAt.$lte).toBeInstanceOf(Date);
            expect(match.createdAt.$lte.getTime()).toBe(to.getTime());
          } else {
            expect("$lte" in match.createdAt).toBe(false);
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it("maps durationBucket onto the correct duration band", async () => {
    const expectedBand = {
      short: { $lt: 240 },
      medium: { $gte: 240, $lte: 1200 },
      long: { $gt: 1200 },
    };

    await fc.assert(
      fc.asyncProperty(bucketArb, optionalQueryArb, async (bucket, query) => {
        const q = { durationBucket: bucket, limit: 1000 };
        if (query !== undefined) q.query = query;

        await runGetAllVideos(q);

        const match = capturedMatch();
        expect(match.duration).toEqual(expectedBand[bucket]);

        // Public-visibility constraints remain present alongside the band.
        expect(match.isPublished).toBe(true);
        expect(match.isHidden).toEqual({ $ne: true });
      }),
      { numRuns: 120 },
    );
  });

  it("combines an upload-date range and a duration bucket into one restrictive $match", async () => {
    await fc.assert(
      fc.asyncProperty(
        dateArb,
        dateArb,
        bucketArb,
        async (d1, d2, bucket) => {
          // Order the two dates so from <= to (a valid range).
          const from = d1.getTime() <= d2.getTime() ? d1 : d2;
          const to = d1.getTime() <= d2.getTime() ? d2 : d1;

          await runGetAllVideos({
            uploadDateFrom: from.toISOString(),
            uploadDateTo: to.toISOString(),
            durationBucket: bucket,
            limit: 1000,
          });

          const match = capturedMatch();

          expect(match.createdAt.$gte.getTime()).toBe(from.getTime());
          expect(match.createdAt.$lte.getTime()).toBe(to.getTime());

          const expectedBand = {
            short: { $lt: 240 },
            medium: { $gte: 240, $lte: 1200 },
            long: { $gt: 1200 },
          };
          expect(match.duration).toEqual(expectedBand[bucket]);
        },
      ),
      { numRuns: 120 },
    );
  });
});
