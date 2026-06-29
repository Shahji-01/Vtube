/**
 * Feature: phase-4-social-discovery, Property 1: Socket handshake authenticates valid tokens into their own room and rejects bad tokens
 *
 * Validates: Requirements 1.2, 1.3, 1.4
 *
 * For ANY validly-signed, unexpired token (jwt.verify returns a decoded
 * `{ _id }` AND `User.findById(...).select(...)` resolves a user), the
 * `socketAuth` handshake middleware calls `next()` with NO error, attaches
 * `socket.user`, and the subsequent authenticated connection joins EXACTLY the
 * room `user:<userId>` and no other (R1.2, R1.4). For ANY bad token — none
 * present, `jwt.verify` throws (malformed / expired / wrong secret), or
 * `User.findById` resolves `null` (unknown user) — the middleware calls
 * `next(err)` where `err` is an `Error`, leaves `socket.user` unset, and joins
 * NO room (the connection handler never runs) (R1.3).
 *
 * The middleware is driven directly with a fake `socket` (whose `join` is a
 * spy), so no live network is needed. `jsonwebtoken` (`jwt.verify`) and the
 * `User` model (`User.findById(...).select(...)`) are mocked; `logger` is
 * mocked to keep test output clean. Room-join is asserted by invoking the real
 * exported `handleConnection` with the authenticated socket and checking the
 * single `socket.join` argument equals `roomFor(user._id)`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("jsonwebtoken", () => ({ default: { verify: vi.fn() } }));
vi.mock("../../models/user.model.js", () => ({ User: { findById: vi.fn() } }));
vi.mock("../../config/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import jwt from "jsonwebtoken";
import { User } from "../../models/user.model.js";
import {
  socketAuth,
  handleConnection,
  roomFor,
} from "../../socket/notificationSocket.js";

const RUNS = { numRuns: 150 };

// 24-char hex id, like a Mongo ObjectId string.
const objectIdArb = fc.hexaString({ minLength: 24, maxLength: 24 });

// Where the token rides in on the handshake. socketAuth checks, in order:
// handshake.auth.token, the Authorization: Bearer header, then the accessToken
// cookie — all three must authenticate identically.
const tokenSourceArb = fc.constantFrom("auth", "header", "cookie");

// A realistic, non-blank token: base64url/JWT-style characters only. Constrained
// to the real token input space so it survives cookie segment trimming and URI
// decoding unchanged (whitespace/`;`/`%` tokens are not valid bearer tokens).
// Its exact content is irrelevant since jwt.verify is mocked.
const tokenArb = fc
  .array(fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_."), {
    minLength: 1,
    maxLength: 60,
  })
  .map((chars) => chars.join(""));

// Build a fake socket whose token-bearing surface is controlled by `source`.
// `join`/`on` are spies; `id` is present for the connection handler's logging.
function makeSocket({ token, source }) {
  const handshake = { auth: {}, headers: {} };
  if (token !== undefined) {
    if (source === "auth") handshake.auth.token = token;
    else if (source === "header") handshake.headers.authorization = `Bearer ${token}`;
    else if (source === "cookie") handshake.headers.cookie = `accessToken=${token}`;
  }
  return {
    id: "socket-test-id",
    handshake,
    join: vi.fn(),
    on: vi.fn(),
  };
}

// Drive the async middleware to completion and capture next()'s argument.
async function runAuth(socket) {
  let captured;
  let called = false;
  const next = vi.fn((err) => {
    called = true;
    captured = err;
  });
  await socketAuth(socket, next);
  return { next, called, captured };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Property 1: socket handshake auth + room mapping", () => {
  it("valid token -> next() with no error, attaches user, joins exactly user:<id>", async () => {
    await fc.assert(
      fc.asyncProperty(objectIdArb, tokenArb, tokenSourceArb, async (userId, token, source) => {
        vi.clearAllMocks();

        const user = { _id: userId, username: `u_${userId.slice(0, 6)}` };
        jwt.verify.mockReturnValue({ _id: userId });
        User.findById.mockReturnValue({
          select: vi.fn().mockResolvedValue(user),
        });

        const socket = makeSocket({ token, source });
        const { next, captured } = await runAuth(socket);

        // next() called exactly once, with NO error.
        expect(next).toHaveBeenCalledTimes(1);
        expect(captured).toBeUndefined();
        // The authenticated user is attached to the socket.
        expect(socket.user).toBe(user);
        // The select() narrowed away credentials.
        expect(User.findById).toHaveBeenCalledWith(userId);

        // The subsequent connection handler joins EXACTLY its own room.
        handleConnection(socket);
        expect(socket.join).toHaveBeenCalledTimes(1);
        expect(socket.join).toHaveBeenCalledWith(roomFor(userId));
        expect(socket.join).toHaveBeenCalledWith(`user:${userId}`);
      }),
      RUNS,
    );
  });

  it("bad token (missing / verify throws / unknown user) -> next(Error), no user, no room joined", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("missing", "verifyThrows", "unknownUser"),
        objectIdArb,
        tokenArb,
        tokenSourceArb,
        async (kind, userId, token, source) => {
          vi.clearAllMocks();

          if (kind === "missing") {
            // No token presented on any handshake surface.
          } else if (kind === "verifyThrows") {
            jwt.verify.mockImplementation(() => {
              throw new Error("jwt malformed");
            });
          } else {
            // Token "verifies" but references a user that does not exist.
            jwt.verify.mockReturnValue({ _id: userId });
            User.findById.mockReturnValue({
              select: vi.fn().mockResolvedValue(null),
            });
          }

          const socket = makeSocket(
            kind === "missing"
              ? { token: undefined, source }
              : { token, source },
          );
          const { next, captured } = await runAuth(socket);

          // Rejected via next(err) where err is an Error.
          expect(next).toHaveBeenCalledTimes(1);
          expect(captured).toBeInstanceOf(Error);
          // No user attached, and NO room was joined (connection handler never runs).
          expect(socket.user).toBeUndefined();
          expect(socket.join).not.toHaveBeenCalled();
          // A missing token short-circuits before verification is attempted.
          if (kind === "missing") {
            expect(jwt.verify).not.toHaveBeenCalled();
          }
        },
      ),
      RUNS,
    );
  });
});
