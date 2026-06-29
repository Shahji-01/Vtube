/**
 * Feature: phase-3-viewer-features, Property 9: Watch Later remove is idempotent
 *
 * Property 9: For any Authenticated_User and Video, removing the Video from the
 * Watch_Later_List leaves the Video absent regardless of whether it was present
 * beforehand. Removing again leaves the list unchanged (still absent), and every
 * remove response is a success ApiResponse (status 200, success true).
 *
 * Validates: Requirements 4.7
 *
 * The WatchLater model is mocked with an in-memory store keyed by `user|video`
 * whose findOneAndDelete({user, video}) deletes the entry if present and is a
 * no-op otherwise — mirroring an idempotent delete at the DB layer. fast-check
 * randomizes whether the {user, video} pair starts present and how many remove
 * calls (1..N) are issued. The real removeFromWatchLater controller is invoked
 * via mock req/res/next; afterwards the pair must be absent in every case,
 * repeated removes must not error or disturb other users' entries, and each
 * response must be a success ApiResponse (status 200, success true).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// ── Hoisted mock fns shared with the vi.mock factories ───────────────────────
const { store, watchLaterFindOneAndDelete } = vi.hoisted(() => {
    const store = new Map();
    return {
        store,
        // Delete the {user, video} entry if present, returning the removed doc;
        // when absent it is a no-op returning null. This is idempotent: calling
        // it again on an already-absent pair changes nothing and still succeeds.
        watchLaterFindOneAndDelete: vi.fn(async (filter) => {
            const key = `${filter.user}|${filter.video}`;
            if (store.has(key)) {
                const removed = store.get(key);
                store.delete(key);
                return removed;
            }
            return null;
        }),
    };
});

vi.mock("../../models/watchLater.model.js", () => ({
    WatchLater: {
        findOneAndDelete: watchLaterFindOneAndDelete,
    },
}));

const { removeFromWatchLater } = await import(
    "../../controllers/watchLater.controller.js"
);

const RUNS = { numRuns: 150 };

/** Chainable res spy that records every json payload it receives. */
function makeRes() {
    const res = { payloads: [] };
    res.status = vi.fn(() => res);
    res.json = vi.fn((body) => {
        res.payloads.push(body);
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

/** Invoke the asyncHandler-wrapped controller once and return the next spy. */
async function runHandler(handler, req, res) {
    const next = vi.fn();
    handler(req, res, next);
    await flush();
    return next;
}

// 24-hex ObjectId-shaped strings for user and video ids.
const objectIdArb = fc.hexaString({ minLength: 24, maxLength: 24 });

beforeEach(() => {
    store.clear();
    watchLaterFindOneAndDelete.mockClear();
});

describe("Property 9: Watch Later remove is idempotent", () => {
    it("removing a video N>=1 times leaves it absent, never errors, and every response succeeds (200)", async () => {
        await fc.assert(
            fc.asyncProperty(
                objectIdArb,
                objectIdArb,
                fc.boolean(),
                fc.integer({ min: 1, max: 10 }),
                objectIdArb,
                async (userId, videoId, initiallyPresent, n, otherUserId) => {
                    // fast-check may pick otherUserId === userId; force it distinct so
                    // the "other user's entry untouched" assertion is meaningful.
                    fc.pre(otherUserId !== userId);

                    // Fresh store per run.
                    store.clear();
                    watchLaterFindOneAndDelete.mockClear();

                    const key = `${userId}|${videoId}`;
                    // A separate user's entry for the same video — must never be touched.
                    const otherKey = `${otherUserId}|${videoId}`;
                    const otherEntry = {
                        _id: `wl-${otherKey}`,
                        user: otherUserId,
                        video: videoId,
                    };
                    store.set(otherKey, otherEntry);

                    // Randomize whether the target pair starts present.
                    if (initiallyPresent) {
                        store.set(key, {
                            _id: `wl-${key}`,
                            user: userId,
                            video: videoId,
                        });
                    }

                    // Remove the SAME {user, video} N times via the real controller.
                    for (let i = 0; i < n; i++) {
                        const req = {
                            params: { videoId },
                            user: { _id: userId },
                        };
                        const res = makeRes();
                        // eslint-disable-next-line no-await-in-loop
                        const next = await runHandler(removeFromWatchLater, req, res);

                        // Remove never takes an error path — it succeeds either way.
                        expect(next).not.toHaveBeenCalled();

                        // Each response is a success ApiResponse with status 200.
                        expect(res.status).toHaveBeenCalledWith(200);
                        expect(res.payloads).toHaveLength(1);
                        const body = res.payloads[0];
                        expect(body.statusCode).toBe(200);
                        expect(body.success).toBe(true);

                        // After any remove the target pair is absent.
                        expect(store.has(key)).toBe(false);
                    }

                    // Regardless of initial presence or call count, the pair is absent.
                    expect(store.has(key)).toBe(false);

                    // Repeated removes never disturbed the other user's entry.
                    expect(store.get(otherKey)).toBe(otherEntry);
                },
            ),
            RUNS,
        );
    });
});
