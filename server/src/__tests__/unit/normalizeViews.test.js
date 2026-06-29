/**
 * normalizeViews.test.js — Unit test for per-document failure reporting in the
 * one-time view-count consolidation routine (Task 5.2).
 *
 * Validates: Requirements 4.9
 *
 * `normalizeViews` is imported directly; the module guards its CLI `main()`
 * behind an `import.meta.url === pathToFileURL(process.argv[1]).href` check, so
 * importing it for tests neither connects to Mongo nor calls process.exit.
 *
 * The Video model is mocked so `Video.find().lean().cursor()` yields three fake
 * docs (some carrying a legacy `view` field) and `Video.updateOne` rejects for
 * ONE specific `_id` and resolves for the others. The db connector, DNS config,
 * and logger are mocked to keep the import side-effect free and quiet.
 *
 * Asserts:
 *  - the failing `_id` is reported in summary.failedIds,
 *  - the other documents are updated (summary.updated count),
 *  - processing continued past the failure (all docs processed),
 *  - the failing document's update was actually attempted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock fns shared with the vi.mock factories ───────────────────────
const { videoFind, videoUpdateOne } = vi.hoisted(() => ({
  videoFind: vi.fn(),
  videoUpdateOne: vi.fn(),
}));

vi.mock("../../models/video.model.js", () => ({
  Video: { find: videoFind, updateOne: videoUpdateOne },
}));
// Keep the import free of real side effects (no DB connect / DNS mutation / logs).
vi.mock("../../db/index.js", () => ({ default: vi.fn() }));
vi.mock("../../config/dns.js", () => ({
  configureDns: vi.fn(),
  parseDnsServers: vi.fn(() => []),
}));
vi.mock("../../config/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { normalizeViews } = await import("../../scripts/normalizeViews.js");

/** Build a Mongoose-cursor-like object that yields docs then null. */
function makeCursor(docs) {
  let i = 0;
  return {
    next: vi.fn(async () => (i < docs.length ? docs[i++] : null)),
  };
}

const FAILING_ID = "doc-fail";

beforeEach(() => {
  videoFind.mockReset();
  videoUpdateOne.mockReset();
});

describe("normalizeViews — per-document failure reporting (Req 4.9)", () => {
  it("reports the failed _id, updates the rest, and continues past the failure", async () => {
    const docs = [
      { _id: "doc-a", view: 5, views: 2 }, // legacy > canonical
      { _id: FAILING_ID, view: 3 }, // only legacy `view`; its update will reject
      { _id: "doc-c", view: 10, views: 10 }, // equal
    ];

    videoFind.mockReturnValue({
      lean: () => ({ cursor: () => makeCursor(docs) }),
    });

    videoUpdateOne.mockImplementation(async (filter) => {
      if (String(filter._id) === FAILING_ID) {
        throw new Error("simulated write failure");
      }
      return { acknowledged: true, modifiedCount: 1 };
    });

    const summary = await normalizeViews();

    // All three docs were processed (continued past the failure).
    expect(summary.processed).toBe(3);

    // Two succeeded; one failed.
    expect(summary.updated).toBe(2);
    expect(summary.failedIds).toEqual([FAILING_ID]);

    // The failing document's update was actually attempted.
    expect(videoUpdateOne).toHaveBeenCalledTimes(3);
    const attemptedIds = videoUpdateOne.mock.calls.map((c) => String(c[0]._id));
    expect(attemptedIds).toContain(FAILING_ID);
    expect(attemptedIds).toContain("doc-a");
    expect(attemptedIds).toContain("doc-c");
  });
});
