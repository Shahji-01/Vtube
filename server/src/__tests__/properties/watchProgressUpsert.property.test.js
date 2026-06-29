/**
 * Feature: phase-3-viewer-features, Property 4: WatchProgress save is an idempotent upsert with read-back
 *
 * Validates: Requirements 3.1, 3.6
 *
 * For any user, video, and any sequence of valid `positionSeconds` values
 * (each `0 <= p <= duration`), after applying the saves through the actual
 * `saveProgress` controller there is exactly ONE WatchProgress record for that
 * `{user, video}` pair (guaranteed by the unique {user,video} index + upsert),
 * and a subsequent `getProgress` fetch returns the most-recently-saved
 * `positionSeconds`.
 *
 * The `WatchProgress` and `Video` Mongoose models are mocked (per the existing
 * mocked-model property-test pattern, e.g. ownership.property.test.js). The
 * upsert `findOneAndUpdate({user,video}, {$set:{positionSeconds}}, {upsert,new})`
 * is simulated by an in-memory Map keyed by `user|video`, so the single-record
 * and last-write-wins invariants are provable without a real database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { isValidObjectId, Types } from "mongoose";

// ── In-memory upsert store shared with the mocked WatchProgress model ─────────
// Keyed by `${user}|${video}`; this mirrors the unique {user,video} index so at
// most one record can ever exist per pair (R3.1), and the upsert is last-write-wins.
const { store, videoState } = vi.hoisted(() => ({
  store: new Map(),
  videoState: { duration: 600 },
}));

const { watchProgressModel, videoModel } = vi.hoisted(() => ({
  watchProgressModel: {
    // Simulated upsert: create on first write, update in place afterwards (R3.6).
    findOneAndUpdate: vi.fn(async (filter, update, options = {}) => {
      const key = `${filter.user}|${filter.video}`;
      const set = update.$set || {};
      let record = store.get(key);
      if (!record) {
        if (!options.upsert) return null;
        record = {
          _id: new Types.ObjectId(),
          user: filter.user,
          video: filter.video,
          createdAt: new Date(),
        };
        store.set(key, record);
      }
      Object.assign(record, set, { updatedAt: new Date() });
      return options.new === false ? null : record;
    }),
    // Strictly user-scoped read.
    findOne: vi.fn(async (filter) => {
      const key = `${filter.user}|${filter.video}`;
      return store.get(key) || null;
    }),
  },
  videoModel: {
    // A valid video with a known duration so valid positions pass the bound.
    findById: vi.fn(async (id) =>
      isValidObjectId(id) ? { _id: id, duration: videoState.duration } : null,
    ),
  },
}));

vi.mock("../../models/watchProgress.model.js", () => ({ WatchProgress: watchProgressModel }));
vi.mock("../../models/video.model.js", () => ({ Video: videoModel }));

const { saveProgress, getProgress } = await import(
  "../../controllers/watchProgress.controller.js"
);

// ── Helpers ───────────────────────────────────────────────────────────────
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

beforeEach(() => {
  store.clear();
  videoState.duration = 600;
  watchProgressModel.findOneAndUpdate.mockClear();
  watchProgressModel.findOne.mockClear();
  videoModel.findById.mockClear();
});

describe("Property 4: WatchProgress save is an idempotent upsert with read-back", () => {
  it("a sequence of valid saves leaves exactly one record whose fetched position is the last saved", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        objectIdArb,
        // duration up to which all positions are valid (0 <= p <= duration).
        fc.integer({ min: 1, max: 36000 }),
        // a non-empty sequence of valid positions in [0, duration].
        fc.array(fc.float({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 25 }),
        async (userId, videoId, duration, fractions) => {
          store.clear();
          videoState.duration = duration;

          const user = new Types.ObjectId(userId);
          // Map each fraction onto a valid integer-ish position within [0, duration].
          const positions = fractions.map((f) => Math.round(f * duration));

          // Apply every save through the real controller.
          for (const positionSeconds of positions) {
            // eslint-disable-next-line no-await-in-loop
            const { res, next } = await run(saveProgress, {
              params: { videoId },
              body: { positionSeconds },
              user: { _id: user },
            });
            expect(next).not.toHaveBeenCalled();
            expect(res.body.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
          }

          // Exactly ONE record exists for this {user, video} pair.
          expect(store.size).toBe(1);
          const key = `${user}|${videoId}`;
          expect(store.has(key)).toBe(true);

          const lastSaved = positions[positions.length - 1];

          // A subsequent fetch returns the most-recently-saved position.
          const { res: fetchRes, next: fetchNext } = await run(getProgress, {
            params: { videoId },
            user: { _id: user },
          });
          expect(fetchNext).not.toHaveBeenCalled();
          expect(fetchRes.body.statusCode).toBe(200);
          expect(fetchRes.body.data.positionSeconds).toBe(lastSaved);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("re-saving the same position repeatedly is idempotent: still one record, same value", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        objectIdArb,
        fc.integer({ min: 0, max: 600 }),
        fc.integer({ min: 1, max: 10 }),
        async (userId, videoId, positionSeconds, repeats) => {
          store.clear();
          videoState.duration = 600;
          const user = new Types.ObjectId(userId);

          for (let i = 0; i < repeats; i++) {
            // eslint-disable-next-line no-await-in-loop
            const { res, next } = await run(saveProgress, {
              params: { videoId },
              body: { positionSeconds },
              user: { _id: user },
            });
            expect(next).not.toHaveBeenCalled();
            expect(res.body.statusCode).toBe(200);
          }

          // Idempotent: one record regardless of how many identical saves ran.
          expect(store.size).toBe(1);

          const { res: fetchRes } = await run(getProgress, {
            params: { videoId },
            user: { _id: user },
          });
          expect(fetchRes.body.data.positionSeconds).toBe(positionSeconds);
        },
      ),
      { numRuns: 100 },
    );
  });
});
