/**
 * Feature: phase-2-quality-hardening, Property 19
 *
 * Property 19: Integration feature flag is enabled exactly when all required
 * vars are non-blank.
 * Validates: Requirements 12.2, 12.3, 13.1, 13.2, 14.1, 14.2
 *
 * For arbitrary `requiredKeys` lists and arbitrary env maps (whose values
 * include `undefined`, "", whitespace-only, and non-blank strings), we assert:
 *   - returns `true` iff every required key is present with at least one
 *     non-whitespace character;
 *   - is deterministic (same inputs -> same output);
 *   - returns a strict boolean and never leaks any env value.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { isIntegrationEnabled } from "../../config/env.js";

// A pool of candidate key names the env map and requiredKeys are drawn from.
const KEY_POOL = ["A", "B", "C", "D", "EMAIL_HOST", "SENTRY_DSN", "GOOGLE_CLIENT_ID"];

// Values that span the meaningful equivalence classes: blank-ish vs. non-blank.
const blankValue = fc.constantFrom(undefined, "", " ", "   ", "\t", "\n", " \t\n ");
const nonBlankValue = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s);

// An env map: each key from the pool maps to a blank-ish or non-blank value.
const envArb = fc.dictionary(
  fc.constantFrom(...KEY_POOL),
  fc.oneof(blankValue, nonBlankValue),
);

const requiredKeysArb = fc.array(fc.constantFrom(...KEY_POOL), { maxLength: KEY_POOL.length });

/**
 * Reference oracle: a key counts as satisfied when its value is a string with
 * at least one non-whitespace character.
 */
function expected(requiredKeys, env) {
  if (!Array.isArray(requiredKeys) || requiredKeys.length === 0) return false;
  const src = env ?? {};
  return requiredKeys.every((k) => typeof src[k] === "string" && src[k].trim().length > 0);
}

describe("Property 19: integration feature flag enabled iff all required vars non-blank", () => {
  it("returns true exactly when every required key is present and non-blank", () => {
    fc.assert(
      fc.property(requiredKeysArb, envArb, (requiredKeys, env) => {
        const result = isIntegrationEnabled(requiredKeys, env);
        expect(result).toBe(expected(requiredKeys, env));
      }),
      { numRuns: 300 },
    );
  });

  it("returns a strict boolean and never leaks an env value", () => {
    fc.assert(
      fc.property(requiredKeysArb, envArb, (requiredKeys, env) => {
        const result = isIntegrationEnabled(requiredKeys, env);
        // Strictly boolean — not a truthy string or other value.
        expect(typeof result).toBe("boolean");
        expect(result === true || result === false).toBe(true);
        // The result is one of the two booleans; no env value can equal it
        // unless it is literally true/false, which env strings never are.
        for (const value of Object.values(env)) {
          expect(result).not.toBe(value);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("is deterministic for identical inputs", () => {
    fc.assert(
      fc.property(requiredKeysArb, envArb, (requiredKeys, env) => {
        const a = isIntegrationEnabled(requiredKeys, env);
        const b = isIntegrationEnabled(requiredKeys, env);
        expect(a).toBe(b);
      }),
      { numRuns: 200 },
    );
  });

  it("requires ALL keys: a single blank required key disables the flag", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...KEY_POOL), { minLength: 1, maxLength: KEY_POOL.length }),
        (requiredKeys) => {
          // Build an env where every required key is non-blank...
          const env = {};
          for (const k of requiredKeys) env[k] = "real-value";
          expect(isIntegrationEnabled(requiredKeys, env)).toBe(true);

          // ...then blank out exactly one required key -> must become false.
          const victim = requiredKeys[0];
          env[victim] = "   ";
          expect(isIntegrationEnabled(requiredKeys, env)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
