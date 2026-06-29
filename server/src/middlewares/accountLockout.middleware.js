// Per-account brute-force lockout (design §"middlewares/accountLockout.middleware.js").
//
// This module currently exposes ONLY the pure, deterministic state-machine
// functions that model a rolling failure window plus a bounded lock duration.
// The Express middleware wiring (node-cache store, checkLockout/onLoginFailure/
// onLoginSuccess) is added later (task 4.3) and is intentionally absent here.
//
// State shape: { count: number, windowStart: number | null }
//   - count       consecutive failures counted in the current rolling window
//   - windowStart epoch-ms timestamp of the earliest counted failure, or null
//
// All functions are pure: the current time (`now`, epoch-ms) is passed in so the
// machine is fully deterministic and trivially testable. The window/lock
// durations come from `cfg` (defaults below), so production behaviour stays
// configurable while the functions remain side-effect free.
//
// Task 4.3 adds the side-effecting layer on top of the pure machine: a dedicated
// node-cache instance is used as the per-account failure-counter store, plus the
// `keyForAccount` / `isAccountLocked` / `onLoginFailure` / `onLoginSuccess`
// helpers consumed by `loginUser`.

import { createHash } from "node:crypto";
import NodeCache from "node-cache";
import { loadEnv } from "../config/env.js";

/**
 * Default lockout configuration (Req 7.3): 5 consecutive failures within a
 * 15-minute rolling window trigger a 15-minute (900 000 ms) lock.
 *
 * @type {{ maxFailures: number, windowMs: number, lockoutMs: number }}
 */
export const defaultLockoutConfig = Object.freeze({
  maxFailures: 5,
  windowMs: 15 * 60 * 1000, // 900000
  lockoutMs: 15 * 60 * 1000, // 900000
});

// Reset/empty state used as the starting point and after any success.
const EMPTY_STATE = Object.freeze({ count: 0, windowStart: null });

/**
 * Normalize an arbitrary/absent state into a well-formed { count, windowStart }.
 * @param {{ count?: number, windowStart?: number | null } | null | undefined} state
 * @returns {{ count: number, windowStart: number | null }}
 */
function normalize(state) {
  if (!state || typeof state !== "object") return { count: 0, windowStart: null };
  const count = Number.isFinite(state.count) && state.count > 0 ? state.count : 0;
  const windowStart = Number.isFinite(state.windowStart) ? state.windowStart : null;
  // A count without a window anchor is meaningless; treat it as a fresh start.
  if (count === 0 || windowStart === null) return { count: 0, windowStart: null };
  return { count, windowStart };
}

/**
 * Record a failed attempt (Req 7.1).
 *
 * Increments the consecutive-failure counter within the current rolling window.
 * If there is no active window, or the prior window has fully elapsed
 * (`now - windowStart > cfg.windowMs`), a fresh window is started with count 1.
 *
 * @param {{ count?: number, windowStart?: number | null } | null | undefined} state
 * @param {number} now epoch-ms timestamp of this attempt
 * @param {{ windowMs: number }} [cfg=defaultLockoutConfig]
 * @returns {{ count: number, windowStart: number }}
 */
export function recordFailure(state, now, cfg = defaultLockoutConfig) {
  const { count, windowStart } = normalize(state);
  const windowMs = cfg?.windowMs ?? defaultLockoutConfig.windowMs;

  // No active window, or the prior window has elapsed -> start fresh.
  if (windowStart === null || now - windowStart > windowMs) {
    return { count: 1, windowStart: now };
  }

  // Still within the rolling window -> increment, keep the original anchor.
  return { count: count + 1, windowStart };
}

/**
 * Record a successful authentication (Req 7.2): reset the failure counter.
 * @returns {{ count: number, windowStart: null }}
 */
export function recordSuccess() {
  return { count: EMPTY_STATE.count, windowStart: EMPTY_STATE.windowStart };
}

/**
 * Report whether the account is currently locked (Req 7.3, 7.4, 7.5).
 *
 * The account is locked when it has reached the failure threshold AND the lock
 * duration has not yet elapsed, measured from the triggering window's start.
 * Once `cfg.lockoutMs` elapses the account is no longer locked (Req 7.5).
 *
 * @param {{ count?: number, windowStart?: number | null } | null | undefined} state
 * @param {number} now epoch-ms timestamp to evaluate against
 * @param {{ maxFailures: number, lockoutMs: number }} [cfg=defaultLockoutConfig]
 * @returns {boolean}
 */
export function isLocked(state, now, cfg = defaultLockoutConfig) {
  const { count, windowStart } = normalize(state);
  if (windowStart === null) return false;

  const maxFailures = cfg?.maxFailures ?? defaultLockoutConfig.maxFailures;
  const lockoutMs = cfg?.lockoutMs ?? defaultLockoutConfig.lockoutMs;

  if (count < maxFailures) return false;

  // Locked while still within the lock duration of the triggering window.
  // (now < windowStart, e.g. clock skew, is treated as still-locked.)
  return now - windowStart < lockoutMs;
}

