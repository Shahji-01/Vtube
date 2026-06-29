import { useCallback } from 'react'
import { useToast } from '../context/ToastContext'
import { getErrorMessage } from '../utils/formatters'

// ── useOptimisticAction: generic optimistic-update orchestrator ──
//
// Provides a single `run` function that wires up the optimistic-action
// contract from the design ("Optimistic like usage in Watch" + Error Handling
// table) in a reusable, page-agnostic way:
//
//  - Applies an optimistic state update synchronously (so the UI re-renders
//    within 100ms, before the network request resolves) — Req 8.6.
//  - On request failure OR if the request does not resolve within 10 seconds,
//    rolls back to the EXACT prior state and shows an error toast for at least
//    5 seconds — Req 8.7.
//  - If the action is gated and the user is signed out, shows a sign-in prompt
//    toast for at least 5 seconds and sends NO network request — Req 8.8.
//
// The hook is intentionally generic: it does not import AuthContext or any
// specific request. Callers pass the request fn, the optimistic updater, and
// the current/setState handles. The like-specific `useLikeAction` hook composes
// this with `toggleLike` and `useAuth`.

/**
 * Default rollback timeout. A request that has not settled within this window
 * is treated as a failure (Req 8.7: "does not resolve within 10 seconds").
 */
export const ROLLBACK_TIMEOUT_MS = 10000

/**
 * Minimum visible duration for the error / sign-in toasts (Req 8.7, 8.8:
 * "for a minimum of 5 seconds").
 */
export const ACTION_TOAST_DURATION_MS = 5000

/**
 * Error thrown when the wrapped request exceeds the timeout window. Kept as a
 * distinct type so callers can detect timeouts vs. server failures if desired.
 */
export class ActionTimeoutError extends Error {
  constructor(message = 'The request timed out. Please try again.') {
    super(message)
    this.name = 'ActionTimeoutError'
    this.isTimeout = true
  }
}

/**
 * Race a promise against a timeout. If `ms` elapses first the returned promise
 * rejects with an {@link ActionTimeoutError}; otherwise it settles with the
 * original promise's outcome. The timer is always cleared so it never leaks.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ActionTimeoutError()), ms)
  })
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    clearTimeout(timer)
  })
}

/**
 * @typedef {Object} OptimisticActionConfig
 * @property {boolean} authed
 *   Whether the user is currently signed in. When `false` the action is gated:
 *   a sign-in toast is shown and no request is sent (Req 8.8).
 * @property {*} current
 *   The state held immediately before the action — the exact value restored on
 *   rollback (Req 8.7).
 * @property {(next: *) => void} setState
 *   Setter used to apply the optimistic state and, on failure, the rollback.
 * @property {* | ((prev: *) => *)} optimistic
 *   The optimistic next state, or an updater `(prev) => next` derived from
 *   `current`.
 * @property {() => Promise<*>} request
 *   The async network request to perform. Only called when `authed` is true.
 * @property {string} [signInMessage]
 *   Toast message shown when the action is gated (signed out).
 * @property {string} [errorMessage]
 *   Override for the failure toast message. Defaults to the request error
 *   message (or the timeout message) via `getErrorMessage`.
 * @property {number} [timeoutMs]
 *   Rollback timeout window. Defaults to {@link ROLLBACK_TIMEOUT_MS}.
 */

/**
 * @typedef {Object} OptimisticActionResult
 * @property {'success'|'error'|'unauthenticated'} status
 * @property {Error} [error] Present when `status === 'error'`.
 */

/**
 * Hook returning a stable `run` function that performs an optimistic action.
 *
 * @returns {(config: OptimisticActionConfig) => Promise<OptimisticActionResult>}
 */
export default function useOptimisticAction() {
  const toast = useToast()

  const run = useCallback(
    async ({
      authed,
      current,
      setState,
      optimistic,
      request,
      signInMessage = 'Sign in to continue',
      errorMessage,
      timeoutMs = ROLLBACK_TIMEOUT_MS,
    }) => {
      // ── Auth gate (Req 8.8): no request, sign-in toast for >= 5s ──
      if (!authed) {
        toast({
          message: signInMessage,
          type: 'error',
          duration: ACTION_TOAST_DURATION_MS,
        })
        return { status: 'unauthenticated' }
      }

      // Capture the exact prior state for a faithful rollback (Req 8.7).
      const prev = current
      const next =
        typeof optimistic === 'function' ? optimistic(prev) : optimistic

      // ── Optimistic render (Req 8.6): apply before the request resolves ──
      setState(next)

      try {
        await withTimeout(Promise.resolve().then(request), timeoutMs)
        return { status: 'success' }
      } catch (err) {
        // ── Failure / timeout (Req 8.7): roll back + error toast for >= 5s ──
        setState(prev)
        toast({
          message: errorMessage || getErrorMessage(err),
          type: 'error',
          duration: ACTION_TOAST_DURATION_MS,
        })
        return { status: 'error', error: err }
      }
    },
    [toast]
  )

  return run
}
