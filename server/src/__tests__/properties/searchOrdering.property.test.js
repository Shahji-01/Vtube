// Feature: phase-4-social-discovery, Property 5: Search results are ordered by the selected sort key
//
// Validates: Requirements 2.2, 2.6
//
// `getAllVideos` chooses ONE sort strategy per request and the returned `docs`
// are ordered by the selected sort key:
//   - sortBy === 'date'  -> `$sort { createdAt: <dir> }`; docs non-increasing by createdAt (desc).
//   - sortBy === 'views' -> `$sort { views: <dir> }`;     docs non-increasing by views (desc).
//   - relevance (query present + sortBy === 'relevance') -> `$sort { score: { $meta: 'textScore' } }`.
//     Text score is engine-computed, so we assert the controller SELECTED the relevance sort
//     (the captured `$sort` stage equals the relevance sort) rather than a numeric order.
//
// Strategy (mocked-model, per the existing `ownership.property.test.js` /
// `triggerNotificationEmit.property.test.js` style): `Video` is mocked via
// `vi.mock` so no real DB I/O happens. `Video.aggregate(pipeline)` records the
// pipeline, extracts the `$sort` stage, and EMULATES Mongo by sorting the
// fast-check-generated in-memory dataset by the captured sort keys (skipping
// the engine-only textScore meta-sort). `Video.countDocuments(...)` returns the
// dataset length. `resolveViews` is the real (pure) helper, so the `docs`
// mapping preserves each generated `views` value. The real `getAllVideos` is
// then driven with `req = { query, user: {} }` and a `res` stub capturing
// `data.docs`.

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

// ── Hoisted mock state + a tiny Mongo-$sort emulator ─────────────────────────
const { state, videoModel } = vi.hoisted(() => {
  const state = { dataset: [], lastPipeline: null };

  // Emulate the relevant pipeline stages on an in-memory array: $sort (for
  // plain numeric/date keys), then $skip / $limit. A `$meta`-valued sort key
  // (relevance / textScore) is engine-computed, so order is left untouched.
  function applyPipeline(pipeline, dataset) {
    let docs = [...dataset];

    const sortStage = pipeline.find((s) => s && s.$sort);
    if (sortStage) {
      const sort = sortStage.$sort;
      const keys = Object.keys(sort);
      const isMeta = keys.some(
        (k) => sort[k] && typeof sort[k] === "object" && "$meta" in sort[k],
      );
      if (!isMeta) {
        docs.sort((a, b) => {
          for (const k of keys) {
            const dir = sort[k];
            const av = a[k];
            const bv = b[k];
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            if (cmp !== 0) return cmp * dir;
          }
          return 0;
        });
      }
    }

    const skipStage = pipeline.find((s) => s && s.$skip !== undefined);
    const limitStage = pipeline.find((s) => s && s.$limit !== undefined);
    if (skipStage) docs = docs.slice(skipStage.$skip);
    if (limitStage) docs = docs.slice(0, limitStage.$limit);
    return docs;
  }

  return {
    state,
    videoModel: {
      aggregate: vi.fn(async (pipeline) => {
        state.lastPipeline = pipeline;
        return applyPipeline(pipeline, state.dataset);
      }),
      countDocuments: vi.fn(async () => state.dataset.length),
    },
  };
});

vi.mock("../../models/video.model.js", () => ({
  Video: videoModel,
}));

const { getAllVideos } = await import("../../controllers/video.controller.js");

// ── Helpers ──────────────────────────────────────────────────────────────────

// Extract the captured `$sort` stage object from the last recorded pipeline.
function capturedSort() {
  const stage = (state.lastPipeline || []).find((s) => s && s.$sort);
  return stage ? stage.$sort : null;
}

// Drive the real controller and resolve with the captured `data.docs`. Because
// `asyncHandler` does NOT return the inner promise, we resolve when the `res`
// stub's `json` is actually invoked (or reject if `next` is called with error).
function runGetAllVideos(query) {
  return new Promise((resolve, reject) => {
    state.lastPipeline = null;
    const req = { query, user: {} };
    const res = {
      status() {
        return this;
      },
      json(payload) {
        resolve(payload?.data?.docs ?? []);
        return this;
      },
    };
    const next = (err) => reject(err || new Error("next() called unexpectedly"));
    getAllVideos(req, res, next);
  });
}

function isNonIncreasing(values) {
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) return false;
  }
  return true;
}

// ── Generators ───────────────────────────────────────────────────────────────
const viewsArb = fc.integer({ min: 0, max: 9_999_999_999 });
const createdAtArb = fc.date({
  min: new Date("2000-01-01T00:00:00.000Z"),
  max: new Date("2030-12-31T23:59:59.000Z"),
});

const videoArb = fc.record({
  _id: fc.hexaString({ minLength: 24, maxLength: 24 }),
  title: fc.string({ minLength: 1, maxLength: 20 }),
  createdAt: createdAtArb,
  views: viewsArb,
  duration: fc.integer({ min: 0, max: 5000 }),
  isPublished: fc.constant(true),
});

const datasetArb = fc.array(videoArb, { minLength: 0, maxLength: 25 });
const optionalQueryArb = fc.option(fc.string({ minLength: 1, maxLength: 10 }), {
  nil: undefined,
});

describe("Property 5: search results are ordered by the selected sort key", () => {
  it("sortBy='date' selects the createdAt sort and returns docs non-increasing by createdAt", async () => {
    await fc.assert(
      fc.asyncProperty(datasetArb, optionalQueryArb, async (dataset, query) => {
        state.dataset = dataset;

        const q = { sortBy: "date", sortType: "desc", limit: 1000 };
        if (query !== undefined) q.query = query;

        const docs = await runGetAllVideos(q);

        // The controller SELECTED the createdAt sort, descending.
        expect(capturedSort()).toEqual({ createdAt: -1 });

        // Applying that sort yields non-increasing createdAt order.
        const times = docs.map((d) => new Date(d.createdAt).getTime());
        expect(isNonIncreasing(times)).toBe(true);
        expect(docs.length).toBe(dataset.length);
      }),
      { numRuns: 120 },
    );
  });

  it("sortBy='views' selects the views sort and returns docs non-increasing by views", async () => {
    await fc.assert(
      fc.asyncProperty(datasetArb, optionalQueryArb, async (dataset, query) => {
        state.dataset = dataset;

        const q = { sortBy: "views", sortType: "desc", limit: 1000 };
        if (query !== undefined) q.query = query;

        const docs = await runGetAllVideos(q);

        // The controller SELECTED the views sort, descending.
        expect(capturedSort()).toEqual({ views: -1 });

        // Applying that sort yields non-increasing views order. `resolveViews`
        // is the real pure helper, so each `views` value is preserved.
        const views = docs.map((d) => d.views);
        expect(isNonIncreasing(views)).toBe(true);
        expect(docs.length).toBe(dataset.length);
      }),
      { numRuns: 120 },
    );
  });

  it("relevance (query present + sortBy='relevance') selects the textScore sort", async () => {
    await fc.assert(
      fc.asyncProperty(
        datasetArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        async (dataset, query) => {
          state.dataset = dataset;

          const docs = await runGetAllVideos({
            query,
            sortBy: "relevance",
            limit: 1000,
          });

          // Text score is engine-computed: assert the controller SELECTED the
          // relevance sort (not a numeric order on our dataset).
          expect(capturedSort()).toEqual({ score: { $meta: "textScore" } });
          expect(docs.length).toBe(dataset.length);
        },
      ),
      { numRuns: 120 },
    );
  });
});
