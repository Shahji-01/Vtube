/**
 * loginLockout.test.js — Unit tests for per-account lockout enumeration-safety
 * and fail-closed behaviour (Task 4.4).
 *
 * Validates: Requirements 7.7, 7.8, 7.9
 *
 * node-cache is mocked so the backing store can be made to throw (store outage)
 * or return a "locked" state on demand, and the User model is mocked so no real
 * DB is touched. The asyncHandler-wrapped loginUser is driven directly with mock
 * req/res/next and the resulting `next` error is inspected.
 *
 * Asserts:
 *  - Req 7.8: keyForAccount yields an opaque, deterministic key for a
 *    non-existent identifier (a SHA-256 hash that never reveals the raw input),
 *    and an _id-based key for an existing account.
 *  - Req 7.9: when the failure-counter store throws, loginUser fails closed with
 *    HTTP 429 and never verifies the password.
 *  - Req 7.7 / 7.8: a locked existing account and a (hashed) non-existent
 *    identifier both produce an indistinguishable 429 response (same status and
 *    message) and neither verifies the password.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock fns shared with the vi.mock factories ───────────────────────
const { cacheGet, cacheSet, cacheDel } = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));
const { userModel } = vi.hoisted(() => ({
  userModel: { findOne: vi.fn() },
}));

vi.mock("node-cache", () => ({
  default: vi.fn(() => ({ get: cacheGet, set: cacheSet, del: cacheDel })),
}));
vi.mock("../../models/user.model.js", () => ({ User: userModel }));

const { loginUser } = await import("../../controllers/user.controller.js");
const { keyForAccount } = await import(
  "../../middlewares/accountLockout.middleware.js"
);

/** Chainable res spy. */
function makeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.cookie = vi.fn(() => res);
  res.clearCookie = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function runHandler(handler, req, res) {
  const next = vi.fn();
  handler(req, res, next);
  await flush();
  return next;
}

beforeEach(() => {
  cacheGet.mockReset();
  cacheSet.mockReset();
  cacheDel.mockReset();
  userModel.findOne.mockReset();
});

describe("keyForAccount — enumeration safety (Req 7.8)", () => {
  it("produces a stable opaque hash key for a non-existent identifier", () => {
    const email = "Ghost@Example.com";
    const k1 = keyForAccount(email);
    const k2 = keyForAccount("  ghost@example.com  "); // trimmed + lowercased

    // Deterministic and case/whitespace-insensitive.
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^lockout:h:[a-f0-9]{64}$/);
    // The raw identifier never appears in the key.
    expect(k1).not.toContain("ghost");
    expect(k1).not.toContain("example.com");
  });

  it("derives distinct keys for distinct non-existent identifiers", () => {
    expect(keyForAccount("alice@example.com")).not.toBe(
      keyForAccount("bob@example.com")
    );
  });

  it("uses an _id-based key for an existing account", () => {
    expect(keyForAccount({ _id: "abc123" })).toBe("lockout:id:abc123");
  });
});

describe("loginUser — fail closed on store outage (Req 7.9)", () => {
  it("responds 429 without verifying the password when the store throws", async () => {
    const isPasswordCorrect = vi.fn();
    userModel.findOne.mockResolvedValue({
      _id: "user-1",
      isPasswordCorrect,
    });
    // The failure-counter store is unavailable.
    cacheGet.mockImplementation(() => {
      throw new Error("cache store unavailable");
    });

    const req = { body: { email: "user@example.com", password: "secret" } };
    const res = makeRes();

    const next = await runHandler(loginUser, req, res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(429);
    // Fail closed: the password was never checked.
    expect(isPasswordCorrect).not.toHaveBeenCalled();
  });
});

describe("loginUser — locked accounts are indistinguishable (Req 7.7, 7.8)", () => {
  // A state that the pure isLocked() reports as locked: threshold reached and
  // within the lock window.
  const lockedState = { count: 5, windowStart: Date.now() };

  it("a locked existing account and a non-existent identifier both yield the same 429", async () => {
    cacheGet.mockReturnValue(lockedState);

    // Existing account.
    const isPasswordCorrect = vi.fn();
    userModel.findOne.mockResolvedValueOnce({ _id: "user-1", isPasswordCorrect });
    const existingRes = makeRes();
    const existingNext = await runHandler(
      loginUser,
      { body: { email: "real@example.com", password: "secret" } },
      existingRes
    );

    // Non-existent account.
    userModel.findOne.mockResolvedValueOnce(null);
    const ghostRes = makeRes();
    const ghostNext = await runHandler(
      loginUser,
      { body: { email: "ghost@example.com", password: "secret" } },
      ghostRes
    );

    const existingErr = existingNext.mock.calls[0][0];
    const ghostErr = ghostNext.mock.calls[0][0];

    // Indistinguishable: identical status and message.
    expect(existingErr.statusCode).toBe(429);
    expect(ghostErr.statusCode).toBe(429);
    expect(existingErr.message).toBe(ghostErr.message);

    // Password never verified while locked.
    expect(isPasswordCorrect).not.toHaveBeenCalled();
  });
});
