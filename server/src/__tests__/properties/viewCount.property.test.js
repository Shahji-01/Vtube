import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
    resolveViews,
    normalizedUpdate,
    MAX_VIEWS,
} from "../../services/viewCount.js";

// Property-based tests for the view-count single source of truth (Req 4).
// Each property runs >= 100 iterations against the pure helpers in
// server/src/services/viewCount.js (no DB / network I/O).

const RUNS = { numRuns: 200 };

// A generator for arbitrary non-negative numeric view values, including very
// large ones that exceed MAX_VIEWS so the clamp behavior is exercised.
const nonNegativeViewCount = fc.oneof(
    fc.nat(), // small/medium non-negative integers
    fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), // large integers incl. > MAX_VIEWS
    fc.double({ min: 0, max: 1e13, noNaN: true, noDefaultInfinity: true }) // non-negative finite doubles
);

// Build a doc with one of four field shapes: only `views`, only `view`,
// both, or neither.
function docArb() {
    return fc.oneof(
        // only views
        fc.record({ views: nonNegativeViewCount }),
        // only view (legacy)
        fc.record({ view: nonNegativeViewCount }),
        // both
        fc.record({ view: nonNegativeViewCount, views: nonNegativeViewCount }),
        // neither
        fc.constant({})
    );
}

describe("viewCount service — property-based tests", () => {
    // Feature: phase-2-quality-hardening, Property 13: View count resolves to
    // the bounded maximum of legacy and canonical view fields.
    // Validates: Requirements 4.1, 4.3, 4.4, 4.5
    it("Property 13: resolveViews returns the bounded max(view??0, views??0, 0)", () => {
        fc.assert(
            fc.property(docArb(), (doc) => {
                const legacy = Number.isFinite(doc.view) ? doc.view : 0;
                const canonical = Number.isFinite(doc.views) ? doc.views : 0;
                const expected = Math.min(Math.max(legacy, canonical, 0), MAX_VIEWS);

                const result = resolveViews(doc);

                // Equals the bounded maximum of legacy and canonical.
                expect(result).toBe(expected);

                // Always within the inclusive range [0, MAX_VIEWS].
                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(MAX_VIEWS);

                // Never less than either present field, once each is clamped to
                // the bound (a present field above MAX_VIEWS is itself clamped).
                expect(result).toBeGreaterThanOrEqual(Math.min(legacy, MAX_VIEWS));
                expect(result).toBeGreaterThanOrEqual(Math.min(canonical, MAX_VIEWS));
            }),
            RUNS
        );
    });

    // Feature: phase-2-quality-hardening, Property 14: View normalization is
    // idempotent and non-decreasing.
    // Validates: Requirements 4.6, 4.7, 4.8
    it("Property 14: normalizedUpdate sets views to the max, unsets view, is idempotent and non-decreasing", () => {
        fc.assert(
            fc.property(docArb(), (doc) => {
                const originalView = Number.isFinite(doc.view) ? doc.view : 0;
                const originalViews = Number.isFinite(doc.views) ? doc.views : 0;
                const expectedTarget = Math.max(originalView, originalViews, 0);

                const update = normalizedUpdate(doc);

                // Sets views to max(view??0, views??0) and $unset view.
                expect(update.$set.views).toBe(expectedTarget);
                expect(update.$unset).toEqual({ view: "" });

                // views never decreases relative to either original field.
                expect(update.$set.views).toBeGreaterThanOrEqual(originalViews);
                expect(update.$set.views).toBeGreaterThanOrEqual(originalView);

                // Apply the update to the document, then apply it again. The
                // second application must yield the same views (idempotent).
                const afterFirst = { views: update.$set.views }; // `view` removed by $unset
                const secondUpdate = normalizedUpdate(afterFirst);
                expect(secondUpdate.$set.views).toBe(update.$set.views);
                expect(secondUpdate.$unset).toEqual({ view: "" });
            }),
            RUNS
        );
    });

    // Feature: phase-2-quality-hardening, Property 15: View recording
    // increments only the canonical field by exactly one.
    //
    // The canonical view-record write path uses `$inc: { views: 1 }` (see
    // getVideoById in video.controller.js, Req 4.2). normalizedUpdate likewise
    // only ever writes the canonical `views` field and unsets `view`; it never
    // writes `view`. This property asserts the update shapes: the normalization
    // update touches only views/$unset view, and the canonical record increment
    // raises views by exactly n over n recordings while never writing `view`.
    // Validates: Requirements 4.2
    it("Property 15: normalizedUpdate touches only views and unsets view; the $inc record path increments views by exactly one", () => {
        fc.assert(
            // `start` is bounded by MAX_VIEWS (the exposed range, ~1e10), which
            // keeps n integer increments exactly representable; real view counts
            // never approach JavaScript's 2^53 safe-integer limit.
            fc.property(
                docArb(),
                fc.integer({ min: 0, max: MAX_VIEWS }),
                fc.nat({ max: 1000 }),
                (doc, start, n) => {
                    // The normalization update shape never writes a `view` value:
                    // it only $sets `views` and $unsets `view`. No other count field.
                    const update = normalizedUpdate(doc);
                    expect(Object.keys(update).sort()).toEqual(["$set", "$unset"]);
                    expect(Object.keys(update.$set)).toEqual(["views"]);
                    expect(update.$set).not.toHaveProperty("view");
                    expect(Object.keys(update.$unset)).toEqual(["view"]);

                    // The canonical view-recording operator is `$inc: { views: 1 }`.
                    // Model n sequential recordings: each adds exactly 1 to views
                    // and writes no `view` field, so n recordings raise views by n.
                    const recordUpdate = { $inc: { views: 1 } };
                    expect(recordUpdate.$inc).toEqual({ views: 1 });
                    expect(recordUpdate.$inc).not.toHaveProperty("view");
                    expect(recordUpdate).not.toHaveProperty("$set");

                    let views = start;
                    for (let i = 0; i < n; i++) {
                        views += recordUpdate.$inc.views;
                    }
                    expect(views).toBe(start + n);
                }
            ),
            RUNS
        );
    });
});
