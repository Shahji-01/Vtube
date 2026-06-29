// ---------------------COMMENT VALIDATION SCHEMAS-----------------------------
//
// Per-route validation schemas for the comments router, consumed by the
// centralized `validate(schema)` middleware. Each schema is shaped
// `{ params?, query?, body? }` mapping a field name to a rule (or array of
// rules) from `./validators.js`.
//
// Field names mirror exactly what `comment.controller.js` reads:
//   - params: `video_Id`, `comment_Id`
//   - body:   `commentContent` (addComment), `newComment` (updateComment),
//             `parentComment` (optional reply target)
//
// Requirements: 1.6, 1.7, 1.10, 2.1, 3.6, 3.7

import { isObjectId, required, nonBlank, maxLen, optional } from "./validators.js";

const MAX_COMMENT_LENGTH = 5000;

/** Allowed values for the comment-list `sort` query param. */
const COMMENT_SORT_VALUES = ["top", "newest"];

/**
 * Local rule factory: value must be one of the supplied allowed values.
 * Returns `null` when acceptable, otherwise a short error fragment listing the
 * permitted values (combined with the field name by the `validate` middleware).
 * @param {...string} allowed - The permitted values.
 * @returns {Function} A rule `(value) => string | null`.
 */
const oneOf = (...allowed) => (v) =>
  allowed.includes(v) ? null : `must be one of: ${allowed.join(", ")}`;

/**
 * GET /:video_Id — fetch a video's top-level comments.
 * Validates the `video_Id` path param is a valid ObjectId. The optional `sort`
 * query param, when present, must be one of `top` or `newest` (the controller
 * defaults to `newest` when omitted).
 */
export const getVideoCommentsSchema = {
  params: { video_Id: isObjectId },
  query: { sort: optional(oneOf(...COMMENT_SORT_VALUES)) },
};

/**
 * POST /:video_Id — add a comment to a video.
 * Requires a non-empty `commentContent` (≤ 5000 chars). `parentComment`, when
 * supplied, must be a valid ObjectId (optional reply target).
 */
export const addCommentSchema = {
  params: { video_Id: isObjectId },
  body: {
    commentContent: [required, nonBlank, maxLen(MAX_COMMENT_LENGTH)],
    parentComment: optional(isObjectId),
  },
};

/**
 * PATCH /c/:comment_Id — update an existing comment.
 * Validates the `comment_Id` param. Accepts the unified `commentContent` field
 * (primary) while still tolerating the legacy `newComment` field for backward
 * compatibility. Both are optional at the schema level — when supplied they must
 * be non-blank and ≤ 5000 chars (same rules as addComment). The controller's
 * `resolveCommentContent` enforces that at least one carries non-blank content,
 * rejecting an otherwise-empty update with HTTP 400 naming the comment content
 * field (Req 5.1, 5.2, 5.3, 5.5).
 */
export const updateCommentSchema = {
  params: { comment_Id: isObjectId },
  body: {
    commentContent: optional(nonBlank, maxLen(MAX_COMMENT_LENGTH)),
    newComment: optional(nonBlank, maxLen(MAX_COMMENT_LENGTH)),
  },
};

/**
 * DELETE /c/:comment_Id — delete a comment.
 * Validates the `comment_Id` param is a valid ObjectId.
 */
export const deleteCommentSchema = {
  params: { comment_Id: isObjectId },
};

/**
 * GET /replies/:comment_Id — fetch replies to a comment.
 * Validates the `comment_Id` param is a valid ObjectId.
 */
export const getCommentRepliesSchema = {
  params: { comment_Id: isObjectId },
};

/**
 * PATCH /c/:comment_Id/pin (and the corresponding unpin route) — pin/unpin a
 * comment. Validates the pin/unpin route param `comment_Id` is a valid ObjectId.
 */
export const pinParam = {
  params: { comment_Id: isObjectId },
};