/**
 * Milliseconds remaining on the current lock, or 0 if not locked (Req 7.4).
 *
 * @param {{ count?: number, windowStart?: number | null } | null | undefined} state
 * @param {number} now epoch-ms timestamp to evaluate against
 * @param {{ maxFailures: number, lockoutMs: number }} [cfg=defaultLockoutConfig]
 * @returns {number} non-negative milliseconds remaining
 */
export function remainingLockMs(state, now, cfg = defaultLockoutConfig) {
  if (!isLocked(state, now, cfg)) return 0;

  const { windowStart } = normalize(state);
  const lockoutMs = cfg?.lockoutMs ?? defaultLockoutConfig.lockoutMs;
  const remaining = lockoutMs - (now - windowStart);

  // Clamp into [0, lockoutMs]: negative is impossible here, but guard clock skew.
  if (remaining < 0) return 0;
  if (remaining > lockoutMs) return lockoutMs;
  return remaining;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Side-effecting store + helpers (Req 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8, 7.9)
 *
 * The pure state machine above is wrapped by a node-cache–backed store keyed by
 * account. Entries are written with a TTL long enough to span both the rolling
 * window and the lock duration so stale state is reclaimed automatically while
 * an active window/lock is always observable.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Resolve the effective lockout config from the environment, falling back to the
 * frozen defaults for any value that is absent or not a finite number.
 *
 * @param {Record<string, unknown>} [env=loadEnv()]
 * @returns {{ maxFailures: number, windowMs: number, lockoutMs: number }}
 */
function resolveLockoutConfig(env = loadEnv()) {
  const pick = (value, fallback) =>
    Number.isFinite(value) && value > 0 ? value : fallback;
  return {
    maxFailures: pick(env?.LOCKOUT_MAX_FAILURES, defaultLockoutConfig.maxFailures),
    windowMs: pick(env?.LOCKOUT_WINDOW_MS, defaultLockoutConfig.windowMs),
    lockoutMs: pick(env?.LOCKOUT_DURATION_MS, defaultLockoutConfig.lockoutMs),
  };
}

// Effective config resolved once at module load (production defaults when unset).
const lockoutConfig = resolveLockoutConfig();

// TTL (seconds) for stored state: long enough to cover both the rolling window
// and the lock duration so an active window/lock never expires prematurely.
const STATE_TTL_SECONDS = Math.max(
  1,
  Math.ceil(Math.max(lockoutConfig.windowMs, lockoutConfig.lockoutMs) / 1000)
);

// Dedicated cache instance — separate from the response cache in utils/cache.js
// so eviction policies and TTLs do not interfere with each other.
const lockoutCache = new NodeCache({
  stdTTL: STATE_TTL_SECONDS,
  checkperiod: 120,
  useClones: false,
});

/**
 * Derive a deterministic, stable lockout key for an account (Req 7.8).
 *
 * - For an EXISTING account (a value exposing `_id`), the account's `_id` string
 *   is used so all attempts against that account share one counter.
 * - For a NON-EXISTENT account (a submitted username/email string), a SHA-256
 *   hash of the normalized identifier is used. The key never reveals the input,
 *   and because both branches yield an opaque cache key the lockout behaviour is
 *   indistinguishable between existing and non-existent accounts.
 *
 * @param {{ _id?: unknown } | string | null | undefined} identifier
 * @returns {string}
 */
export function keyForAccount(identifier) {
  if (identifier && typeof identifier === "object" && identifier._id != null) {
    return `lockout:id:${String(identifier._id)}`;
  }
  const raw = typeof identifier === "string" ? identifier : String(identifier ?? "");
  const normalized = raw.trim().toLowerCase();
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `lockout:h:${hash}`;
}

/**
 * Report whether the account behind `key` is currently locked (Req 7.3, 7.4).
 *
 * Reads the stored state from the cache and delegates to the pure `isLocked`.
 * Any cache failure propagates to the caller, which MUST fail closed (Req 7.9).
 *
 * @param {string} key
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function isAccountLocked(key, now = Date.now()) {
  const state = lockoutCache.get(key);
  return isLocked(state, now, lockoutConfig);
}

/**
 * Record a failed login attempt for `key` (Req 7.1) and persist the new state
 * with a bounded TTL. Returns the updated state. Cache failures propagate.
 *
 * @param {string} key
 * @param {number} [now=Date.now()]
 * @returns {{ count: number, windowStart: number }}
 */
export function onLoginFailure(key, now = Date.now()) {
  const state = lockoutCache.get(key);
  const next = recordFailure(state, now, lockoutConfig);
  lockoutCache.set(key, next, STATE_TTL_SECONDS);
  return next;
}

/**
 * Record a successful authentication for `key` (Req 7.2): clear the counter by
 * deleting the stored state so the account starts fresh. Cache failures propagate.
 *
 * @param {string} key
 * @returns {void}
 */
export function onLoginSuccess(key) {
  lockoutCache.del(key);
}

export default {
  defaultLockoutConfig,
  recordFailure,
  recordSuccess,
  isLocked,
  remainingLockMs,
  keyForAccount,
  isAccountLocked,
  onLoginFailure,
  onLoginSuccess,
};
