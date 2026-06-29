/**
 * Task 5.11 — Edge / integration tests for the new Phase 3 watch endpoints.
 *
 * Validates: Requirements 3.5, 3.7, 4.4
 *
 * Example-based (NOT property-based) edge coverage for the watch-progress and
 * watch-later controllers, driven directly with mock req/res/next using the
 * asyncHandler-flush pattern from the sibling property suites. The Mongoose
 * models are mocked (no real DB I/O):
 *
 *   1. saveProgress  — valid ObjectId matching NO video → ApiError 404, no write (R3.5)
 *   2. getProgress   — valid ObjectId matching NO video → ApiError 404           (R3.5)
 *   3. addToWatchLater — valid ObjectId matching NO video → ApiError 404, no insert (R4.4)
 *   4. getProgress   — video exists but user has NO stored record →
 *                      success ApiResponse with data.positionSeconds === null    (R3.7)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock fns shared with the vi.mock factories ───────────────────────
const {
    videoFindById,
    watchProgressFindOneAndUpdate,
    watchProgressFindOne,
    watchLaterFindOneAndUpdate,
    watchLaterFindOne,
} = vi.hoisted(() => ({
    videoFindById: vi.fn(),
    watchProgressFindOneAndUpdate: vi.fn(),
    watchProgressFindOne: vi.fn(),
    watchLaterFindOneAndUpdate: vi.fn(),
    watchLaterFindOne: vi.fn(),
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
vi.mock("../../models/watchLater.model.js", () => ({
    WatchLater: {
        findOneAndUpdate: watchLaterFindOneAndUpdate,
        findOne: watchLaterFindOne,
    },
}));

const { saveProgress, getProgress } = await import(
    "../../controllers/watchProgress.controller.js"
);
const { addToWatchLater } = await import(
    "../../controllers/watchLater.controller.js"
);

// A syntactically valid 24-hex ObjectId used across the cases.
const VALID_VIDEO_ID = "deadbeefdeadbeefdeadbeef";
const USER_ID = "feedfacefeedfacefeedface";

/** Flush queued micro/macro tasks so asyncHandler's catch chain settles. */
async function flush() {
    for (let i = 0; i < 6; i++) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setImmediate(resolve));
    }
}

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

/** Invoke the asyncHandler-wrapped controller and return the captured spies. */
async function runHandler(handler, req) {
    const res = makeRes();
    const next = vi.fn();
    handler(req, res, next);
    await flush();
    return { next, res };
}

beforeEach(() => {
    videoFindById.mockReset();
    watchProgressFindOneAndUpdate.mockReset();
    watchProgressFindOne.mockReset();
    watchLaterFindOneAndUpdate.mockReset();
    watchLaterFindOne.mockReset();
});

describe("watch endpoints — edge cases (Requirements 3.5, 3.7, 4.4)", () => {
    it("saveProgress: valid ObjectId matching no video → 404 ApiError and no write (R3.5)", async () => {
        videoFindById.mockResolvedValue(null);

        const req = {
            params: { videoId: VALID_VIDEO_ID },
            user: { _id: USER_ID },
            body: { positionSeconds: 12 },
        };
        const { next, res } = await runHandler(saveProgress, req);

        const err = next.mock.calls[0]?.[0];
        expect(err).toBeDefined();
        expect(err.statusCode).toBe(404);
        // No write and no success response was emitted.
        expect(watchProgressFindOneAndUpdate).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it("getProgress: valid ObjectId matching no video → 404 ApiError (R3.5)", async () => {
        videoFindById.mockResolvedValue(null);

        const req = {
            params: { videoId: VALID_VIDEO_ID },
            user: { _id: USER_ID },
        };
        const { next, res } = await runHandler(getProgress, req);

        const err = next.mock.calls[0]?.[0];
        expect(err).toBeDefined();
        expect(err.statusCode).toBe(404);
        // No record read for a non-existent video, and no success response.
        expect(watchProgressFindOne).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it("addToWatchLater: valid ObjectId matching no video → 404 ApiError and no insert (R4.4)", async () => {
        videoFindById.mockResolvedValue(null);

        const req = {
            params: { videoId: VALID_VIDEO_ID },
            user: { _id: USER_ID },
        };
        const { next, res } = await runHandler(addToWatchLater, req);

        const err = next.mock.calls[0]?.[0];
        expect(err).toBeDefined();
        expect(err.statusCode).toBe(404);
        // The Watch_Later_List is left unchanged: no insert/upsert occurred.
        expect(watchLaterFindOneAndUpdate).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it("getProgress: existing video but no stored record → 200 ApiResponse with positionSeconds null (R3.7)", async () => {
        // The video exists, but the requesting user has no WatchProgress record.
        videoFindById.mockResolvedValue({ _id: VALID_VIDEO_ID, duration: 300 });
        watchProgressFindOne.mockResolvedValue(null);

        const req = {
            params: { videoId: VALID_VIDEO_ID },
            user: { _id: USER_ID },
        };
        const { next, res } = await runHandler(getProgress, req);

        // No error path; a success ApiResponse is returned.
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.payloads).toHaveLength(1);

        const body = res.payloads[0];
        expect(body.statusCode).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual({ positionSeconds: null });
        // The read was strictly scoped to the requesting user.
        expect(watchProgressFindOne).toHaveBeenCalledWith({
            user: USER_ID,
            video: VALID_VIDEO_ID,
        });
    });
});
