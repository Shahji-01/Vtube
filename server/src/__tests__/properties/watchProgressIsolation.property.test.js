/**
 * Feature: phase-3-viewer-features, Property 7: WatchProgress is strictly user-scoped
 *
 * Validates: Requirements 3.8, 6.5
 *
 * For any two DISTINCT users and any video, a save or fetch performed for one
 * user neither reads nor mutates the other user's WatchProgress record for that
 * video. We drive the real `saveProgress` / `getProgress` controllers with a
 * mocked `WatchProgress` model backed by an in-memory store keyed by
 * `user|video`, and a mocked `Video` model that always resolves the target
 * video (so the position bound is satisfied and execution reaches the
 * user-scoped query/update).
 *
 * Crucially, every fake request also carries the OTHER user's id smuggled into
 * params/body/query. The controller must ignore those and derive the acting
 * user exclusively from `req.user._id` (R3.8, R6.5). We assert:
 *   - every query/update the controller issues filters on
 *     `{ user: <actingUser>, video }` — and the acting user is always the one
 *     from `req.user`, never the smuggled id;
 *   - a save for user A never changes user B's stored value;
 *   - a fetch for user A never returns user B's record.
 *
 * No real DB / network I/O — the mocked model records every call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

const RUNS = { numRuns: 150 };

// A large duration so any generated position (0..10000) is a valid save.
const VIDEO_DURATION = 1_000_000;

// ── Hoisted mock state shared with the vi.mock factories ─────────────────────
const { store, wpCalls, wpFindOneAndUpdate, wpFindOne, videoFindById } = vi.hoisted(() => {
  const store = new Map();
  const calls = [];
  const key = (u, v) => `${String(u)}|${String(v)}`;
  return {
    store,
    wpCalls: calls,
    // findOneAndUpdate({ user, video }, { $set: { positionSeconds } }, { upsert })
    wpFindOneAndUpdate: vi.fn(async (filter, update) => {
      calls.push({ op: "findOneAndUpdate", filter, update });
      const record = {
        user: filter.user,
        video: filter.video,
        positionSeconds: update.$set.positionSeconds,
      };
      store.set(key(filter.user, filter.video), record);
      return record;
    }),
    // findOne({ user, video })
    wpFindOne: vi.fn(async (filter) => {
      calls.push({ op: "findOne", filter });
      return store.get(key(filter.user, filter.video)) || null;
    }),
    // Every targeted video exists with a generous duration.
    videoFindById: vi.fn(async (id) => ({ _id: id, duration: VIDEO_DURATION })),
  };
});

vi.mock("../../models/watchProgress.model.js", () => ({
  WatchProgress: { findOneAndUpdate: wpFindOneAndUpdate, findOne: wpFindOne },
}));
vi.mock("../../models/video.model.js", () => ({
  Video: { findById: videoFindById },
}));

const { saveProgress, getProgress } = await import(
  "../../controllers/watchProgress.controller.js"
);

// A fresh, valid 24-hex ObjectId string.
const objectIdArb = fc.hexaString({ minLength: 24, maxLength: 24 });
// A valid Position_Seconds within the (mocked) video duration.
const positionArb = fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true });

const storeKey = (u, v) => `${String(u)}|${String(v)}`;

function resetState() {
  store.clear();
  wpCalls.length = 0;
  wpFindOneAndUpdate.mockClear();
  wpFindOne.mockClear();
  videoFindById.mockClear();
}

/**
 * Build a request for `actingUser` that ALSO smuggles `otherUser`'s id into
 * params/body/query. A correct controller must ignore the smuggled values and
 * scope solely to `req.user._id`.
 */
function reqFor(actingUser, otherUser, videoId, positionSeconds) {
  return {
    user: { _id: actingUser },
    params: { videoId, user: otherUser, userId: otherUser, _id: otherUser },
    body: { positionSeconds, user: otherUser, userId: otherUser, _id: otherUser },
    query: { user: otherUser, userId: otherUser },
  };
}

/**
 * Run an asyncHandler-wrapped controller to completion. The handler either
 * resolves by calling res.json (success) or rejects into next(err).
 */
