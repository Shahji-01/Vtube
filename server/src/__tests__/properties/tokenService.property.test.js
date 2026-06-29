/**
 * Feature: phase-2-quality-hardening, Property 18
 *
 * Property 18: Refresh-token rotation issues a fresh token and invalidates the prior one.
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.8
 *
 * The User model is mocked (no real DB). `findById` returns a fake user document
 * whose `generateAccessToken`/`generateRefreshToken` return fresh, unique values
 * on every call, and whose `save()` records the persisted `refreshToken`. For
 * arbitrary user ids we assert that the returned refresh token is non-empty,
 * differs from any previously presented token, and that the persisted (stored)
 * token equals the newly returned token — so a prior token no longer matches.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { rotateRefreshToken } from "../../services/tokenService.js";

/**
 * Build a mocked User model.
 *
 * `findById` always resolves to a fake user document that:
 *   - returns a fresh, globally-unique value from generateAccessToken()
 *   - returns a fresh, globally-unique value from generateRefreshToken()
 *   - records the persisted refreshToken on save()
 *
 * @param {string} [initialStoredToken] the user's pre-existing stored refresh token
 * @returns {{ User: object, getUser: () => object }}
 */
function makeUserModel(initialStoredToken) {
  let counter = 0;
  const nextUnique = (label) => `${label}-${counter++}-${Math.random().toString(36).slice(2)}`;

  const user = {
    // The token currently persisted as the rotation anchor.
    refreshToken: initialStoredToken,
    saveCount: 0,
    generateAccessToken() {
      return nextUnique("access");
    },
    generateRefreshToken() {
      return nextUnique("refresh");
    },
    async save() {
      // Persisting simply records the in-memory field; nothing else to do.
      this.saveCount += 1;
      return this;
    },
  };

  return {
    User: {
      async findById() {
        return user;
      },
    },
    getUser: () => user,
  };
}

describe("Property 18: refresh-token rotation issues a fresh token and invalidates the prior one", () => {
  it("returns a non-empty token that differs from any previously presented token and is the new stored anchor", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary user ids.
        fc.string(),
        // Arbitrary prior/stored token the user may already hold (incl. empty/absent).
        fc.option(fc.string(), { nil: undefined }),
        async (userId, priorStoredToken) => {
          const { User, getUser } = makeUserModel(priorStoredToken);

          // Capture every token the caller has "presented" before rotation:
          // the prior stored token (if any) is the one the client would reuse.
          const previouslyPresented = new Set();
          if (typeof priorStoredToken === "string" && priorStoredToken.length > 0) {
            previouslyPresented.add(priorStoredToken);
          }

          const { accessToken, refreshToken } = await rotateRefreshToken(User, userId);

          const user = getUser();

          // Req 8.1: a fresh, non-empty refresh token is issued.
          expect(typeof refreshToken).toBe("string");
          expect(refreshToken.length).toBeGreaterThan(0);
          expect(typeof accessToken).toBe("string");
          expect(accessToken.length).toBeGreaterThan(0);

          // Req 8.1: the new refresh token differs from any previously presented token.
          expect(previouslyPresented.has(refreshToken)).toBe(false);

          // Req 8.2/8.3: the new token was persisted as the rotation anchor.
          expect(user.saveCount).toBeGreaterThanOrEqual(1);
          expect(user.refreshToken).toBe(refreshToken);

          // Req 8.4/8.8: the prior token no longer matches the persisted one,
          // so a later request reusing it would be rejected.
          if (typeof priorStoredToken === "string" && priorStoredToken.length > 0) {
            expect(user.refreshToken).not.toBe(priorStoredToken);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rotating repeatedly always invalidates the immediately prior token", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.integer({ min: 2, max: 8 }),
        async (userId, rounds) => {
          const { User, getUser } = makeUserModel(undefined);
          const seen = new Set();

          for (let i = 0; i < rounds; i++) {
            const priorStored = getUser().refreshToken;
            const { refreshToken } = await rotateRefreshToken(User, userId);

            // Each rotation yields a brand-new, unseen token.
            expect(seen.has(refreshToken)).toBe(false);
            seen.add(refreshToken);

            // The previously stored token is replaced (prior token invalidated).
            if (priorStored !== undefined) {
              expect(getUser().refreshToken).not.toBe(priorStored);
            }
            // The freshly returned token is now the stored anchor.
            expect(getUser().refreshToken).toBe(refreshToken);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
