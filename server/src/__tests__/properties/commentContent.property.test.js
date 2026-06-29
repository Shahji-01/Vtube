import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolveCommentContent } from "../../services/commentContent.js";

// Feature: phase-2-quality-hardening, Property 16
// Property 16: Comment content resolution follows precedence and trims.
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
//
// For any request body, `resolveCommentContent(body)` returns:
//   - the trimmed `commentContent` when it is a non-blank string;
//   - otherwise the trimmed `newComment` when that is a non-blank string;
//   - otherwise `null`.
// The returned value (when non-null) has no leading/trailing whitespace and is
// non-empty, and `null` is returned exactly when both fields are absent, empty,
// or whitespace-only.

const NUM_RUNS = 200;

// Whitespace-only strings (incl. unicode no-break space, tabs, newlines).
const whitespaceArb = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v", "\u00a0", "\u2009"), {
    maxLength: 6,
  })
  .map((parts) => parts.join(""));

// A single field value: arbitrary strings incl. empty/whitespace-only, plus a
// few non-string values so the resolver's `typeof` guard is exercised too.
const fieldValueArb = fc.oneof(
  fc.string(),
  fc.constant(""),
  whitespaceArb,
  // strings guaranteed to carry real content after trimming
  fc.string({ minLength: 1 }).map((s) => `x${s}`),
  fc.constant(null),
  fc.integer(),
  fc.boolean()
);

// Build a body where each field may be present (with any value) or absent.
const bodyArb = fc
  .tuple(fc.boolean(), fieldValueArb, fc.boolean(), fieldValueArb)
  .map(([hasCc, ccVal, hasNc, ncVal]) => {
    const body = {};
    if (hasCc) body.commentContent = ccVal;
    if (hasNc) body.newComment = ncVal;
    return body;
  });

const isBlank = (v) => !(typeof v === "string" && v.trim().length > 0);

describe("Property 16: comment content resolution follows precedence and trims", () => {
  it("applies precedence, trims, and returns null exactly when both are blank/absent", () => {
    fc.assert(
      fc.property(bodyArb, (body) => {
        const result = resolveCommentContent(body);

        const cc = body.commentContent;
        const nc = body.newComment;
        const ccBlank = isBlank(cc);
        const ncBlank = isBlank(nc);

        // Precedence + trimming (Req 5.1, 5.2, 5.4).
        if (!ccBlank) {
          expect(result).toBe(cc.trim());
        } else if (!ncBlank) {
          expect(result).toBe(nc.trim());
        } else {
          expect(result).toBeNull();
        }

        // Non-null results carry no surrounding whitespace and are non-empty (Req 5.4, 5.5).
        if (result !== null) {
          expect(result).toBe(result.trim());
          expect(result.length).toBeGreaterThan(0);
        }

        // null exactly when both fields are blank/absent (Req 5.3).
        expect(result === null).toBe(ccBlank && ncBlank);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("returns null for non-object / absent bodies", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(undefined), fc.constant(null), fc.integer(), fc.string(), fc.boolean()),
        (body) => {
          // Strings/numbers/etc. expose no commentContent/newComment, so the
          // result must be null (both fields effectively absent).
          expect(resolveCommentContent(body)).toBeNull();
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
