import pino from "pino";
import pinoHttp from "pino-http";
import { loadEnv } from "./env.js";

/**
 * Key paths whose values must never appear in log output. Paths use pino's
 * redaction syntax: a leading `*.` wildcard matches the named key at any depth,
 * while bare names match top-level keys. Covers request auth headers and every
 * secret-bearing field the app may log (tokens, passwords, integration creds).
 */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.password",
  "*.refreshToken",
  "*.accessToken",
  "*.token",
  "password",
  "refreshToken",
  "accessToken",
  "apiKey",
  "secret",
  "*.EMAIL_AUTH_PASS",
  "*.SENTRY_DSN",
  "*.GOOGLE_CLIENT_SECRET",
];

export const REDACT_CENSOR = "[REDACTED]";

/**
 * Secret-bearing key names (lowercased) whose values must never be logged,
 * regardless of how deeply they are nested. pino's `redact.paths` only match
 * named keys near the root, so this set powers a recursive redactor that closes
 * the depth gap (Req 11.4).
 */
export const SECRET_KEYS = new Set([
  "password",
  "refreshtoken",
  "accesstoken",
  "token",
  "apikey",
  "secret",
  "email_auth_pass",
  "sentry_dsn",
  "google_client_secret",
]);

/**
 * True only for plain objects (object/array literals). Class instances such as
 * Error and Buffer return false so they are passed through untouched: pino owns
 * their serialization, and walking their internals risks corrupting them.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Return a deep, redacted copy of `input` in which the value of any key whose
 * lowercased name is a known secret is replaced with `REDACT_CENSOR`, at any
 * depth (Req 11.4). The function is pure (never mutates its argument), only
 * recurses into plain objects/arrays (Error/Buffer/etc. pass through), and
 * guards against reference cycles via a WeakSet of in-progress ancestors so a
 * self-referential object yields `"[Circular]"` instead of looping forever.
 *
 * @param {unknown} input - Value to redact.
 * @param {WeakSet<object>} [ancestors] - Internal cycle-tracking set.
 * @returns {unknown} A redacted copy (or the original for non-plain values).
 */
export function redactSecrets(input, ancestors = new WeakSet()) {
  if (Array.isArray(input)) {
    if (ancestors.has(input)) return "[Circular]";
    ancestors.add(input);
    const copy = input.map((item) => redactSecrets(item, ancestors));
    ancestors.delete(input);
    return copy;
  }

  if (!isPlainObject(input)) return input;

  if (ancestors.has(input)) return "[Circular]";
  ancestors.add(input);
  const copy = {};
  for (const [key, value] of Object.entries(input)) {
    copy[key] = SECRET_KEYS.has(key.toLowerCase())
      ? REDACT_CENSOR
      : redactSecrets(value, ancestors);
  }
  ancestors.delete(input);
  return copy;
}

/**
 * Build a pino logger for the given environment view.
 *
 * Level is forced to `info` in production (so `debug` is suppressed, Req 11.6);
 * otherwise it honors `LOG_LEVEL`, defaulting to `debug`. Secret-bearing key
 * paths are redacted at any depth with a fixed `[REDACTED]` marker (Req 11.4):
 * the `redact` paths cover request auth headers near the root, while the `log`
 * formatter recursively redacts secret-named keys nested arbitrarily deep.
 *
 * @param {Record<string, unknown>} env - Environment view (e.g. from loadEnv()).
 * @returns {import("pino").Logger}
 */
export function createLogger(env = {}) {
  const isProd = env.NODE_ENV === "production";
  return pino({
    level: isProd ? "info" : env.LOG_LEVEL || "debug",
    redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
    formatters: {
      // Deep-redact every logged object so secrets nested below pino's
      // path-matching depth are still removed before serialization (Req 11.4).
      log(obj) {
        return redactSecrets(obj);
      },
    },
  });
}

/**
 * Build the pino-http request-logging middleware. It emits exactly one
 * completion record per request capturing the HTTP method, request path,
 * response status code, and response duration in whole milliseconds
 * (Req 11.3), using the same redacting logger as createLogger.
 *
 * @param {Record<string, unknown>} env - Environment view (e.g. from loadEnv()).
 * @returns {import("express").RequestHandler}
 */
export function requestLogger(env = {}) {
  return pinoHttp({
    logger: createLogger(env),
    // One human-readable completion line per request: method, path, status.
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res) =>
      `${req.method} ${req.url} ${res.statusCode}`,
    // Surface method, path, status, and responseTime (whole ms) on the record.
    customProps: (req, res) => ({
      method: req.method,
      path: req.url,
      status: res.statusCode,
      responseTime: Math.round(res.responseTime ?? 0),
    }),
  });
}

/**
 * Shared logger instance for use by controllers and the global error handler.
 * Constructed from the process environment via loadEnv().
 */
const logger = createLogger(loadEnv());

export default logger;
