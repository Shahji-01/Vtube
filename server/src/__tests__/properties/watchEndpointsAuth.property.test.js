/**
 * Feature: phase-3-viewer-features, Property 12: New mutating/reading routes require authentication
 *
 * Validates: Requirements 3.2, 4.2
 *
 * For ANY request to a new Phase 3 endpoint (watch-progress PUT/GET,
 * watch-later POST/DELETE/GET) that lacks a valid access token — no
 * Authorization header, no `accessToken` cookie, or a malformed/garbage token —
 * the shared `verifyJWT` middleware forwards an HTTP 401 `ApiError`, the
 * controller behind it is NEVER reached, and consequently no WatchProgress /
 * WatchLater record is created, updated, or deleted.
 *
 * The new routers all order middleware as `validate -> verifyJWT -> controller`,
 * so authentication is enforced by the real `verifyJWT` middleware exercised
 * here directly. `jsonwebtoken` and the `User` model are mocked (a malformed
 * token makes `jwt.verify` throw, which `asyncHandler` forwards as `next(err)`).
 * The `WatchProgress` and `WatchLater` models are mocked with call-recording
 * write spies so we can prove zero record changes occur on an unauthenticated
 * request, without any real DB I/O.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("jsonwebtoken", () => ({ default: { verify: vi.fn() } }));
vi.mock("../../models/user.model.js", () => ({ User: { findById: vi.fn() } }));

// Record-only model spies: any of these being called would mean a record
// changed (or was read) — on an unauthenticated request none must fire.
vi.mock("../../models/watchProgress.model.js", () => ({
  WatchProgress: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    deleteOne: vi.fn(),
  },
}));
vi.mock("../../models/watchLater.model.js", () => ({
  WatchLater: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

import jwt from "jsonwebtoken";
import { User } from "../../models/user.model.js";
import { WatchProgress } from "../../models/watchProgress.model.js";
import { WatchLater } from "../../models/watchLater.model.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { ApiError } from "../../utils/ApiError.js";

const RUNS = { numRuns: 200 };

// Every model method that could mutate or read a record. After an
// unauthenticated request, all of these must show zero calls.
function modelMethods() {
  return [
    WatchProgress.findOneAndUpdate,
    WatchProgress.findOne,
    WatchProgress.find,
    WatchProgress.create,
    WatchProgress.deleteOne,
    WatchLater.findOneAndUpdate,
    WatchLater.findOne,
    WatchLater.find,
    WatchLater.create,
    WatchLater.deleteOne,
    WatchLater.deleteMany,
  ];
}

function expectNoRecordChange() {
  for (const fn of modelMethods()) {
    expect(fn).not.toHaveBeenCalled();
  }
}

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

// Run verifyJWT to completion (it is async via asyncHandler). The next() spy
// only forwards to the controller spy when called without an error, exactly as
// Express would — so a 401 means the controller is never reached.
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

describe("Property 12: new Phase 3 routes require authentication", () => {
  it("missing token -> 401, controller never reached, no record change", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        vi.clearAllMocks();
        const req = makeReq({ cookieToken: undefined, headerToken: undefined });
        const { controller, captured } = await runVerify(req);

        expect(captured).toBeInstanceOf(ApiError);
        expect(captured.statusCode).toBe(401);
        expect(controller).not.toHaveBeenCalled();
        // No token => verification was never attempted.
        expect(jwt.verify).not.toHaveBeenCalled();
        expect(req.user).toBeUndefined();
        // No WatchProgress / WatchLater record was touched.
        expectNoRecordChange();
      }),
      { numRuns: 100 },
    );
  });

  it("malformed / invalid / expired token -> 401, controller never reached, no record change", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary garbage token presented via cookie or Authorization header.
        fc.string({ minLength: 1, maxLength: 60 }),
        fc.boolean(),
        // Some tokens fail at verify; some "verify" but reference a missing user.
        fc.boolean(),
        async (token, viaCookie, verifyThrows) => {
          vi.clearAllMocks();

          if (verifyThrows) {
            jwt.verify.mockImplementation(() => {
              throw new Error("jwt malformed");
            });
          } else {
            jwt.verify.mockReturnValue({ _id: "deadbeefdeadbeefdeadbeef" });
            // No such user -> verifyJWT must still reject with 401.
            User.findById.mockReturnValue({
              select: vi.fn().mockResolvedValue(null),
            });
          }

          const req = makeReq(
            viaCookie
              ? { cookieToken: token, headerToken: undefined }
              : { cookieToken: undefined, headerToken: token },
          );
          const { controller, captured } = await runVerify(req);

          expect(captured).toBeInstanceOf(ApiError);
          expect(captured.statusCode).toBe(401);
          expect(controller).not.toHaveBeenCalled();
          expect(req.user).toBeUndefined();
          // No WatchProgress / WatchLater record was created, updated, or deleted.
          expectNoRecordChange();
        },
      ),
      RUNS,
    );
  });
});
