// Feature: phase-4-social-discovery, Property 15: New endpoints use the canonical response shapes and preserve existing endpoint shapes
//
// Validates: Requirements 2.3, 3.9, 5.4
//
// For any new Phase 4 endpoint a SUCCESS response is shaped exactly
// `{ statusCode, message, data, success }` with `success === (statusCode < 400)`,
// and a REJECTION funnelled through the global error handler is shaped
// `{ statusCode, success: false, message, errors }`. Existing endpoint payload
// shapes are preserved: `getAllVideos` still returns
// `{ docs, page, limit, totalCount, hasNextPage }`, and `getVideoComments`
// keeps every pre-existing comment field while `pinned`/`pinnedAt` are purely
// additive (the pipeline's only `$project` is the existing `{ likes: 0 }`).
//
// Success side: the real `createReport` (201), `listReports` (200),
// `resolveReport`/`dismissReport` (200), `pinComment`/`unpinComment` (200),
// `searchSuggestions` (200), and `getAllVideos` (200) controllers are driven
// with mocked Mongoose models so they reach `res.json(new ApiResponse(...))`.
// The captured body is asserted to carry EXACTLY the four ApiResponse keys with
// `success === (statusCode < 400)`.
//
// Error side: an ApiError with a fast-check-varied `statusCode >= 400`, message
// and errors is pushed through the real `errorHandler` middleware with a
// capturing fake `res`, and the emitted JSON is asserted to be the canonical
// `{ statusCode, success:false, message, errors }`.

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { isValidObjectId, Types } from "mongoose";

const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "HATE",
  "SEXUAL",
  "VIOLENCE",
  "MISINFORMATION",
  "OTHER",
];

// ── In-memory state shared with the mocked models ────────────────────────────
const {
  videoState,
  commentState,
  reportState,
  videoModel,
  commentModel,
  reportModel,
} = vi.hoisted(() => {
  const videoState = {
    targetExists: true,
    aggregateDocs: [],
    totalCount: 0,
    suggestionDocs: [],
  };
  const commentState = {
    targetExists: true,
    pinnedCount: 0,
    aggregateDocs: [],
    lastPipeline: null,
  };
  const reportState = {
    existingOpen: null,
    // Configurable report returned by Report.findById for resolve/dismiss.
    findByIdReport: null,
  };

  return {
    videoState,
    commentState,
    reportState,
    videoModel: {
      // getAllVideos uses aggregate + countDocuments via Promise.all.
      aggregate: vi.fn(async () => videoState.aggregateDocs),
      countDocuments: vi.fn(async () => videoState.totalCount),
      // createReport target existence check.
      findById: vi.fn(async (id) =>
        videoState.targetExists && isValidObjectId(id)
          ? { _id: id, title: "v" }
          : null,
      ),
      findByIdAndUpdate: vi.fn(async () => ({})),
      // searchSuggestions: find().sort().limit() resolves to ranked docs.
      find: vi.fn(() => {
        const query = {
          sort: vi.fn(() => query),
          limit: vi.fn(async () => videoState.suggestionDocs),
        };
        return query;
      }),
    },
    commentModel: {
      // getVideoComments uses aggregate; capture the pipeline for shape checks.
      aggregate: vi.fn(async (pipeline) => {
        commentState.lastPipeline = pipeline;
        return commentState.aggregateDocs;
      }),
      findById: vi.fn(async (id) =>
        commentState.targetExists && isValidObjectId(id)
          ? { _id: id, content: "c" }
          : null,
      ),
      countDocuments: vi.fn(async () => commentState.pinnedCount),
      findByIdAndUpdate: vi.fn(async (id, update) => ({
        _id: id,
        ...update,
      })),
    },
    reportModel: {
      findOne: vi.fn(async () => reportState.existingOpen),
      create: vi.fn(async (doc) => ({ _id: new Types.ObjectId(), ...doc })),
      // resolveReport / dismissReport load the report then call .save().
      findById: vi.fn(async () => reportState.findByIdReport),
      // listReports: find().sort().populate().populate().populate() resolves.
      find: vi.fn(() => {
        const query = {
          sort: vi.fn(() => query),
          populate: vi.fn(() => query),
          then: (resolve) => resolve([]),
        };
        return query;
      }),
    },
  };
});

