// Feature: phase-4-social-discovery, Property 8: Public discovery surfaces exclude unpublished and hidden content
//
// Validates: Requirements 2.8, 2.9, 4.9
//
// Public discovery surfaces must never leak content that is unpublished or
// moderator-hidden. This property exercises the three public read paths with
// mocked Mongoose models (call-recording, per the existing
// `ownership.property.test.js` / `watchEndpointsResponseShape.property.test.js`
// style) and a "match-filter capture + apply" strategy:
//
//   - getAllVideos      → mock `Video.aggregate` / `Video.countDocuments` to
//                         CAPTURE the `$match` the controller built, then APPLY
//                         it to a fast-check dataset of videos with varied
//                         `isPublished` / `isHidden`.
//   - searchSuggestions → mock `Video.find(filter, proj).sort().limit()` to
//                         CAPTURE the find filter and APPLY it to the dataset.
//   - getVideoComments  → mock `Comment.aggregate` to CAPTURE the `$match` and
//                         APPLY it to a dataset of comments with varied
//                         `isHidden`.
//
// For ANY mix of videos/comments the captured filters must encode
// `isPublished: true` + `isHidden: { $ne: true }` (videos) and
// `isHidden: { $ne: true }` (comments), and the applied results must contain
// ONLY published + non-hidden videos and non-hidden comments (and exactly
// those — neither over-exclude visible nor under-exclude hidden).

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { isValidObjectId, Types } from "mongoose";

// ── Hoisted mock state + a Mongo-ish filter matcher shared by the mocks ───────
const { state, videoModel, commentModel } = vi.hoisted(() => {
  const state = {
    videoDataset: [],
    commentDataset: [],
    capturedVideoAggMatch: null,
    capturedVideoCountFilter: null,
    capturedVideoFindFilter: null,
    capturedCommentAggMatch: null,
  };

  // Strict-or-stringified equality so ObjectId vs hex-string compares true.
  const eq = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    return String(a) === String(b);
  };

  // Treat `{ $ne: ... }`, `{ $gte: ... }` etc. as operator objects; an ObjectId
  // or Date is a value, not an operator object.
  const isOperatorObj = (c) =>
    c != null &&
    typeof c === "object" &&
    c.constructor === Object &&
    Object.keys(c).some((k) => k.startsWith("$"));

  // Apply a captured Mongo match/find filter to a plain document.
  const matchesFilter = (filter, doc) => {
    for (const [key, cond] of Object.entries(filter || {})) {
      if (key === "$text") continue; // text search is orthogonal to visibility
      if (key === "$or") {
        if (!cond.some((sub) => matchesFilter(sub, doc))) return false;
        continue;
      }
      if (key.startsWith("$")) continue;

      const val = doc[key];
      if (isOperatorObj(cond)) {
        for (const [op, opVal] of Object.entries(cond)) {
          if (op === "$ne" && eq(val, opVal)) return false;
          else if (op === "$eq" && !eq(val, opVal)) return false;
          else if (op === "$gt" && !(val > opVal)) return false;
          else if (op === "$gte" && !(val >= opVal)) return false;
          else if (op === "$lt" && !(val < opVal)) return false;
          else if (op === "$lte" && !(val <= opVal)) return false;
        }
      } else if (!eq(val, cond)) {
        return false;
      }
    }
    return true;
  };

  const matchOf = (pipeline) =>
    (pipeline.find((s) => s && Object.prototype.hasOwnProperty.call(s, "$match")) || {})
      .$match || null;

  return {
    state,
    videoModel: {
      // getAllVideos: aggregate([{ $match }, ...]) — capture + apply $match.
      aggregate: vi.fn(async (pipeline) => {
        const m = matchOf(pipeline);
        state.capturedVideoAggMatch = m;
        return state.videoDataset.filter((d) => matchesFilter(m, d));
      }),
      countDocuments: vi.fn(async (filter) => {
        state.capturedVideoCountFilter = filter;
        return state.videoDataset.filter((d) => matchesFilter(filter, d)).length;
      }),
      // searchSuggestions: find(filter, proj).sort().limit() — chainable thenable.
      find: vi.fn((filter) => {
        state.capturedVideoFindFilter = filter;
        const matched = state.videoDataset.filter((d) => matchesFilter(filter, d));
        let cap = matched.length;
        const query = {
          sort: () => query,
          limit: (n) => {
            cap = n;
            return query;
          },
          then: (resolve) => resolve(matched.slice(0, cap)),
        };
        return query;
      }),
    },
    commentModel: {
      // getVideoComments: aggregate([{ $match }, ...]) — capture + apply $match.
      aggregate: vi.fn(async (pipeline) => {
        const m = matchOf(pipeline);
        state.capturedCommentAggMatch = m;
        return state.commentDataset.filter((d) => matchesFilter(m, d));
      }),
    },
  };
});

vi.mock("../../models/video.model.js", () => ({ Video: videoModel }));
vi.mock("../../models/comment.model.js", () => ({ Comment: commentModel }));

const { getAllVideos, searchSuggestions } = await import(
  "../../controllers/video.controller.js"
);
const { getVideoComments } = await import("../../controllers/comment.controller.js");

// ── Helpers ──────────────────────────────────────────────────────────────────
const objectIdArb = fc
  .hexaString({ minLength: 24, maxLength: 24 })
  .filter((s) => isValidObjectId(s));

