/**
 * env.js — Central environment reader + integration feature-flag resolver.
 *
 * Pure module: the only side effect is reading the env object passed in
 * (defaulting to `process.env`). `loadEnv` returns a frozen, typed view of the
 * configuration the app needs; numeric envs are coerced with `Number()` only
 * when present and left `undefined` otherwise so callers can apply their own
 * defaults. `isIntegrationEnabled` is a pure predicate that never leaks any
 * environment value.
 *
 * Req 12.2, 12.3, 13.1, 13.2, 14.1, 14.2, 15.3.
 */

/**
 * Coerce a value to a Number only when it is present (not `undefined`/`null`).
 * Absent values stay `undefined` so downstream factories can supply defaults.
 *
 * @param {unknown} value
 * @returns {number | undefined}
 */
function numericOrUndefined(value) {
    return value === undefined || value === null ? undefined : Number(value);
}

/**
 * Build a frozen, typed view of the configuration values the app needs.
 *
 * - String passthrough: NODE_ENV, PORT, LOG_LEVEL, and the raw integration vars.
 * - Numeric coercion (only when present): the rate-limit tiers and their window
 *   overrides, plus the account-lockout settings.
 *
 * @param {Record<string, string | undefined>} [overrides=process.env]
 * @returns {Readonly<object>} frozen config view
 */
export function loadEnv(overrides = process.env) {
    const env = overrides ?? {};

    return Object.freeze({
        // Core runtime
        NODE_ENV: env.NODE_ENV,
        PORT: env.PORT,
        LOG_LEVEL: env.LOG_LEVEL,

        // Rate-limit tiers + window overrides (numbers when set, else undefined)
        RATE_LIMIT_GLOBAL: numericOrUndefined(env.RATE_LIMIT_GLOBAL),
        RATE_LIMIT_AUTH: numericOrUndefined(env.RATE_LIMIT_AUTH),
        RATE_LIMIT_UPLOAD: numericOrUndefined(env.RATE_LIMIT_UPLOAD),
        RL_GLOBAL_WINDOW_MS: numericOrUndefined(env.RL_GLOBAL_WINDOW_MS),
        RL_AUTH_WINDOW_MS: numericOrUndefined(env.RL_AUTH_WINDOW_MS),
        RL_UPLOAD_WINDOW_MS: numericOrUndefined(env.RL_UPLOAD_WINDOW_MS),

        // Account lockout (numbers when set, else undefined)
        LOCKOUT_MAX_FAILURES: numericOrUndefined(env.LOCKOUT_MAX_FAILURES),
        LOCKOUT_WINDOW_MS: numericOrUndefined(env.LOCKOUT_WINDOW_MS),
        LOCKOUT_DURATION_MS: numericOrUndefined(env.LOCKOUT_DURATION_MS),

        // Raw integration vars (passed through untouched for the flag resolver
        // and the integration adapters that consume them)
        EMAIL_HOST: env.EMAIL_HOST,
        EMAIL_PORT: env.EMAIL_PORT,
        EMAIL_AUTH_USER: env.EMAIL_AUTH_USER,
        EMAIL_AUTH_PASS: env.EMAIL_AUTH_PASS,
        EMAIL_FROM: env.EMAIL_FROM,
        SENTRY_DSN: env.SENTRY_DSN,
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    });
}

/**
 * Pure feature-flag resolver: returns `true` if and only if every key in
 * `requiredKeys` is present in `env` with a value that contains at least one
 * non-whitespace character. Absent, empty, or whitespace-only values yield
 * `false`. The result is a boolean only — no environment value is exposed.
 *
 * Req 12.2, 12.3, 13.1, 13.2, 14.1, 14.2.
 *
 * @param {string[]} requiredKeys
 * @param {Record<string, unknown>} env
 * @returns {boolean}
 */
export function isIntegrationEnabled(requiredKeys, env) {
    if (!Array.isArray(requiredKeys) || requiredKeys.length === 0) return false;
    const source = env ?? {};

    return requiredKeys.every((key) => {
        const value = source[key];
        return typeof value === "string" && value.trim().length > 0;
    });
}

/**
 * Required-key lists for each credential-gated integration. An integration is
 * enabled only when all of its keys resolve to non-blank values.
 *
 * Req 15.3.
 */
export const INTEGRATIONS = Object.freeze({
    email: ["EMAIL_HOST", "EMAIL_PORT", "EMAIL_AUTH_USER", "EMAIL_AUTH_PASS", "EMAIL_FROM"],
    sentry: ["SENTRY_DSN"],
    google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
});
