import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  recordFailure,
  recordSuccess,
  isLocked,
  remainingLockMs,
  defaultLockoutConfig,
} from "../../middlewares/accountLockout.middleware.js";

// Feature: phase-2-quality-hardening, Property 17
// Property 17: Account-lockout counter is monotonic with bounded lock and reset.
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
//
// For any sequence of timestamped login outcomes against one account:
//   - the consecutive-failure counter increases by one per failure within the
//     rolling window (Req 7.1) and resets to zero on any success (Req 7.2);
//   - once the counter reaches the threshold within the window the account is
//     reported locked (Req 7.3) and stays locked for the lock duration so
//     password verification is skipped (Req 7.4);
//   - once the lock duration elapses the account unlocks and a fresh failure
//     starts a new window from one (Req 7.5).

const NUM_RUNS = 200;

// Parameterized config: small thresholds + bounded window/lock durations so the
// generated timelines stay meaningful while still exercising arbitrary values.
const cfgArb = fc.record({
  maxFailures: fc.integer({ min: 2, max: 8 }),
  windowMs: fc.integer({ min: 1000, max: 1_000_000 }),
  lockoutMs: fc.integer({ min: 1000, max: 1_000_000 }),
});

describe("Property 17: account-lockout counter is monotonic with bounded lock and reset", () => {
  it("increments by exactly one per failure within the rolling window (Req 7.1)", () => {
    fc.assert(
      fc.property(
        cfgArb,
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 2, max: 25 }),
        (cfg, t0, k) => {
          // Spread k failures across the window so windowStart never rolls over.
          const stepMs = Math.floor(cfg.windowMs / (k + 1));
          let state = { count: 0, windowStart: null };
          for (let i = 0; i < k; i += 1) {
            const now = t0 + i * stepMs; // all within [t0, t0 + windowMs)
            state = recordFailure(state, now, cfg);
            // Counter increments by exactly one and keeps the original anchor.
            expect(state.count).toBe(i + 1);
            expect(state.windowStart).toBe(t0);
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it("starts a fresh window of one when the prior window has elapsed (Req 7.1)", () => {
    fc.assert(
      fc.property(cfgArb, fc.integer({ min: 0, max: 5_000_000 }), (cfg, t0) => {
        let state = recordFailure({ count: 0, windowStart: null }, t0, cfg);
        expect(state).toEqual({ count: 1, windowStart: t0 });

        // A failure strictly beyond windowMs from the anchor restarts the window.
        const later = t0 + cfg.windowMs + 1;
        state = recordFailure(state, later, cfg);
        expect(state).toEqual({ count: 1, windowStart: later });
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("resets the counter to zero on success (Req 7.2)", () => {
    fc.assert(
      fc.property(
        fc.record({
          count: fc.integer({ min: 0, max: 50 }),
          windowStart: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 5_000_000 })),
        }),
        (state) => {
          const reset = recordSuccess(state);
          expect(reset.count).toBe(0);
          expect(reset.windowStart).toBeNull();
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it("locks once the threshold is reached and stays locked for the lock duration, then unlocks (Req 7.3, 7.4, 7.5)", () => {
    fc.assert(
      fc.property(
        cfgArb,
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        (cfg, t0, probe) => {
          // Drive exactly maxFailures failures, all inside the rolling window.
          const stepMs = Math.floor(cfg.windowMs / (cfg.maxFailures + 1));
          let state = { count: 0, windowStart: null };
          for (let i = 0; i < cfg.maxFailures; i += 1) {
            // Before the threshold is reached the account is not locked.
            expect(isLocked(state, t0 + i * stepMs, cfg)).toBe(false);
            state = recordFailure(state, t0 + i * stepMs, cfg);
          }

          // Threshold reached -> locked at the moment it triggered (Req 7.3).
          expect(state.count).toBe(cfg.maxFailures);
          expect(state.windowStart).toBe(t0);
          expect(isLocked(state, t0, cfg)).toBe(true);

          // Locked for any instant within the lock duration; password check is
          // skipped while locked (Req 7.4). remainingLockMs reports the balance.
          const within = probe % cfg.lockoutMs; // in [0, lockoutMs)
          expect(isLocked(state, t0 + within, cfg)).toBe(true);
          expect(remainingLockMs(state, t0 + within, cfg)).toBe(cfg.lockoutMs - within);

          // At/after the lock duration the account unlocks (Req 7.5).
          expect(isLocked(state, t0 + cfg.lockoutMs, cfg)).toBe(false);
          expect(isLocked(state, t0 + cfg.lockoutMs + probe, cfg)).toBe(false);
          expect(remainingLockMs(state, t0 + cfg.lockoutMs, cfg)).toBe(0);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it("effectively resets after the lock elapses: a later failure starts a new window (Req 7.5)", () => {
    fc.assert(
      fc.property(cfgArb, fc.integer({ min: 0, max: 5_000_000 }), (cfg, t0) => {
        // Reach the locked state.
        const stepMs = Math.floor(cfg.windowMs / (cfg.maxFailures + 1));
        let state = { count: 0, windowStart: null };
        for (let i = 0; i < cfg.maxFailures; i += 1) {
          state = recordFailure(state, t0 + i * stepMs, cfg);
        }

        // After both the lock and the window have elapsed, a new failure begins
        // a fresh window at count 1 and the account is no longer locked.
        const after = t0 + Math.max(cfg.lockoutMs, cfg.windowMs) + 1;
        const next = recordFailure(state, after, cfg);
        expect(next).toEqual({ count: 1, windowStart: after });
        expect(isLocked(next, after, cfg)).toBe(false);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("uses the documented production defaults (5 failures / 900s window / 900s lock)", () => {
    expect(defaultLockoutConfig.maxFailures).toBe(5);
    expect(defaultLockoutConfig.windowMs).toBe(900000);
    expect(defaultLockoutConfig.lockoutMs).toBe(900000);
  });
});
