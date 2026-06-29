// Feature: phase-4-social-discovery, Property 10: Pin/unpin lifecycle is owner-driven and bounded by the pin limit
//
// Validates: Requirements 3.2, 3.4, 3.5
//
// The REAL `pinComment` / `unpinComment` controllers are driven against a
// mocked `Comment` model backed by an in-memory store keyed by id (each doc is
// `{ _id, video, pinned, pinnedAt }`). The mock implements:
//   - findById(id)                        -> the stored comment (or null)
//   - countDocuments({ video, pinned })   -> count of matching comments
//   - findByIdAndUpdate(id, update, opts) -> applies pinned/pinnedAt, returns doc
// Because the route guard `verifyVideoOwnerOfComment` stashes the loaded comment
// on `req.resource`, we pass `req = { params:{ comment_Id }, resource, user }`
// (the controllers use `req.resource || findById`).
//
// Over randomized initial pinned-counts/states (no comment pinned, or exactly
// one pinned), we prove the lifecycle invariants:
//   * Pinning a non-pinned comment while the video has 0 pinned (under the
//     Pin_Limit of 1) marks it pinned and responds 200 (R3.2).
//   * Pinning a DIFFERENT non-pinned comment when 1 is already pinned -> 409
//     (ApiError statusCode 409) and the pinned count stays 1 (R3.4).
//   * Pinning an ALREADY-pinned comment is an idempotent 200, count unchanged
//     (R3.2).
//   * Unpinning a pinned comment clears it (re-read pinned:false), responds 200,
//     and unpinning again stays unpinned (idempotent, R3.5).
//
// The asyncHandler wrapper is fire-and-forget, so each invocation resolves a
// deferred when either `res.json` (success) or `next` (error) fires — exactly
// one of which happens per request. The 409 is asserted via the `next` spy.

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { isValidObjectId } from "mongoose";

// ── Hoisted in-memory store + mocked Comment model ───────────────────────────
const { store, commentModel } = vi.hoisted(() => {
  const store = { map: new Map() };

  return {
    store,
    commentModel: {
      findById: vi.fn(async (id) => store.map.get(String(id)) ?? null),

      countDocuments: vi.fn(async (filter = {}) => {
        let count = 0;
        for (const c of store.map.values()) {
          if (String(c.video) === String(filter.video) && c.pinned === filter.pinned) {
            count++;
          }
        }
        return count;
      }),

      findByIdAndUpdate: vi.fn(async (id, update = {}) => {
        const c = store.map.get(String(id));
        if (!c) return null;
        if (Object.prototype.hasOwnProperty.call(update, "pinned")) c.pinned = update.pinned;
        if (Object.prototype.hasOwnProperty.call(update, "pinnedAt")) c.pinnedAt = update.pinnedAt;
        return c;
      }),
    },
  };
});

vi.mock("../../models/comment.model.js", () => ({
  Comment: commentModel,
}));

const { pinComment, unpinComment } = await import("../../controllers/comment.controller.js");

// ── Generators ───────────────────────────────────────────────────────────────
const objectIdArb = fc
  .hexaString({ minLength: 24, maxLength: 24 })
  .filter((s) => isValidObjectId(s));

// A video with 2–6 distinct comment ids, optionally one of them already pinned.
const scenarioArb = fc
  .record({
    videoId: objectIdArb,
    ownerId: objectIdArb,
    commentIds: fc.uniqueArray(objectIdArb, { minLength: 2, maxLength: 6 }),
  })
  .chain((base) =>
    fc.record({
      ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, fc.constant(v)])),
      // null -> none pinned (count 0); index -> that comment starts pinned (count 1).
      initialPinnedIndex: fc.option(
        fc.integer({ min: 0, max: base.commentIds.length - 1 }),
        { nil: null },
      ),
    }),
  );