vi.mock("../../models/video.model.js", () => ({ Video: videoModel }));
vi.mock("../../models/comment.model.js", () => ({ Comment: commentModel }));
vi.mock("../../models/report.model.js", () => ({ Report: reportModel }));

const { getAllVideos, searchSuggestions } = await import(
  "../../controllers/video.controller.js"
);
const { getVideoComments, pinComment, unpinComment } = await import(
  "../../controllers/comment.controller.js"
);
const { createReport, listReports, resolveReport, dismissReport } = await import(
  "../../controllers/report.controller.js"
);

// errorHandler is the real global middleware — no mocking.
const { errorHandler } = await import("../../middlewares/error.middleware.js");
const { ApiError } = await import("../../utils/ApiError.js");

// ── Helpers ──────────────────────────────────────────────────────────────
const objectIdArb = fc
  .hexaString({ minLength: 24, maxLength: 24 })
  .filter((s) => isValidObjectId(s));

/** Chainable res spy that captures the ApiResponse handed to res.json. */
function makeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

/** Capturing fake res for the error-handler path. */
function makeErrorRes() {
  return {
    statusCode: undefined,
    contentType: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    type(t) {
      this.contentType = t;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

/** Flush queued micro/macro tasks so asyncHandler's promise chain settles. */
async function flush() {
  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Drive an asyncHandler-wrapped controller to completion; returns {res, next}. */
async function run(handler, req) {
  const res = makeRes();
  const next = vi.fn();
  handler(req, res, next);
  await flush();
  return { res, next };
}

/** The four canonical ApiResponse keys, sorted for an exact-shape comparison. */
const SUCCESS_KEYS = ["data", "message", "statusCode", "success"];

/** Assert a captured success body is EXACTLY the canonical ApiResponse shape. */
function assertSuccessShape(body) {
  expect(body).toBeDefined();
  // Exactly { statusCode, message, data, success } — no more, no fewer keys.
  expect(Object.keys(body).sort()).toEqual(SUCCESS_KEYS);
  expect(typeof body.statusCode).toBe("number");
  expect(typeof body.message).toBe("string");
  expect(typeof body.success).toBe("boolean");
  // The defining invariant: success is derived from the status code.
  expect(body.success).toBe(body.statusCode < 400);
}

beforeEach(() => {
  videoState.targetExists = true;
  videoState.aggregateDocs = [];
  videoState.totalCount = 0;
  videoState.suggestionDocs = [];
  commentState.targetExists = true;
  commentState.pinnedCount = 0;
  commentState.aggregateDocs = [];
  commentState.lastPipeline = null;
  reportState.existingOpen = null;
  reportState.findByIdReport = null;

  videoModel.aggregate.mockClear();
  videoModel.countDocuments.mockClear();
  videoModel.findById.mockClear();
  videoModel.findByIdAndUpdate.mockClear();
  videoModel.find.mockClear();
  commentModel.aggregate.mockClear();
  commentModel.findById.mockClear();
  commentModel.countDocuments.mockClear();
  commentModel.findByIdAndUpdate.mockClear();
  reportModel.findOne.mockClear();
  reportModel.create.mockClear();
  reportModel.findById.mockClear();
  reportModel.find.mockClear();
});

describe("Property 15: new endpoints use the canonical response shapes", () => {
  it("every success response across new Phase 4 endpoints is exactly { statusCode, message, data, success } with success === (statusCode < 400)", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb, // reporter / user id
        objectIdArb, // target id (video or comment)
        objectIdArb, // comment id for pin/unpin
        objectIdArb, // video id the comment belongs to
        fc.constantFrom("Video", "Comment"),
        fc.constantFrom(...REPORT_REASONS),
        fc.string({ minLength: 1, maxLength: 30 }), // search query
        fc.constantFrom("relevance", "date", "views", undefined),
        async (
          userId,
          targetId,
          commentId,
          commentVideoId,
          targetType,
          reason,
          query,
          sortBy,
        ) => {
          // reset per-iteration state (fast-check reuses the module state)
          videoState.targetExists = true;
          videoState.aggregateDocs = [
            { _id: new Types.ObjectId(), title: "a", views: 5 },
          ];
          videoState.totalCount = 1;
          videoState.suggestionDocs = [{ title: "alpha" }, { title: "beta" }];
          commentState.targetExists = true;
          commentState.pinnedCount = 0;
          reportState.existingOpen = null;

          const user = new Types.ObjectId(userId);

          // ── createReport (201) ──
          const created = await run(createReport, {
            body: { targetType, targetId, reason },
            user: { _id: user },
          });
          expect(created.next).not.toHaveBeenCalled();
          assertSuccessShape(created.res.body);
          expect(created.res.body.statusCode).toBe(201);
          expect(created.res.body.success).toBe(true);

          // ── listReports (200) ──
          const listed = await run(listReports, {
            query: {},
            user: { _id: user },
          });
          expect(listed.next).not.toHaveBeenCalled();
          assertSuccessShape(listed.res.body);
          expect(listed.res.body.statusCode).toBe(200);

          // ── resolveReport (200) — loads an OPEN report, hides target, saves ──
          reportState.findByIdReport = {
            _id: new Types.ObjectId(),
            targetType,
            video: targetType === "Video" ? new Types.ObjectId(targetId) : undefined,
            comment: targetType === "Comment" ? new Types.ObjectId(targetId) : undefined,
            status: "OPEN",
            save: vi.fn(async function save() {
              return this;
            }),
          };
          const resolved = await run(resolveReport, {
            params: { reportId: new Types.ObjectId().toString() },
            user: { _id: user },
          });
          expect(resolved.next).not.toHaveBeenCalled();
          assertSuccessShape(resolved.res.body);
          expect(resolved.res.body.statusCode).toBe(200);

          // ── dismissReport (200) — loads a report, sets DISMISSED, saves ──
          reportState.findByIdReport = {
            _id: new Types.ObjectId(),
            targetType,
            video: targetType === "Video" ? new Types.ObjectId(targetId) : undefined,
            comment: targetType === "Comment" ? new Types.ObjectId(targetId) : undefined,
            status: "OPEN",
            save: vi.fn(async function save() {
              return this;
            }),
          };
          const dismissed = await run(dismissReport, {
            params: { reportId: new Types.ObjectId().toString() },
            user: { _id: user },
          });
          expect(dismissed.next).not.toHaveBeenCalled();
          assertSuccessShape(dismissed.res.body);
          expect(dismissed.res.body.statusCode).toBe(200);

          // ── pinComment (200) — owner guard already stashed req.resource ──
          const pinned = await run(pinComment, {
            params: { comment_Id: commentId },
            user: { _id: user },
            resource: {
              _id: new Types.ObjectId(commentId),
              video: new Types.ObjectId(commentVideoId),
              pinned: false,
            },
          });
          expect(pinned.next).not.toHaveBeenCalled();
          assertSuccessShape(pinned.res.body);
          expect(pinned.res.body.statusCode).toBe(200);

          // ── unpinComment (200) ──
          const unpinned = await run(unpinComment, {
            params: { comment_Id: commentId },
            user: { _id: user },
            resource: {
              _id: new Types.ObjectId(commentId),
              video: new Types.ObjectId(commentVideoId),
              pinned: true,
            },
          });
          expect(unpinned.next).not.toHaveBeenCalled();
          assertSuccessShape(unpinned.res.body);
          expect(unpinned.res.body.statusCode).toBe(200);

          // ── searchSuggestions (200) ──
          const suggested = await run(searchSuggestions, {
            query: { q: query },
            user: { _id: user },
          });
          expect(suggested.next).not.toHaveBeenCalled();
          assertSuccessShape(suggested.res.body);
          expect(suggested.res.body.statusCode).toBe(200);

          // ── getAllVideos (200) ──
          const all = await run(getAllVideos, {
            query: { page: 1, limit: 10, query, sortBy },
            user: { _id: user },
          });
          expect(all.next).not.toHaveBeenCalled();
          assertSuccessShape(all.res.body);
          expect(all.res.body.statusCode).toBe(200);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("every rejection routed through the global error handler is shaped { statusCode, success:false, message, errors }", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.array(
          fc.oneof(
            fc.string(),
            fc.record({ field: fc.string(), msg: fc.string() }),
          ),
        ),
        async (statusCode, message, errors) => {
          const err = new ApiError(statusCode, message, errors);
          const res = makeErrorRes();

          errorHandler(
            err,
            { method: "POST", path: "/api/v1/reports" },
            res,
            () => {},
          );

          const { body } = res;
          // Canonical rejection keys are all present.
          expect(body).toHaveProperty("statusCode");
          expect(body).toHaveProperty("success");
          expect(body).toHaveProperty("message");
          expect(body).toHaveProperty("errors");

          // success is literally false for every rejection.
          expect(body.success).toBe(false);

          // Client-safe ApiError fields are echoed verbatim.
          expect(body.statusCode).toBe(statusCode);
          expect(res.statusCode).toBe(statusCode);
          expect(body.message).toBe(message);
          expect(Array.isArray(body.errors)).toBe(true);
          expect(body.errors).toEqual(errors);

          // Emitted as JSON.
          expect(res.contentType).toBe("application/json");
        },
      ),
      { numRuns: 120 },
    );
  });
});

describe("Property 15: existing endpoint payload shapes are preserved", () => {
  it("getAllVideos data retains EXACTLY { docs, page, limit, totalCount, hasNextPage }", async () => {
    const DATA_KEYS = ["docs", "hasNextPage", "limit", "page", "totalCount"];

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // page
        fc.integer({ min: 1, max: 20 }), // limit
        fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
        fc.constantFrom("relevance", "date", "views", "createdAt", undefined),
        fc.constantFrom("short", "medium", "long", undefined),
        fc.integer({ min: 0, max: 50 }), // totalCount
        fc.array(
          fc.record({
            _id: fc.constant(undefined).map(() => new Types.ObjectId()),
            title: fc.string(),
            views: fc.integer({ min: 0, max: 1000 }),
          }),
          { maxLength: 5 },
        ),
        async (page, limit, query, sortBy, durationBucket, totalCount, docs) => {
          videoState.aggregateDocs = docs;
          videoState.totalCount = totalCount;

          const { res, next } = await run(getAllVideos, {
            query: { page, limit, query, sortBy, durationBucket },
            user: { _id: new Types.ObjectId() },
          });

          expect(next).not.toHaveBeenCalled();
          assertSuccessShape(res.body);
          const { data } = res.body;
          // EXACTLY the five canonical pagination keys — additive filters never
          // change the response envelope (R5.4).
          expect(Object.keys(data).sort()).toEqual(DATA_KEYS);
          expect(data.page).toBe(page);
          expect(data.limit).toBe(limit);
          expect(data.totalCount).toBe(totalCount);
          expect(typeof data.hasNextPage).toBe("boolean");
          expect(Array.isArray(data.docs)).toBe(true);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("getVideoComments preserves pre-existing comment fields and treats pinned/pinnedAt as additive (only $project is { likes: 0 })", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        fc.constantFrom("top", "newest", undefined),
        fc.array(
          fc.record({
            _id: fc.constant(undefined).map(() => new Types.ObjectId()),
            content: fc.string(),
            createdAt: fc.date().map((d) => d.toISOString()),
            likesCount: fc.integer({ min: 0, max: 100 }),
            owner: fc.record({ username: fc.string() }),
            pinned: fc.boolean(),
            pinnedAt: fc.option(fc.date().map((d) => d.toISOString()), {
              nil: null,
            }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (videoId, sort, comments) => {
          commentState.aggregateDocs = comments;

          const { res, next } = await run(getVideoComments, {
            params: { video_Id: videoId },
            query: { page: 1, limit: 10, sort },
            user: { _id: new Types.ObjectId() },
          });

          expect(next).not.toHaveBeenCalled();
          assertSuccessShape(res.body);

          // Returned items retain pre-existing fields plus additive pin fields.
          for (const item of res.body.data) {
            expect(item).toHaveProperty("content");
            expect(item).toHaveProperty("createdAt");
            expect(item).toHaveProperty("likesCount");
            expect(item).toHaveProperty("owner");
            // pinned/pinnedAt are present additively, never replacing fields.
            expect(item).toHaveProperty("pinned");
            expect(item).toHaveProperty("pinnedAt");
          }

          // The aggregation never projects pinned/pinnedAt away: its only
          // $project stage is the pre-existing exclusion of `likes`.
          const projectStages = commentState.lastPipeline.filter(
            (stage) => stage && Object.prototype.hasOwnProperty.call(stage, "$project"),
          );
          expect(projectStages).toHaveLength(1);
          expect(projectStages[0].$project).toEqual({ likes: 0 });
        },
      ),
      { numRuns: 120 },
    );
  });
});
