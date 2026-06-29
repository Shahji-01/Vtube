// ----------------MODERATION-HIDE INTEGRATION TEST (example-based, mocked models)------------
//
// Task 11.5: Write a moderation-hide integration test.
// Validates: Requirements 4.6, 4.9
//
// This is an EXAMPLE-BASED integration test (NOT a PBT, NO live DB) that wires
// two real controllers across the moderation→discovery seam:
//
//   resolveReport (report.controller.js)  →  getAllVideos (video.controller.js)
//
// The cross-controller invariant under test: once a moderator RESOLVES a report
// whose target is a Video, that video is flagged `isHidden: true` (R4.6), and a
// subsequent public `getAllVideos` listing EXCLUDES the now-hidden video (R4.9).
//
// To exercise the seam without a live MongoDB, only the Mongoose models and the
// `resolveViews` shim are mocked. A single in-memory `videos` array is SHARED by
// the Video mocks so a write performed by `resolveReport` is observed by the
// later `getAllVideos` read:
//
//   - Video.findByIdAndUpdate(id, { isHidden: true })
//        → flips `isHidden = true` on the matching in-memory video (the hide).
//   - Video.aggregate(pipeline)
//        → reads the `$match` the controller built and returns the in-memory
//          videos satisfying (at least) `isPublished: true` + `isHidden !== true`.
//   - Video.countDocuments(filter)
//        → counts the survivors of the same predicate.
//   - resolveViews(doc) → passes `views` through unchanged.
//   - Report.findById(id) → a Video-targeting OPEN report with a `save()` spy.
//
// Everything runs through the REAL asyncHandler, so we drive the handlers with a
// capturing `res` spy and a micro/macro-task flush (the same pattern used by the
// Phase-4 property tests, e.g. publicVisibility.property.test.js).

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared in-memory state + a small Mongo-ish filter matcher ────────────────
const { state, videoModel, reportModel } = vi.hoisted(() => {
  const state = {
    videos: [], // the single source of truth shared by all Video mocks
    report: null, // the OPEN report resolveReport will load + resolve
  };

  // Strict-or-stringified equality so ObjectId vs hex-string compares true.
  const eq = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    return String(a) === String(b);
  };

  // Treat `{ $ne }`, `{ $gte }`, ... as operator objects (a Date/ObjectId is a value).
  const isOperatorObj = (c) =>
    c != null &&
    typeof c === "object" &&
    c.constructor === Object &&
    Object.keys(c).some((k) => k.startsWith("$"));

  // Apply a captured Mongo $match/find filter to a plain document.
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
    (pipeline.find(
      (s) => s && Object.prototype.hasOwnProperty.call(s, "$match"),
    ) || {}).$match || null;

  return {
    state,
    videoModel: {
      // resolveReport's hide: flip isHidden on the matching in-memory video.
      findByIdAndUpdate: vi.fn(async (id, update) => {
        const v = state.videos.find((doc) => eq(doc._id, id));
        if (v && update && Object.prototype.hasOwnProperty.call(update, "isHidden")) {
          v.isHidden = update.isHidden;
        }
        return v || null;
      }),
      // getAllVideos read: capture the $match, return survivors.
      aggregate: vi.fn(async (pipeline) => {
        const m = matchOf(pipeline);
        return state.videos.filter((d) => matchesFilter(m, d));
      }),
      countDocuments: vi.fn(async (filter) =>
        state.videos.filter((d) => matchesFilter(filter, d)).length,
      ),
    },
    reportModel: {
      findById: vi.fn(async (id) =>
        state.report && eq(state.report._id, id) ? state.report : state.report,
      ),
    },
  };
});

vi.mock("../../models/video.model.js", () => ({ Video: videoModel }));
vi.mock("../../models/report.model.js", () => ({ Report: reportModel }));
// Comment model is imported by both controllers but never touched for a
// Video-targeted report; provide an inert mock so nothing hits a real DB.
vi.mock("../../models/comment.model.js", () => ({ Comment: {} }));
// resolveViews shim: pass the canonical `views` through unchanged.
vi.mock("../../services/viewCount.js", () => ({
  resolveViews: (doc) => doc?.views ?? 0,
}));

const { getAllVideos } = await import("../../controllers/video.controller.js");
const { resolveReport } = await import("../../controllers/report.controller.js");

// ── asyncHandler-flush + capturing-res helpers ───────────────────────────────

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

const videoId = "507f1f77bcf86cd799439011";
const reportId = "507f1f77bcf86cd799439021";

beforeEach(() => {
  // Seed exactly one published, non-hidden video.
  state.videos = [
    {
      _id: videoId,
      title: "How to make pasta",
      isPublished: true,
      isHidden: false,
      views: 42,
      owner: { _id: "507f1f77bcf86cd799439099", username: "chef" },
    },
  ];
  // An OPEN report targeting that video, with a save() spy.
  state.report = {
    _id: reportId,
    targetType: "Video",
    video: videoId,
    status: "OPEN",
    save: vi.fn(async function save() {
      return this;
    }),
  };

  videoModel.findByIdAndUpdate.mockClear();
  videoModel.aggregate.mockClear();
  videoModel.countDocuments.mockClear();
  reportModel.findById.mockClear();
});

describe("moderation hide → public listing exclusion (R4.6, R4.9)", () => {
  it("excludes a video from getAllVideos after a moderator resolves its report", async () => {
    // 1) Before moderation: the seeded video is listed publicly.
    const before = await run(getAllVideos, { query: {} });
    expect(before.next).not.toHaveBeenCalled();
    const beforeDocs = before.res.body.data.docs;
    expect(beforeDocs.map((d) => String(d._id))).toContain(videoId);
    expect(before.res.body.data.totalCount).toBe(1);

    // 2) A moderator resolves the report targeting the video.
    const resolve = await run(resolveReport, { params: { reportId } });
    expect(resolve.next).not.toHaveBeenCalled();
    // The hide write was applied and the report was marked RESOLVED.
    expect(videoModel.findByIdAndUpdate).toHaveBeenCalledWith(videoId, {
      isHidden: true,
    });
    expect(state.report.status).toBe("RESOLVED");
    expect(state.report.save).toHaveBeenCalledTimes(1);

    // 3) The target video is now hidden in the shared store (R4.6).
    const hidden = state.videos.find((v) => String(v._id) === videoId);
    expect(hidden.isHidden).toBe(true);

    // 4) A subsequent public listing EXCLUDES the now-hidden video (R4.9).
    const after = await run(getAllVideos, { query: {} });
    expect(after.next).not.toHaveBeenCalled();
    const afterDocs = after.res.body.data.docs;
    expect(afterDocs.map((d) => String(d._id))).not.toContain(videoId);
    expect(afterDocs).toHaveLength(0);
    expect(after.res.body.data.totalCount).toBe(0);
  });
});