// ── Helpers ──────────────────────────────────────────────────────────────────
// Invoke an asyncHandler-wrapped controller; resolve when res.json or next fires.
function invoke(handler, comment, ownerId) {
  return new Promise((resolve) => {
    let status;
    const res = {
      status(s) {
        status = s;
        return this;
      },
      json(payload) {
        resolve({ outcome: "response", status, payload });
        return this;
      },
    };
    handler(
      { params: { comment_Id: comment._id }, resource: comment, user: { _id: ownerId } },
      res,
      (err) => resolve({ outcome: "next", error: err }),
    );
  });
}

// Count pinned comments for a video directly from the store.
function pinnedCount(videoId) {
  let n = 0;
  for (const c of store.map.values()) {
    if (String(c.video) === String(videoId) && c.pinned === true) n++;
  }
  return n;
}

describe("Property 10: pin/unpin lifecycle is owner-driven and bounded by the pin limit", () => {
  it("respects the pin limit, is idempotent for pin/unpin, and clears state on unpin", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ videoId, ownerId, commentIds, initialPinnedIndex }) => {
        // ── Fresh store per run ──────────────────────────────────────────────
        store.map.clear();
        commentModel.findById.mockClear();
        commentModel.countDocuments.mockClear();
        commentModel.findByIdAndUpdate.mockClear();

        const comments = commentIds.map((id, i) => ({
          _id: id,
          video: videoId,
          pinned: initialPinnedIndex === i,
          pinnedAt: initialPinnedIndex === i ? new Date() : null,
        }));
        for (const c of comments) store.map.set(String(c._id), c);

        const initialPinned = initialPinnedIndex == null ? 0 : 1;
        expect(pinnedCount(videoId)).toBe(initialPinned);

        // ── Op 1: pin a non-pinned target ───────────────────────────────────
        const target = comments.find((c) => !c.pinned);
        expect(target).toBeDefined();

        const r1 = await invoke(pinComment, target, ownerId);

        if (initialPinned === 0) {
          // Under the limit -> success, marks pinned, count becomes 1 (R3.2).
          expect(r1.outcome).toBe("response");
          expect(r1.status).toBe(200);
          expect(store.map.get(String(target._id)).pinned).toBe(true);
          expect(pinnedCount(videoId)).toBe(1);
        } else {
          // Already at the limit -> 409, target stays unpinned, count stays 1 (R3.4).
          expect(r1.outcome).toBe("next");
          expect(r1.error).toBeDefined();
          expect(r1.error.statusCode).toBe(409);
          expect(store.map.get(String(target._id)).pinned).toBe(false);
          expect(pinnedCount(videoId)).toBe(1);
        }

        // After Op 1 the video has exactly one pinned comment.
        expect(pinnedCount(videoId)).toBe(1);
        const pinned = comments.find((c) => c.pinned);
        expect(pinned).toBeDefined();

        // ── Op 2: pin the ALREADY-pinned comment -> idempotent 200 (R3.2) ────
        const r2 = await invoke(pinComment, pinned, ownerId);
        expect(r2.outcome).toBe("response");
        expect(r2.status).toBe(200);
        expect(store.map.get(String(pinned._id)).pinned).toBe(true);
        expect(pinnedCount(videoId)).toBe(1);

        // ── Op 3: unpin the pinned comment -> clears, 200 (R3.5) ─────────────
        const r3 = await invoke(unpinComment, pinned, ownerId);
        expect(r3.outcome).toBe("response");
        expect(r3.status).toBe(200);
        expect(store.map.get(String(pinned._id)).pinned).toBe(false);
        expect(pinnedCount(videoId)).toBe(0);

        // ── Op 4: unpin again -> idempotent, stays unpinned, 200 (R3.5) ──────
        const r4 = await invoke(unpinComment, pinned, ownerId);
        expect(r4.outcome).toBe("response");
        expect(r4.status).toBe(200);
        expect(store.map.get(String(pinned._id)).pinned).toBe(false);
        expect(pinnedCount(videoId)).toBe(0);
      }),
      { numRuns: 150 },
    );
  });
});
