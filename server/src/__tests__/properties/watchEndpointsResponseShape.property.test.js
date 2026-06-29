/**
 * Feature: phase-3-viewer-features, Property 13: New endpoints use the canonical response shapes
 *
 * Validates: Requirements 6.3, 6.4
 *
 * For any new Phase 3 endpoint a SUCCESS response is shaped exactly
 * `{ statusCode, message, data, success }` with `success === (statusCode < 400)`,
 * and a REJECTION funnelled through the global error handler is shaped
 * `{ statusCode, success: false, message, errors }`.
 *
 * Success side: the real `saveProgress` / `getProgress` / `addToWatchLater` /
 * `removeFromWatchLater` / `listWatchLater` controllers are driven with mocked
 * Mongoose models (existing video, valid inputs, present/absent records varied
 * by fast-check). The `res.json` payload is asserted to carry exactly the four
 * ApiResponse keys with `success === (statusCode < 400)`.
 *
 * Error side: an ApiError with a fast-check-varied `statusCode >= 400` and
 * message is pushed through the real `errorHandler` middleware with a capturing
 * fake `res`, and the emitted JSON is asserted to be the canonical
 * `{ statusCode, success:false, message, errors }`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { isValidObjectId, Types } from "mongoose";

// ── In-memory state shared with the mocked models ────────────────────────────
const {
  progressStore,
  watchLaterStore,
  videoState,
  watchProgressModel,
  watchLaterModel,
  videoModel,
} = vi.hoisted(() => {
  const progressStore = new Map();
  const watchLaterStore = new Map();
  const videoState = { duration: 600 };

  return {
    progressStore,
    watchLaterStore,
    videoState,
    watchProgressModel: {
      findOneAndUpdate: vi.fn(async (filter, update, options = {}) => {
        const key = `${filter.user}|${filter.video}`;
        const set = update.$set || {};
        let record = progressStore.get(key);
        if (!record) {
          if (!options.upsert) return null;
          record = {
            _id: new Types.ObjectId(),
            user: filter.user,
            video: filter.video,
            createdAt: new Date(),
          };
          progressStore.set(key, record);
        }
        Object.assign(record, set, { updatedAt: new Date() });
        return options.new === false ? null : record;
      }),
      findOne: vi.fn(async (filter) => {
        const key = `${filter.user}|${filter.video}`;
        return progressStore.get(key) || null;
      }),
    },
    watchLaterModel: {
      findOneAndUpdate: vi.fn(async (filter, update, _options = {}) => {
        const key = `${filter.user}|${filter.video}`;
        if (!watchLaterStore.has(key)) {
          watchLaterStore.set(key, {
            _id: `wl-${key}`,
            ...(update.$setOnInsert || {}),
          });
        }
        return watchLaterStore.get(key);
      }),
      findOne: vi.fn(async (filter) => {
        const key = `${filter.user}|${filter.video}`;
        return watchLaterStore.get(key) || null;
      }),
      findOneAndDelete: vi.fn(async (filter) => {
        const key = `${filter.user}|${filter.video}`;
        const removed = watchLaterStore.get(key) || null;
        watchLaterStore.delete(key);
        return removed;
      }),
      // Chainable query: find().sort().populate() resolves to the user's entries.
      find: vi.fn((filter) => {
        const entries = [...watchLaterStore.values()].filter(
          (e) => `${e.user}` === `${filter.user}`,
        );
        const query = {
          sort: vi.fn(() => query),
          populate: vi.fn(() => query),
          then: (resolve) => resolve(entries),
        };
        return query;
      }),
    },
    videoModel: {
      findById: vi.fn(async (id) =>
        isValidObjectId(id) ? { _id: id, duration: videoState.duration } : null,
      ),
    },
  };
});

vi.mock("../../models/watchProgress.model.js", () => ({ WatchProgress: watchProgressModel }));
vi.mock("../../models/watchLater.model.js", () => ({ WatchLater: watchLaterModel }));
vi.mock("../../models/video.model.js", () => ({ Video: videoModel }));

const { saveProgress, getProgress } = await import(
  "../../controllers/watchProgress.controller.js"
);
const { addToWatchLater, removeFromWatchLater, listWatchLater } = await import(
  "../../controllers/watchLater.controller.js"
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

/** Capturing fake res for the error-handler path (mirrors errorShape suite). */
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
  progressStore.clear();
  watchLaterStore.clear();
  videoState.duration = 600;
  watchProgressModel.findOneAndUpdate.mockClear();
  watchProgressModel.findOne.mockClear();
  watchLaterModel.findOneAndUpdate.mockClear();
  watchLaterModel.findOne.mockClear();
  watchLaterModel.findOneAndDelete.mockClear();
  watchLaterModel.find.mockClear();
  videoModel.findById.mockClear();
});

