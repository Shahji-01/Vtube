/**
 * Feature: phase-2-quality-hardening, Property 6: optionalJWT tolerates bad
 * tokens.
 *
 * Validates: Requirements 1.1, 1.4
 * (Phase-1 design Property 6 — Validates Requirements 2.6)
 *
 * For any invalid or expired token presented to an `optionalJWT` read endpoint,
 * the request proceeds as an anonymous caller: `next()` is called with no error
 * and no authenticated user is attached to `req.user`.
 *
 * `jsonwebtoken` and the `User` model are mocked — no real verification or DB
 * lookup occurs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("jsonwebtoken", () => ({ default: { verify: vi.fn() } }));
vi.mock("../../models/user.model.js", () => ({ User: { findById: vi.fn() } }));

import jwt from "jsonwebtoken";
import { User } from "../../models/user.model.js";
import { optionalJWT } from "../../middlewares/auth.middleware.js";

const RUNS = { numRuns: 200 };

function makeReq({ cookieToken, headerToken }) {
  return {
    cookies: cookieToken === undefined ? {} : { accessToken: cookieToken },
    header(name) {
      if (name === "Authorization" && headerToken !== undefined) {
        return `Bearer ${headerToken}`;
      }
      return undefined;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Property 6: optionalJWT tolerates bad tokens", () => {
  it("invalid/expired token -> proceeds with no error and no req.user", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 40 }),
        // The failure mode: verify throws (invalid/expired) in either source.
        fc.constantFrom("cookie", "header"),
        async (token, source) => {
          vi.clearAllMocks();
          jwt.verify.mockImplementation(() => {
            const err = new Error("jwt expired");
            err.name = "TokenExpiredError";
            throw err;
          });

          const req =
            source === "cookie"
              ? makeReq({ cookieToken: token, headerToken: undefined })
              : makeReq({ cookieToken: undefined, headerToken: token });

          const next = vi.fn();
          await optionalJWT(req, {}, next);

          // Proceeds exactly once with no error argument.
          expect(next).toHaveBeenCalledTimes(1);
          expect(next.mock.calls[0][0]).toBeUndefined();

          // No authenticated user attached; DB never consulted on a bad token.
          expect(req.user).toBeUndefined();
          expect(User.findById).not.toHaveBeenCalled();
        },
      ),
      RUNS,
    );
  });

  it("no token at all -> proceeds anonymously with no error", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        vi.clearAllMocks();
        const req = makeReq({ cookieToken: undefined, headerToken: undefined });
        const next = vi.fn();

        await optionalJWT(req, {}, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0]).toBeUndefined();
        expect(req.user).toBeUndefined();
        expect(jwt.verify).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});
