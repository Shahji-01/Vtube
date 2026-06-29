// Feature: phase-4-social-discovery, Property 9: Comment ordering places pinned comments first, then the selected secondary order
//
// Validates: Requirements 3.6, 3.7, 3.8
//
// `getVideoComments` builds a `$sort` stage that the design requires to be
// pinned-first (R3.6) followed by the requested secondary order: descending
// likes (then recency) for `sort=top` (R3.7), and descending recency for
// `sort=newest` or an absent/unknown value (R3.8).
//
// Strategy (mocked-model recorder, per the existing
// `ownership.property.test.js` / `triggerNotificationEmit.property.test.js`
// style): the `Comment` model is mocked via `vi.mock` so no real DB I/O occurs.
// The mocked `aggregate(pipeline)` does two things:
//   1. records the pipeline so the test can extract the controller-built
//      `$sort` stage and assert its keys/directions directly, and
//   2. emulates MongoDB's multi-key sort by applying that very `$sort` stage to
//      a fast-check-generated in-memory dataset and returning the sorted copy.
// Driving the REAL `getVideoComments` with that mock lets us prove, for ANY
// dataset and ANY `sort` value, that the ordering the controller's `$sort`
// actually produces is pinned-first then the correct secondary key — if the
// controller dropped `pinned` or chose the wrong secondary, the emulated sort
// would violate the invariant and the property would fail.

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { isValidObjectId } from "mongoose";

// ── Hoisted mock state + Comment model recorder ──────────────────────────────
const { state, commentModel } = vi.hoisted(() => {
  const state = { dataset: [], lastPipeline: null };

  // Emulate Mongo's multi-key sort: for each key in the $sort object (in
  // declaration order) compare values, applying the per-key direction
  // (-1 = descending, 1 = ascending). Booleans compare false < true, so
  // `pinned: -1` correctly floats pinned (true) docs to the front.
  const applySort = (docs, sortObj) => {
    const keys = Object.entries(sortObj);
    return [...docs].sort((a, b) => {
      for (const [key, dir] of keys) {
        const av = a[key];
        const bv = b[key];
        let cmp = 0;
        if (av < bv) cmp = -1;
        else if (av > bv) cmp = 1;
        if (cmp !== 0) return dir === -1 ? -cmp : cmp;
      }
      return 0;
    });
  };

  return {
    state,
    commentModel: {
      aggregate: vi.fn(async (pipeline) => {
        state.lastPipeline = pipeline;
        const sortStage = pipeline.find((s) => s && s.$sort)?.$sort ?? {};
        return applySort(state.dataset, sortStage);
      }),
    },
  };
});

vi.mock("../../models/comment.model.js", () => ({
  Comment: commentModel,
}));

const { getVideoComments } = await import("../../controllers/comment.controller.js");

// ── Generators ───────────────────────────────────────────────────────────────
const objectIdArb = fc
  .hexaString({ minLength: 24, maxLength: 24 })
  .filter((s) => isValidObjectId(s));

// A single top-level comment with the fields that drive ordering.
const commentArb = fc.record({
  pinned: fc.boolean(),
  likesCount: fc.integer({ min: 0, max: 1000 }),
  createdAt: fc.integer({ min: 0, max: 10_000_000 }),
});

const datasetArb = fc.array(commentArb, { maxLength: 30 });

// `sort=top`, `sort=newest`, or absent (undefined → controller default newest).
const sortArb = fc.constantFrom("top", "newest", undefined);

// ── Helpers ──────────────────────────────────────────────────────────────────
// Run the real controller with a minimal req/res, returning the response data
// (the ordered comment array the controller emitted).
async function runController(videoId, sort) {
  const query = { page: 1, limit: 1000 };
  if (sort !== undefined) query.sort = sort;

  const req = { params: { video_Id: videoId }, query, user: {} };

  let captured;
  const res = {
    status() {
      return this;
    },
    json(payload) {
      captured = payload;
      return this;
    },
  };

  await getVideoComments(req, res, (err) => {
    if (err) throw err;
  });

  return captured?.data;
}

describe("Property 9: comment ordering is pinned-first then the selected secondary order", () => {
  it("returns all pinned ahead of non-pinned, with the correct secondary ordering, and builds the matching $sort stage", async () => {
    await fc.assert(
      fc.asyncProperty(objectIdArb, datasetArb, sortArb, async (videoId, dataset, sort) => {
        state.dataset = dataset;
        state.lastPipeline = null;
        commentModel.aggregate.mockClear();

        const ordered = await runController(videoId, sort);

        expect(Array.isArray(ordered)).toBe(true);
        expect(ordered.length).toBe(dataset.length);

        // ── Assert the controller-built $sort stage ──────────────────────────
        const sortStage = state.lastPipeline.find((s) => s && s.$sort)?.$sort;
        expect(sortStage).toBeDefined();

        const sortKeys = Object.keys(sortStage);
        // Pinned-first is always the primary key (R3.6).
        expect(sortKeys[0]).toBe("pinned");
        expect(sortStage.pinned).toBe(-1);

        if (sort === "top") {
          // Descending likes, recency tiebreak (R3.7).
          expect(sortKeys).toEqual(["pinned", "likesCount", "createdAt"]);
          expect(sortStage.likesCount).toBe(-1);
          expect(sortStage.createdAt).toBe(-1);
        } else {
          // `newest` or absent → descending recency (R3.8).
          expect(sortKeys).toEqual(["pinned", "createdAt"]);
          expect(sortStage.createdAt).toBe(-1);
        }

        // ── Invariant 1: every pinned comment precedes every non-pinned one ──
        let seenNonPinned = false;
        for (const c of ordered) {
          if (!c.pinned) {
            seenNonPinned = true;
          } else {
            // A pinned comment must never appear after a non-pinned one.
            expect(seenNonPinned).toBe(false);
          }
        }

        // ── Invariant 2: secondary ordering within the non-pinned segment ────
        const nonPinned = ordered.filter((c) => !c.pinned);
        for (let i = 1; i < nonPinned.length; i++) {
          const prev = nonPinned[i - 1];
          const cur = nonPinned[i];
          if (sort === "top") {
            // Non-increasing likes; on ties, non-increasing createdAt.
            expect(prev.likesCount).toBeGreaterThanOrEqual(cur.likesCount);
            if (prev.likesCount === cur.likesCount) {
              expect(prev.createdAt).toBeGreaterThanOrEqual(cur.createdAt);
            }
          } else {
            // Non-increasing createdAt (newest first).
            expect(prev.createdAt).toBeGreaterThanOrEqual(cur.createdAt);
          }
        }

        // ── Invariant 3: pinned segment is also ordered by the secondary key ─
        const pinned = ordered.filter((c) => c.pinned);
        for (let i = 1; i < pinned.length; i++) {
          const prev = pinned[i - 1];
          const cur = pinned[i];
          if (sort === "top") {
            expect(prev.likesCount).toBeGreaterThanOrEqual(cur.likesCount);
            if (prev.likesCount === cur.likesCount) {
              expect(prev.createdAt).toBeGreaterThanOrEqual(cur.createdAt);
            }
          } else {
            expect(prev.createdAt).toBeGreaterThanOrEqual(cur.createdAt);
          }
        }
      }),
      { numRuns: 150 },
    );
  });
});
