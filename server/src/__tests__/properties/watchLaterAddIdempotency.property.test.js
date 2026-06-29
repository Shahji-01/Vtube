/**
 * Feature: phase-3-viewer-features, Property 8: Watch Later add is idempotent
 *
 * Property 8: For any Authenticated_User and existing Video, adding the Video to
 * the Watch_Later_List one or more times produces the SAME single membership as
 * adding it once (at most one Watch_Later_Entry per {user, video}), and every add
 * response is a success ApiResponse reporting the Video present.
 *
 * Validates: Requirements 4.1, 4.5, 4.6
 *
 * The WatchLater model is mocked with an in-memory store keyed by `user|video`
 * whose findOneAndUpdate({user,video}, {$setOnInsert}, {upsert,new}) inserts only
 * when absent — mimicking the unique {user, video} index that makes add idempotent
 * at the DB layer. Video.findById returns an existing video so the controller never
 * 404s. The real addToWatchLater controller is invoked N times (N from fast-check)
 * for the same {user, video}; afterwards the store must hold exactly one entry for
 * that pair and each response must be a success ApiResponse indicating presence.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// ── Hoisted mock fns shared with the vi.mock factories ───────────────────────
const { store, watchLaterFindOneAndUpdate, watchLaterFindOne, videoFindById } =
    vi.hoisted(() => {
        const store = new Map();
        return {
            store,
            // Upsert that inserts only when the {user, video} key is absent,
            // exactly like the unique compound index guarantees. With
            // { new: true } it returns the (existing or newly inserted) doc.
            watchLaterFindOneAndUpdate: vi.fn(async (filter, update, options) => {
                const key = `${filter.user}|${filter.video}`;
                if (!store.has(key)) {
                    const inserted = { _id: `wl-${key}`, ...update.$setOnInsert };
                    store.set(key, inserted);
                }
                return store.get(key);
            }),
            watchLaterFindOne: vi.fn(async (filter) => {
                const key = `${filter.user}|${filter.video}`;
                return store.get(key) ?? null;
            }),
            videoFindById: vi.fn(),
        };
    });

vi.mock("../../models/watchLater.model.js", () => ({
    WatchLater: {
        findOneAndUpdate: watchLaterFindOneAndUpdate,
        findOne: watchLaterFindOne,
    },
}));
vi.mock("../../models/video.model.js", () => ({
    Video: { findById: videoFindById },
}));

const { addToWatchLater } = await import(
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
    watchLaterFindOneAndUpdate.mockClear();
    watchLaterFindOne.mockClear();
    videoFindById.mockReset();
});

describe("Property 8: Watch Later add is idempotent", () => {
    it("adding an existing video N>=1 times yields exactly one membership and every response reports it present", async () => {
        await fc.assert(
            fc.asyncProperty(
                objectIdArb,
                objectIdArb,
                fc.integer({ min: 1, max: 10 }),
                async (userId, videoId, n) => {
                    // Fresh store per run so each {user, video} starts absent.
                    store.clear();
                    watchLaterFindOneAndUpdate.mockClear();
                    // The target video always exists, so the controller never 404s.
                    videoFindById.mockResolvedValue({ _id: videoId, duration: 100 });

                    const key = `${userId}|${videoId}`;

                    // Add the SAME {user, video} N times via the real controller.
                    for (let i = 0; i < n; i++) {
                        const req = {
                            params: { videoId },
                            user: { _id: userId },
                        };
                        const res = makeRes();
                        // eslint-disable-next-line no-await-in-loop
                        const next = await runHandler(addToWatchLater, req, res);

                        // No error path was taken for an existing video.
                        expect(next).not.toHaveBeenCalled();

                        // Each response is a success ApiResponse reporting presence.
                        expect(res.status).toHaveBeenCalledWith(200);
                        expect(res.payloads).toHaveLength(1);
                        const body = res.payloads[0];
                        expect(body.statusCode).toBe(200);
                        expect(body.success).toBe(true);
                        // The returned entry is the single membership for this pair.
                        expect(body.data).toBe(store.get(key));
                        expect(body.data.user).toBe(userId);
                        expect(body.data.video).toBe(videoId);
                    }

                    // At most one entry per {user, video}: adding N times == adding once.
                    expect(store.size).toBe(1);
                    expect(store.has(key)).toBe(true);

                    // Membership after N adds is identical to membership after one add.
                    const afterN = store.get(key);
                    expect(afterN.user).toBe(userId);
                    expect(afterN.video).toBe(videoId);
                },
            ),
            RUNS,
        );
    });
});