describe("Property 13: new endpoints use the canonical response shapes", () => {
  it("every success response across all Phase 3 endpoints is exactly { statusCode, message, data, success } with success === (statusCode < 400)", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        objectIdArb,
        fc.integer({ min: 1, max: 36000 }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        // Whether a watch-progress / watch-later record already exists when read.
        fc.boolean(),
        async (userId, videoId, duration, fraction, prePopulate) => {
          progressStore.clear();
          watchLaterStore.clear();
          videoState.duration = duration;

          const user = new Types.ObjectId(userId);
          const positionSeconds = Math.round(fraction * duration);

          // ── saveProgress (200) ──
          const save = await run(saveProgress, {
            params: { videoId },
            body: { positionSeconds },
            user: { _id: user },
          });
          expect(save.next).not.toHaveBeenCalled();
          assertSuccessShape(save.res.body);
          expect(save.res.body.statusCode).toBe(200);
          expect(save.res.body.success).toBe(true);

          // ── getProgress (200) — record present (just saved) ──
          const getPresent = await run(getProgress, {
            params: { videoId },
            user: { _id: user },
          });
          expect(getPresent.next).not.toHaveBeenCalled();
          assertSuccessShape(getPresent.res.body);
          expect(getPresent.res.body.statusCode).toBe(200);

          // ── getProgress (200) — record absent for a different user ──
          if (!prePopulate) {
            const otherUser = new Types.ObjectId();
            const getAbsent = await run(getProgress, {
              params: { videoId },
              user: { _id: otherUser },
            });
            expect(getAbsent.next).not.toHaveBeenCalled();
            assertSuccessShape(getAbsent.res.body);
          }

          // ── addToWatchLater (200) ──
          const add = await run(addToWatchLater, {
            params: { videoId },
            user: { _id: user },
          });
          expect(add.next).not.toHaveBeenCalled();
          assertSuccessShape(add.res.body);
          expect(add.res.body.statusCode).toBe(200);

          // ── listWatchLater (200) — at least one entry now present ──
          const list = await run(listWatchLater, {
            params: {},
            user: { _id: user },
          });
          expect(list.next).not.toHaveBeenCalled();
          assertSuccessShape(list.res.body);
          expect(Array.isArray(list.res.body.data)).toBe(true);

          // ── removeFromWatchLater (200) — present (removed) or absent ──
          const removeUser = prePopulate ? user : new Types.ObjectId();
          const remove = await run(removeFromWatchLater, {
            params: { videoId },
            user: { _id: removeUser },
          });
          expect(remove.next).not.toHaveBeenCalled();
          assertSuccessShape(remove.res.body);
          expect(remove.res.body.statusCode).toBe(200);
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
          fc.oneof(fc.string(), fc.record({ field: fc.string(), msg: fc.string() })),
        ),
        async (statusCode, message, errors) => {
          const err = new ApiError(statusCode, message, errors);
          const res = makeErrorRes();

          errorHandler(err, { method: "POST", path: "/api/v1/watch" }, res, () => {});

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
