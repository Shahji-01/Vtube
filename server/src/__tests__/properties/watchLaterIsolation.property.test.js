/**
 * Feature: phase-3-viewer-features, Property 10: Watch Later list is strictly user-scoped
 *
 * Property 10: For any two distinct users with arbitrary Watch Later entries,
 * the list endpoint returns exactly the requesting user's videos and never any
 * video belonging only to the other user. The query filter is always derived
 * from req.user._id — never from client-supplied input.
 *
 * Validates: Requirements 4.8, 6.5
 *
 * The WatchLater model is mocked so that find(filter) returns a chainable query
 * object: .sort() returns the same query, .populate() resolves to the in-memory
 * entries filtered by filter.user. We seed disjoint video sets for user A and
 * user B (plus randomized counts/ids), then invoke the real listWatchLater with
 * req.user._id = A and assert the returned list contains exactly A's videos and
 * none of B's; we also assert find was called with { user: A }. The symmetric
 * check is performed for B's view excluding A's.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// ── Hoisted mock fns shared with the vi.mock factories ───────────────────────
const { entries, watchLaterFind } = vi.hoisted(() => {
    // Shared in-memory entries array; each entry is { user, video }.
    const entries = [];
    return {
        entries,
        // find(filter) returns a chainable query: .sort() -> this,
        // .populate() -> resolves to the entries matching filter.user.
        watchLaterFind: vi.fn((filter) => {
            const query = {
                sort: vi.fn(() => query),
                populate: vi.fn(async () =>
                    entries.filter((e) => e.user === filter.user),
                ),
            };
            return query;
        }),
    };
});

vi.mock("../../models/watchLater.model.js", () => ({
    WatchLater: { find: watchLaterFind },
}));
vi.mock("../../models/video.model.js", () => ({
    Video: {},
}));

const { listWatchLater } = await import(
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
    entries.length = 0;
    watchLaterFind.mockClear();
});

describe("Property 10: Watch Later list is strictly user-scoped", () => {
    it("returns exactly the requesting user's videos and never the other user's", async () => {
        await fc.assert(
            fc.asyncProperty(
                // Two users plus disjoint video sets for each.
                fc.uniqueArray(objectIdArb, {
                    minLength: 2,
                    maxLength: 2,
                }),
                fc.uniqueArray(objectIdArb, { minLength: 0, maxLength: 8 }),
                fc.uniqueArray(objectIdArb, { minLength: 0, maxLength: 8 }),
                async ([userA, userB], rawVideosA, rawVideosB) => {
                    // Ensure the two users' video sets are disjoint so a leak is detectable.
                    const setA = new Set(rawVideosA);
                    const videosB = rawVideosB.filter((v) => !setA.has(v));
                    const videosA = rawVideosA;

                    // Fresh state per run.
                    entries.length = 0;
                    watchLaterFind.mockClear();

                    // Seed entries for both users, interleaved/randomized order.
                    for (const v of videosA) entries.push({ user: userA, video: v });
                    for (const v of videosB) entries.push({ user: userB, video: v });

                    // ── A's view ─────────────────────────────────────────────
                    const reqA = { user: { _id: userA } };
                    const resA = makeRes();
                    const nextA = await runHandler(listWatchLater, reqA, resA);

                    expect(nextA).not.toHaveBeenCalled();
                    expect(resA.status).toHaveBeenCalledWith(200);
                    expect(resA.payloads).toHaveLength(1);

                    // Filter derived from req.user, never client input.
                    expect(watchLaterFind).toHaveBeenCalledWith({ user: userA });

                    const listA = resA.payloads[0].data;
                    const listAVideos = listA.map((e) => e.video);
                    // Exactly A's videos, none of B's.
                    expect(new Set(listAVideos)).toEqual(new Set(videosA));
                    for (const e of listA) {
                        expect(e.user).toBe(userA);
                    }
                    for (const v of videosB) {
                        expect(listAVideos).not.toContain(v);
                    }

                    // ── B's view (symmetric) ─────────────────────────────────
                    watchLaterFind.mockClear();
                    const reqB = { user: { _id: userB } };
                    const resB = makeRes();
                    const nextB = await runHandler(listWatchLater, reqB, resB);

                    expect(nextB).not.toHaveBeenCalled();
                    expect(resB.status).toHaveBeenCalledWith(200);
                    expect(watchLaterFind).toHaveBeenCalledWith({ user: userB });

                    const listB = resB.payloads[0].data;
                    const listBVideos = listB.map((e) => e.video);
                    expect(new Set(listBVideos)).toEqual(new Set(videosB));
                    for (const e of listB) {
                        expect(e.user).toBe(userB);
                    }
                    for (const v of videosA) {
                        // A video belonging only to A must never appear in B's list.
                        if (!videosB.includes(v)) {
                            expect(listBVideos).not.toContain(v);
                        }
                    }
                },
            ),
            RUNS,
        );
    });
});