function runController(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: undefined,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ res, err: undefined });
        return this;
      },
    };
    const next = (err) => resolve({ res, err });
    handler(req, res, next);
  });
}

describe("Property 7: WatchProgress is strictly user-scoped", () => {
  beforeEach(resetState);

  it("a save for user A scopes to A, never reads/mutates user B's record", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        objectIdArb,
        objectIdArb,
        positionArb,
        positionArb,
        async (userA, userB, videoId, posA, posB) => {
          fc.pre(userA !== userB);
          resetState();

          // User B already has a stored position for this video.
          store.set(storeKey(userB, videoId), {
            user: userB,
            video: videoId,
            positionSeconds: posB,
          });

          // Save for A, with B's id smuggled into params/body/query.
          const { err } = await runController(
            saveProgress,
            reqFor(userA, userB, videoId, posA)
          );
          expect(err).toBeUndefined();

          // Every WatchProgress operation was scoped to A + this video — and
          // never to the smuggled user B (proves derivation from req.user only).
          expect(wpCalls.length).toBeGreaterThan(0);
          for (const call of wpCalls) {
            expect(String(call.filter.user)).toBe(userA);
            expect(String(call.filter.user)).not.toBe(userB);
            expect(String(call.filter.video)).toBe(videoId);
          }

          // User B's stored record is untouched by A's write.
          expect(store.get(storeKey(userB, videoId)).positionSeconds).toBe(posB);
          // User A's record now holds A's saved position.
          expect(store.get(storeKey(userA, videoId)).positionSeconds).toBe(posA);
        }
      ),
      RUNS
    );
  });

  it("a fetch for user A scopes to A and never returns user B's record", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        objectIdArb,
        objectIdArb,
        positionArb,
        positionArb,
        fc.boolean(),
        async (userA, userB, videoId, posA, posB, aHasRecord) => {
          fc.pre(userA !== userB);
          // Make the two stored values distinguishable so a leak is detectable.
          fc.pre(posA !== posB);
          resetState();

          // User B always has a stored record; user A only sometimes does.
          store.set(storeKey(userB, videoId), {
            user: userB,
            video: videoId,
            positionSeconds: posB,
          });
          if (aHasRecord) {
            store.set(storeKey(userA, videoId), {
              user: userA,
              video: videoId,
              positionSeconds: posA,
            });
          }

          // Fetch for A, with B's id smuggled into params/body/query.
          const { res, err } = await runController(
            getProgress,
            reqFor(userA, userB, videoId, posA)
          );
          expect(err).toBeUndefined();

          // Every WatchProgress query was scoped to A + this video.
          expect(wpCalls.length).toBeGreaterThan(0);
          for (const call of wpCalls) {
            expect(String(call.filter.user)).toBe(userA);
            expect(String(call.filter.user)).not.toBe(userB);
            expect(String(call.filter.video)).toBe(videoId);
          }

          // The response reflects A's state, never B's stored value.
          const returned = res.body.data;
          if (aHasRecord) {
            expect(returned.positionSeconds).toBe(posA);
          } else {
            expect(returned.positionSeconds).toBeNull();
          }
          expect(returned.positionSeconds).not.toBe(posB);

          // B's record is never mutated by A's read.
          expect(store.get(storeKey(userB, videoId)).positionSeconds).toBe(posB);
        }
      ),
      RUNS
    );
  });

  it("the acting user is derived from req.user even when the request body/params claim another user", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        objectIdArb,
        objectIdArb,
        positionArb,
        async (userA, userB, videoId, posA) => {
          fc.pre(userA !== userB);
          resetState();

          // Save and fetch as A while every client-controlled field names B.
          await runController(saveProgress, reqFor(userA, userB, videoId, posA));
          await runController(getProgress, reqFor(userA, userB, videoId, posA));

          // No operation was ever scoped to the client-supplied user id.
          for (const call of wpCalls) {
            expect(String(call.filter.user)).toBe(userA);
            expect(String(call.filter.user)).not.toBe(userB);
          }
          // Nothing was written under B's key.
          expect(store.has(storeKey(userB, videoId))).toBe(false);
        }
      ),
      RUNS
    );
  });
});
