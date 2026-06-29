/**
 * Comment content field resolution (Req 5).
 *
 * Pure helper used by `updateComment` (and the comment validator) to unify the
 * comment-text field across the create/update endpoints. Precedence:
 *   1. `commentContent` when it is a non-blank string (trimmed)
 *   2. `newComment` when it is a non-blank string (trimmed) — backward compatible
 *   3. `null` when neither field carries non-blank content
 *
 * No I/O; safe to call with any value for `body`.
 */
export function resolveCommentContent(body) {
  const cc = typeof body?.commentContent === "string" ? body.commentContent.trim() : "";
  if (cc.length > 0) return cc;

  const nc = typeof body?.newComment === "string" ? body.newComment.trim() : "";
  if (nc.length > 0) return nc;

  return null;
}
