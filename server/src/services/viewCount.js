/**
 * viewCount.js — View-count single source of truth (Req 4).
 *
 * Pure helpers, no I/O. The canonical field is `views`; the legacy `view`
 * field may persist on older documents. These helpers derive a bounded,
 * non-decreasing view count and produce an idempotent normalization update.
 */

// Upper bound for an exposed Views_Count (Req 4.3): inclusive 0 … 9,999,999,999.
const MAX_VIEWS = 9_999_999_999;

/**
 * Resolve the Views_Count for a video document as the bounded maximum of the
 * legacy `view` and canonical `views` fields (the read-time max() shim).
 *
 * - Only finite numeric values are considered; anything else counts as 0.
 * - The result is clamped to the inclusive range 0 … MAX_VIEWS.
 *
 * Req 4.1, 4.3, 4.4, 4.5.
 *
 * @param {{ view?: unknown, views?: unknown } | null | undefined} doc
 * @returns {number} the resolved, bounded view count
 */
export function resolveViews(doc) {
    const legacy = Number.isFinite(doc?.view) ? doc.view : 0;
    const canonical = Number.isFinite(doc?.views) ? doc.views : 0;
    return Math.min(Math.max(legacy, canonical, 0), MAX_VIEWS);
}

/**
 * Build the one-time normalization update for a video document: set the
 * canonical `views` to the greater of the two fields (never decreasing) and
 * remove the legacy `view` field. Applying this update repeatedly is
 * idempotent.
 *
 * Req 4.6, 4.7, 4.8.
 *
 * @param {{ view?: unknown, views?: unknown } | null | undefined} doc
 * @returns {{ $set: { views: number }, $unset: { view: string } }}
 */
export function normalizedUpdate(doc) {
    const target = Math.max(doc?.view ?? 0, doc?.views ?? 0, 0);
    return { $set: { views: target }, $unset: { view: "" } };
}

export { MAX_VIEWS };
