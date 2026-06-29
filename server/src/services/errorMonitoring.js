/**
 * errorMonitoring.js — Sentry-backed error monitoring, SENTRY_DSN-gated.
 *
 * The service is enabled only when the `sentry` integration resolves as
 * enabled (a non-blank SENTRY_DSN). When disabled, every operation is a safe
 * no-op so the app boots and runs without the credential present (Req 13.2).
 *
 * `initErrorMonitoring()` initializes the Sentry SDK with the configured DSN
 * before the app starts accepting requests (Req 13.1). If initialization fails
 * for any reason, the service degrades to disabled, logs a single error-level
 * record, and does NOT throw — startup continues uninterrupted (Req 13.3).
 *
 * `captureException(err)` forwards an error to Sentry only when enabled and
 * never throws, so a monitoring failure can never affect request handling.
 *
 * Req 13.1, 13.2, 13.3.
 */

import * as Sentry from "@sentry/node";
import logger from "../config/logger.js";
import { loadEnv, isIntegrationEnabled, INTEGRATIONS } from "../config/env.js";

const env = loadEnv();

/**
 * Whether error monitoring is active. Starts from the credential gate
 * (non-blank SENTRY_DSN) and may be flipped to `false` if Sentry init fails.
 * @type {boolean}
 */
let enabled = isIntegrationEnabled(INTEGRATIONS.sentry, env);

/** Guard so repeated startup calls don't re-initialize the SDK. */
let initialized = false;

/**
 * Initialize the Sentry SDK when enabled. Idempotent and never throws.
 *
 * On success the service stays enabled; on failure it degrades to disabled,
 * logs one error-level record, and returns normally so the server can keep
 * booting (Req 13.1, 13.3). When disabled, this is a no-op (Req 13.2).
 *
 * @returns {void}
 */
export function initErrorMonitoring() {
  if (!enabled || initialized) return;

  try {
    Sentry.init({ dsn: env.SENTRY_DSN });
    initialized = true;
  } catch (err) {
    // Degrade to disabled and continue startup; never propagate (Req 13.3).
    enabled = false;
    logger.error({ err }, "Sentry initialization failed; error monitoring disabled");
  }
}

/**
 * Report an error to Sentry when monitoring is enabled. Never throws, so a
 * monitoring failure cannot alter the caller's control flow. The shared logger
 * handles secret redaction; only the error itself is passed through here.
 *
 * @param {unknown} err - The error to report.
 * @returns {void}
 */
export function captureException(err) {
  if (!enabled) return;

  try {
    Sentry.captureException(err);
  } catch {
    // A monitoring failure must never surface to the caller.
  }
}

/**
 * Default export consumed by the global error handler, which lazily imports
 * this module and checks `.enabled` before calling `.captureException`.
 */
const errorMonitoring = {
  get enabled() {
    return enabled;
  },
  initErrorMonitoring,
  captureException,
};

export default errorMonitoring;
