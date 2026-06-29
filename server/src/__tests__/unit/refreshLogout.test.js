/**
 * refreshLogout.test.js — Unit tests for refresh-token rotation persistence
 * failure, reuse/post-logout rejection, and logout revocation (Task 4.2).
 *
 * Validates: Requirements 8.6, 8.7, 8.8
 *
 * The User model, the tokenService (`rotateRefreshToken`), and `jsonwebtoken`
 * are all mocked via vi.mock so no real DB, crypto, or network I/O happens.
 * The asyncHandler-wrapped handlers are driven directly with mock req/res/next;
 * because asyncHandler swallows the handler promise and forwards rejections to
 * `next`, we flush pending tasks after invoking and inspect the `next` spy.
 *
 * Asserts:
 *  - Req 8.6: when rotateRefreshToken rejects, the handler surfaces a 500 server
 *    error and sets no new cookies (the prior token/cookie is left unchanged).
 *  - Req 8.8 / 8.3: an incoming refresh token that does not equal the stored
 *    token (including a post-logout token whose stored value was unset) is
 *    rejected with HTTP 401 and applies no rotation.
 *  - Req 8.7: logoutUser unsets the stored refreshToken (findByIdAndUpdate with
 *    $unset refreshToken) and clears both the refreshToken and accessToken cookies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock fns shared with the vi.mock factories ───────────────────────
const { jwtVerify } = vi.hoisted(() => ({ jwtVerify: vi.fn() }));
const { userModel } = vi.hoisted(() => ({
  userModel: {
    findById: vi.fn(),
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));
const { rotateRefreshToken } = vi.hoisted(() => ({ rotateRefreshToken: vi.fn() }));

vi.mock("jsonwebtoken", () => ({ default: { verify: jwtVerify } }));
vi.mock("../../models/user.model.js", () => ({ User: userModel }));
vi.mock("../../services/tokenService.js", () => ({ rotateRefreshToken }));

const { refreshAccessTooken, logoutUser } = await import(
  "../../controllers/user.controller.js"
);

/** Chainable res spy: status/cookie/clearCookie/json all return res. */
function makeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.cookie = vi.fn(() => res);
  res.clearCookie = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

/** Flush queued micro/macro tasks so asyncHandler's catch chain settles. */
async function flush() {
  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Invoke an asyncHandler-wrapped handler and return the next spy. */
async function runHandler(handler, req, res) {
  const next = vi.fn();
  handler(req, res, next);
  await flush();
  return next;
}

beforeEach(() => {
  jwtVerify.mockReset();
  userModel.findById.mockReset();
  userModel.findOne.mockReset();
  userModel.findByIdAndUpdate.mockReset();
  rotateRefreshToken.mockReset();
  process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret";
});

describe("refreshAccessTooken — persistence failure (Req 8.6)", () => {
  it("surfaces a 500 server error and sets no new cookies when rotation persistence fails", async () => {
    const stored = "stored-refresh-token";
    const req = { cookies: { refreshToken: stored }, body: {} };
    const res = makeRes();

    jwtVerify.mockReturnValue({ _id: "user-1" });
    userModel.findById.mockResolvedValue({ _id: "user-1", refreshToken: stored });
    // Persisting the rotated token fails (e.g. DB write error).
    rotateRefreshToken.mockRejectedValue(new Error("db write failed"));

    const next = await runHandler(refreshAccessTooken, req, res);

    // A server error is surfaced to the error handler.
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(500);

    // No new cookie was set: the prior refreshToken cookie is unchanged.
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe("refreshAccessTooken — token mismatch / post-logout (Req 8.3, 8.8)", () => {
  it("rejects with 401 and applies no rotation when the incoming token != stored token", async () => {
    const req = { cookies: { refreshToken: "incoming-token" }, body: {} };
    const res = makeRes();

    jwtVerify.mockReturnValue({ _id: "user-1" });
    // Stored token differs from the presented one.
    userModel.findById.mockResolvedValue({ _id: "user-1", refreshToken: "different-stored" });

    const next = await runHandler(refreshAccessTooken, req, res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(401);

    // No rotation, no cookie change.
    expect(rotateRefreshToken).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("rejects a pre-logout token with 401 once the stored token has been unset (Req 8.8)", async () => {
    const req = { cookies: { refreshToken: "pre-logout-token" }, body: {} };
    const res = makeRes();

    jwtVerify.mockReturnValue({ _id: "user-1" });
    // After logout the stored refreshToken was unset (undefined).
    userModel.findById.mockResolvedValue({ _id: "user-1", refreshToken: undefined });

    const next = await runHandler(refreshAccessTooken, req, res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(rotateRefreshToken).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("rejects with 401 when no refresh token is present and applies no rotation (Req 8.4)", async () => {
    const req = { cookies: {}, body: {} };
    const res = makeRes();

    const next = await runHandler(refreshAccessTooken, req, res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(jwtVerify).not.toHaveBeenCalled();
    expect(rotateRefreshToken).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });
});

describe("logoutUser — revocation (Req 8.7)", () => {
  it("unsets the stored refreshToken and clears both cookies", async () => {
    const req = { user: { _id: "user-1" } };
    const res = makeRes();

    userModel.findByIdAndUpdate.mockResolvedValue({ _id: "user-1" });

    const next = await runHandler(logoutUser, req, res);

    // No error forwarded.
    expect(next).not.toHaveBeenCalled();

    // Stored refresh token is unset on the user document.
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = userModel.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe("user-1");
    expect(update).toHaveProperty("$unset.refreshToken");

    // Both auth cookies are cleared.
    const clearedCookies = res.clearCookie.mock.calls.map((c) => c[0]);
    expect(clearedCookies).toContain("refreshToken");
    expect(clearedCookies).toContain("accessToken");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledTimes(1);
  });
});
