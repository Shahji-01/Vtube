/**
 * Feature: phase-3-viewer-features, Property 5: Invalid positionSeconds is rejected with no write
 *
 * Validates: Requirements 3.4
 *
 * Property 5: Invalid positionSeconds is rejected with no write.
 *
 * For any `positionSeconds` that is NOT a finite number (NaN, Infinity,
 * -Infinity, non-number types), is negative, or exceeds the target video's
 * stored `duration`, the Progress_Save_Endpoint rejects the request with HTTP
 * status 400 (an ApiError carrying statusCode 400) and performs NO write to the
 * WatchProgress collection.
 *
 * Strategy (mocked-model + controller-invocation, per the Phase 2
 * `ownership.property.test.js` style): the `Video` and `WatchProgress` models
 * are mocked via `vi.mock` so no real DB I/O happens. `Video.findById` returns a
 * video with a known `duration`; the `WatchProgress.findOneAndUpdate` write
 * method is a spy we assert was NEVER called for invalid input. The real
 * `saveProgress` controller (wrapped in asyncHandler) is driven with a fake req;
 * asyncHandler forwards the thrown ApiError to `next`, which we capture.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// ── Hoisted mock fns shared with the vi.mock factories ───────────────────────
const { videoFindById, watchProgressFindOneAndUpdate, watchProgressFindOne } =
  vi.hoisted(() => ({
    videoFindById: vi.fn(),
    watchProgressFindOneAndUpdate: vi.fn(),
    watchProgressFindOne: vi.fn(),
  }));

vi.mock("../../models/video.model.js", () => ({
  Video: { findById: videoFindById },
}));
vi.mock("../../models/watchProgress.model.js", () => ({
  WatchProgress: {
    findOneAndUpdate: watchProgressFindOneAndUpdate,
    findOne: watchProgressFindOne,
  },
}));

const { saveProgress } = await import(
  "../../controllers/watchProgress.controller.js"
);

/** Flush queued micro/macro tasks so asyncHandler's catch chain settles. */
async function flush() {
  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Invoke the asyncHandler-wrapped handler and return the captured next spy. */
async function runHandler(handler, req) {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  const next = vi.fn();
  handler(req, res, next);
  await flush();
  return { next, res };
}

/** Build a fake save request scoped to a user/video with the given body. */
function makeReq(positionSeconds) {
  return {
    params: { videoId: "deadbeefdeadbeefdeadbeef" },
    user: { _id: "feedfacefeedfacefeedface" },
    body: { positionSeconds },
  };
}

beforeEach(() => {
  videoFindById.mockReset();
  watchProgressFindOneAndUpdate.mockReset();
  watchProgressFindOne.mockReset();
});

describe("Property 5: Invalid positionSeconds is rejected with no write", () => {
  // Valid stored durations the target video can carry (finite, positive).
  const durationArb = fc.double({
    min: 1,
    max: 100000,
    noNaN: true,
    noDefaultInfinity: true,
  });

  it("rejects non-finite positionSeconds (NaN / +/-Infinity) with 400 and no write", async () => {
    const nonFiniteArb = fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );

    await fc.assert(
      fc.asyncProperty(durationArb, nonFiniteArb, async (duration, position) => {
        videoFindById.mockResolvedValue({ _id: "v", duration });

        const { next, res } = await runHandler(saveProgress, makeReq(position));

        const err = next.mock.calls[0]?.[0];
        expect(err).toBeDefined();
        expect(err.statusCode).toBe(400);
        // NO write occurred and no success response was emitted.
        expect(watchProgressFindOneAndUpdate).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
      }),
      { numRuns: 120 },
    );
  });

  it("rejects non-number positionSeconds (wrong type) with 400 and no write", async () => {
    const nonNumberArb = fc.oneof(
      fc.string(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.array(fc.integer()),
      fc.object(),
    );

    await fc.assert(
      fc.asyncProperty(durationArb, nonNumberArb, async (duration, position) => {
        videoFindById.mockResolvedValue({ _id: "v", duration });

        const { next, res } = await runHandler(saveProgress, makeReq(position));

        const err = next.mock.calls[0]?.[0];
        expect(err).toBeDefined();
        expect(err.statusCode).toBe(400);
        expect(watchProgressFindOneAndUpdate).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
      }),
      { numRuns: 120 },
    );
  });

  it("rejects negative positionSeconds with 400 and no write", async () => {
    const negativeArb = fc.double({
      min: -100000,
      max: -Number.MIN_VALUE,
      noNaN: true,
      noDefaultInfinity: true,
    });

    await fc.assert(
      fc.asyncProperty(durationArb, negativeArb, async (duration, position) => {
        videoFindById.mockResolvedValue({ _id: "v", duration });

        const { next, res } = await runHandler(saveProgress, makeReq(position));

        const err = next.mock.calls[0]?.[0];
        expect(err).toBeDefined();
        expect(err.statusCode).toBe(400);
        expect(watchProgressFindOneAndUpdate).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
      }),
      { numRuns: 120 },
    );
  });

  it("rejects positionSeconds exceeding the video duration with 400 and no write", async () => {
    await fc.assert(
      fc.asyncProperty(
        durationArb,
        // A strictly-positive overshoot added on top of the duration.
        fc.double({
          min: Number.MIN_VALUE,
          max: 100000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        async (duration, overshoot) => {
          const position = duration + overshoot;
          fc.pre(Number.isFinite(position) && position > duration);
          videoFindById.mockResolvedValue({ _id: "v", duration });

          const { next, res } = await runHandler(saveProgress, makeReq(position));

          const err = next.mock.calls[0]?.[0];
          expect(err).toBeDefined();
          expect(err.statusCode).toBe(400);
          expect(watchProgressFindOneAndUpdate).not.toHaveBeenCalled();
          expect(res.json).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 120 },
    );
  });
});
