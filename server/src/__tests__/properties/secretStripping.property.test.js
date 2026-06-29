/**
 * Feature: phase-2-quality-hardening, Property 5: Secrets never appear in
 * responses or `req.user`.
 *
 * Validates: Requirements 1.1, 1.4
 * (Phase-1 design Property 5 — Validates Requirements 2.3, 2.5, 5.1)
 *
 * For any user document attached to `req.user` by `verifyJWT`, no `password` or
 * `refreshToken` key appears anywhere in the structure (including nested objects
 * and arrays). The mechanism is the `.select("-password -refreshToken")`
 * projection contract; this test asserts both that the contract is exercised
 * (the exact projection string) and that the resulting `req.user` is free of
 * secret keys at any depth.
 *
 * The `User` model selection is mocked with a faithful projection that removes
 * the excluded paths — no real DB or network I/O.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("jsonwebtoken", () => ({
  default: { verify: vi.fn(() => ({ _id: "deadbeefdeadbeefdeadbeef" })) },
}));
vi.mock("../../models/user.model.js", () => ({ User: { findById: vi.fn() } }));

import jwt from "jsonwebtoken";
import { User } from "../../models/user.model.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";

const RUNS = { numRuns: 200 };

const SECRET_KEYS = ["password", "refreshToken"];

// Recursively assert no secret key appears anywhere in the structure.
function findSecretKey(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findSecretKey(item, seen);
      if (hit) return hit;
    }
    return null;
  }

  for (const key of Object.keys(value)) {
    if (SECRET_KEYS.includes(key)) return key;
    const hit = findSecretKey(value[key], seen);
    if (hit) return hit;
  }
  return null;
}

// A faithful stand-in for Mongoose's top-level `.select("-a -b")` projection:
// returns a shallow copy of `doc` with each excluded path removed.
function applyExclusionProjection(doc, projection) {
  const excluded = projection
    .split(/\s+/)
    .filter((p) => p.startsWith("-"))
    .map((p) => p.slice(1));
  const out = { ...doc };
  for (const path of excluded) delete out[path];
  return out;
}

// Generate a realistic user document that carries top-level secrets plus
// arbitrary safe scalar fields.
function userDocArb() {
  return fc.record({
    _id: fc.constant("deadbeefdeadbeefdeadbeef"),
    username: fc.string(),
    email: fc.string(),
    fullName: fc.string(),
    password: fc.string({ minLength: 1 }),
    refreshToken: fc.string({ minLength: 1 }),
    watchHistory: fc.array(fc.string(), { maxLength: 3 }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  jwt.verify.mockReturnValue({ _id: "deadbeefdeadbeefdeadbeef" });
});

describe("Property 5: secrets never appear in req.user", () => {
  it("verifyJWT applies the -password -refreshToken projection and attaches a secret-free user", async () => {
    await fc.assert(
      fc.asyncProperty(userDocArb(), async (rawDoc) => {
        const selectSpy = vi.fn((projection) =>
          Promise.resolve(applyExclusionProjection(rawDoc, projection)),
        );
        User.findById.mockReturnValue({ select: selectSpy });

        const req = {
          cookies: { accessToken: "valid-token" },
          header: () => undefined,
        };
        const next = vi.fn();

        verifyJWT(req, {}, next);
        await new Promise((r) => setImmediate(r));

        // next() called once with no error.
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0]).toBeUndefined();

        // The exact projection contract was exercised.
        expect(selectSpy).toHaveBeenCalledWith("-password -refreshToken");

        // The attached user exists and is free of secret keys at any depth.
        expect(req.user).toBeDefined();
        expect(findSecretKey(req.user)).toBeNull();
        expect(req.user).not.toHaveProperty("password");
        expect(req.user).not.toHaveProperty("refreshToken");
      }),
      RUNS,
    );
  });
});
