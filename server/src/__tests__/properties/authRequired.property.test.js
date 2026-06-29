/**
 * Feature: phase-2-quality-hardening, Property 4: Authentication is required on
 * mutating endpoints.
 *
 * Validates: Requirements 1.1, 1.4
 * (Phase-1 design Property 4 — Validates Requirements 2.2)
 *
 * For any request to a mutating endpoint that omits a token or presents an
 * invalid/expired token, `verifyJWT` forwards HTTP 401, the controller is never
 * reached, and no persisted state changes.
 *
 * `jsonwebtoken` and the `User` model are mocked, so no real token verification
 * or DB lookup occurs. `verifyJWT` is wrapped in `asyncHandler`, which forwards
 * thrown `ApiError`s via `next(err)`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("jsonwebtoken", () => ({ default: { verify: vi.fn() } }));
vi.mock("../../models/user.model.js", () => ({ User: { findById: vi.fn() } }));

import jwt from "jsonwebtoken";
import { User } from "../../models/user.model.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { ApiError } from "../../utils/ApiError.js";

const RUNS = { numRuns: 200 };

// Build a request whose token-bearing surfaces (cookie + Authorization header)
// are controlled by the generator.
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

// Run verifyJWT to completion (it is async via asyncHandler). Returns the
// captured next() argument and a controller spy.
async function runVerify(req) {
  const controller = vi.fn();
  let captured;
  const next = vi.fn((err) => {
    captured = err;
    if (!err) controller(req);
  });

  verifyJWT(req, {}, next);
  // asyncHandler resolves a promise then calls next; flush microtasks.
  await new Promise((r) => setImmediate(r));

  return { next, controller, captured };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Property 4: authentication is required on mutating endpoints", () => {
  it("missing token -> 401, controller never reached", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        const req = makeReq({ cookieToken: undefined, headerToken: undefined });
        const { controller, captured } = await runVerify(req);

        expect(captured).toBeInstanceOf(ApiError);
        expect(captured.statusCode).toBe(401);
        expect(controller).not.toHaveBeenCalled();
        // No token => verification was never attempted.
        expect(jwt.verify).not.toHaveBeenCalled();
        expect(req.user).toBeUndefined();
      }),
      { numRuns: 50 },
    );
  });

  it("invalid/expired token -> 401, controller never reached, no user attached", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 40 }),
        // Some tokens fail at verify; some "verify" but reference a missing user.
        fc.boolean(),
        async (token, verifyThrows) => {
          vi.clearAllMocks();

          if (verifyThrows) {
            jwt.verify.mockImplementation(() => {
              throw new Error("jwt expired");
            });
          } else {
            jwt.verify.mockReturnValue({ _id: "deadbeefdeadbeefdeadbeef" });
            // No such user -> verifyJWT must still reject with 401.
            User.findById.mockReturnValue({
              select: vi.fn().mockResolvedValue(null),
            });
          }

          const req = makeReq({ cookieToken: undefined, headerToken: token });
          const { controller, captured } = await runVerify(req);

          expect(captured).toBeInstanceOf(ApiError);
          expect(captured.statusCode).toBe(401);
          expect(controller).not.toHaveBeenCalled();
          expect(req.user).toBeUndefined();
        },
      ),
      RUNS,
    );
  });
});