// `isHidden` is sometimes the boolean flag and sometimes absent (legacy docs),
// to prove an undefined `isHidden` is treated as not-hidden by `{ $ne: true }`.
const isHiddenArb = fc.option(fc.boolean(), { nil: undefined });

const isVisibleVideo = (v) => v.isPublished === true && v.isHidden !== true;
const isVisibleComment = (c) => c.isHidden !== true;

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

beforeEach(() => {
  state.videoDataset = [];
  state.commentDataset = [];
  state.capturedVideoAggMatch = null;
  state.capturedVideoCountFilter = null;
  state.capturedVideoFindFilter = null;
  state.capturedCommentAggMatch = null;
  videoModel.aggregate.mockClear();
  videoModel.countDocuments.mockClear();
  videoModel.find.mockClear();
  commentModel.aggregate.mockClear();
});

describe("Property 8: public discovery surfaces exclude unpublished and hidden content", () => {
  it("getAllVideos: captured $match excludes unpublished/hidden, and results are exactly the published+non-hidden videos", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: objectIdArb,
            title: fc.string({ minLength: 1, maxLength: 20 }),
            isPublished: fc.boolean(),
            isHidden: isHiddenArb,
            views: fc.nat({ max: 1_000_000 }),
          }),
          { minLength: 0, maxLength: 8 },
        ),
        async (videos) => {
          state.videoDataset = videos.map((v) => ({
            _id: v.id,
            title: v.title,
            isPublished: v.isPublished,
            isHidden: v.isHidden,
            views: v.views,
            owner: { _id: v.id, username: "u" },
          }));

          const { res, next } = await run(getAllVideos, { query: {} });
          expect(next).not.toHaveBeenCalled();

          // The captured filter encodes the public-visibility predicate.
          expect(state.capturedVideoAggMatch).toMatchObject({
            isPublished: true,
            isHidden: { $ne: true },
          });
          // countDocuments uses the SAME visibility predicate.
          expect(state.capturedVideoCountFilter).toMatchObject({
            isPublished: true,
            isHidden: { $ne: true },
          });

          const docs = res.body.data.docs;
          // Every surfaced video is published AND non-hidden.
          for (const d of docs) {
            expect(d.isPublished).toBe(true);
            expect(d.isHidden).not.toBe(true);
          }
          // Exactly the visible set is surfaced (no over- or under-exclusion).
          const expected = state.videoDataset.filter(isVisibleVideo);
          expect(new Set(docs.map((d) => String(d._id)))).toEqual(
            new Set(expected.map((d) => String(d._id))),
          );
          // totalCount is computed over the same visible set.
          expect(res.body.data.totalCount).toBe(expected.length);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("searchSuggestions: find filter excludes unpublished/hidden, and suggestions derive only from visible videos", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: objectIdArb,
            title: fc.string({ minLength: 1, maxLength: 20 }),
            isPublished: fc.boolean(),
            isHidden: isHiddenArb,
          }),
          { minLength: 0, maxLength: 8 },
        ),
        async (videos) => {
          state.videoDataset = videos.map((v) => ({
            _id: v.id,
            title: v.title,
            isPublished: v.isPublished,
            isHidden: v.isHidden,
          }));

          const { res, next } = await run(searchSuggestions, { query: { q: "a" } });
          expect(next).not.toHaveBeenCalled();

          // The find filter encodes the public-visibility predicate.
          expect(state.capturedVideoFindFilter).toMatchObject({
            isPublished: true,
            isHidden: { $ne: true },
          });

          const suggestions = res.body.data.suggestions;
          const visibleTitles = new Set(
            state.videoDataset.filter(isVisibleVideo).map((v) => v.title),
          );
          // Every suggestion title traces back to a published+non-hidden video.
          for (const title of suggestions) {
            expect(visibleTitles.has(title)).toBe(true);
          }
          // No hidden/unpublished video's title can appear unless it is ALSO a
          // visible video's title — i.e. suggestions ⊆ distinct visible titles.
          expect(new Set(suggestions)).toEqual(visibleTitles);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("getVideoComments: captured $match excludes hidden, and results are exactly the non-hidden top-level comments", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        fc.array(
          fc.record({ id: objectIdArb, isHidden: isHiddenArb }),
          { minLength: 0, maxLength: 8 },
        ),
        async (videoId, comments) => {
          state.commentDataset = comments.map((c) => ({
            _id: c.id,
            video: videoId, // same video; matcher compares ObjectId vs hex string
            parentComment: null,
            isHidden: c.isHidden,
            content: "x",
          }));

          const { res, next } = await run(getVideoComments, {
            params: { video_Id: videoId },
            query: {},
            user: {},
          });
          expect(next).not.toHaveBeenCalled();

          // The captured filter keeps only top-level, non-hidden comments.
          expect(state.capturedCommentAggMatch).toMatchObject({
            parentComment: null,
            isHidden: { $ne: true },
          });

          const docs = res.body.data;
          // Every surfaced comment is non-hidden.
          for (const c of docs) {
            expect(c.isHidden).not.toBe(true);
          }
          // Exactly the non-hidden set is surfaced.
          const expected = state.commentDataset.filter(isVisibleComment);
          expect(new Set(docs.map((c) => String(c._id)))).toEqual(
            new Set(expected.map((c) => String(c._id))),
          );
        },
      ),
      { numRuns: 120 },
    );
  });
});
