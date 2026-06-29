// ---------------------WATCH PROGRESS VALIDATION SCHEMAS-----------------------
//
// Per-route validation schemas for the watch-progress router, consumed by the
// centralized `validate(schema)` middleware. Each schema is shaped
// `{ params?, query?, body? }` mapping a field name to a rule (or array of
// rules) from `./validators.js`.
//
// Field names mirror exactly what `watchProgress.controller.js` reads:
//   - params: `videoId`
//   - body:   `positionSeconds`
//
// Scope note: the body rule enforces only that `positionSeconds` is present,
// finite, and `>= 0`. The upper bound (`positionSeconds > video.duration`) is
// enforced later in the controller, where the target video — and therefore its
// duration — is available. Keeping the upper bound out of the schema preserves
// the "no DB access before validation" guarantee for the cheap, video-free
// checks done here.
//
// Requirements: 3.3, 3.4, 6.2

import { isObjectId, required } from "./validators.js";

/**
 * Rule: value must be a finite number that is `>= 0`.
 *
 * Follows the reusable rule shape `(value) => string | null`: returns `null`
 * when the value is acceptable, or a short human-readable error fragment the
 * `validate` middleware prefixes with the field name (e.g.
 * "positionSeconds must be a non-negative number").
 *
 * @param {*} v - The value to check.
 * @returns {string|null} Error message or `null`.
 */
const isNonNegativeFiniteNumber = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0
    ? null
    : "must be a non-negative number";

/**
 * PUT|GET /:videoId — reject a malformed `videoId` with 400 before any database
 * access or video lookup. Rejection names the `videoId` field.
 */
export const videoIdParamSchema = {
  params: {
    videoId: isObjectId,
  },
};

/**
 * PUT /:videoId — save playback progress. Requires `positionSeconds` to be
 * present, a finite number, and `>= 0`. The `> video.duration` upper bound is
 * enforced in the controller where the video's duration is available.
 */
export const saveProgressBodySchema = {
  body: {
    positionSeconds: [required, isNonNegativeFiniteNumber],
  },
};
