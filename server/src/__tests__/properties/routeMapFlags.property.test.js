/**
 * Feature: phase-2-quality-hardening, Property 20
 *
 * Property 20: Route map is preserved under integration feature flags.
 * Validates: Requirements 15.2, 15.3
 *
 * For any combination of the three credential-gated integration flags
 * (email, sentry, google), the assembled app's `/api/v1/` `(method, path)` set:
 *   - equals the Phase-1 baseline (`serverRouteKeys`) when all integration
 *     flags are OFF (zero added / removed / method-changed);
 *   - equals the baseline PLUS exactly that integration's routes when a flag is
 *     ON — email adds the `/api/v1/email` routes, google adds the
 *     `/api/v1/auth` route, and sentry never adds (or removes) any route;
 *   - never removes a baseline route and never changes a baseline route's
 *     method, for any flag combination.
 *
 * The integration flags are driven exactly the way production drives them: via
 * the `overrides.env` map passed to `createApp`. A flag is turned ON by setting
 * every one of that integration's required `*_` vars to a non-blank value, and
 * OFF by leaving them blank/absent (mirroring `isIntegrationEnabled`).
 *
 * Route extraction is library-free: we walk the assembled Express app's
 * `_router.stack`, decode each mounted router's `/api/v1/...` prefix from its
 * layer regexp, and join it with each inner route's declared path + methods.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createApp } from "../../app.js";
import { serverRouteKeys } from "../fixtures/routeBaseline.js";

// ── Integration route sets (the only routes a flag may add) ───────────────────
// Email integration (mounted at /api/v1/email) — verify + password-reset.
const EMAIL_ROUTE_KEYS = [
  "POST /api/v1/email/verify/request",
  "POST /api/v1/email/password-reset/request",
];

// Google integration (mounted at /api/v1/auth) — Google sign-in.
const GOOGLE_ROUTE_KEYS = ["POST /api/v1/auth/google"];

// Sentry adds NO routes (error-monitoring is a startup concern, not a router).
const SENTRY_ROUTE_KEYS = [];

// ── Env builders: a flag is ON iff every required var is present + non-blank ──
function emailEnv(on) {
  return on
    ? {
        EMAIL_HOST: "smtp.example.com",
        EMAIL_PORT: "587",
        EMAIL_AUTH_USER: "user@example.com",
        EMAIL_AUTH_PASS: "secret-pass",
        EMAIL_FROM: "no-reply@example.com",
      }
    : {
        // Blank disables — mix of absent / empty / whitespace-only to exercise
        // the same "non-blank" semantics the resolver applies.
        EMAIL_HOST: "",
        EMAIL_PORT: "   ",
        EMAIL_AUTH_USER: undefined,
        EMAIL_AUTH_PASS: "",
        EMAIL_FROM: undefined,
      };
}

function sentryEnv(on) {
  return on ? { SENTRY_DSN: "https://abc@o0.ingest.sentry.io/1" } : { SENTRY_DSN: "  " };
}

function googleEnv(on) {
  return on
    ? { GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "client-secret" }
    : { GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: undefined };
}

/**
 * Decode an Express 4 mounted-router layer regexp back into its `/api/v1/...`
 * mount prefix. Express stores no raw path string for mounted routers, so we
 * reverse the `pathRegexp` encoding:
 *   /^\/api\/v1\/users\/?(?=\/|$)/i  ->  /api/v1/users
 * Returns null for any regexp that is not a recognizable `/api/v1` mount.
 *
 * @param {RegExp} regexp
 * @returns {string | null}
 */
function decodeMountPath(regexp) {
  const src = regexp.toString();
  // Strip the leading `/^` and the trailing `\/?(?=\/|$)/i`, then unescape `\/`.
  const stripped = src
    .replace(/^\/\^/, "")
    .replace(/\\\/\?\(\?=\\\/\|\$\)\/i$/, "")
    .replace(/\\\//g, "/");
  if (!stripped.startsWith("/api/v1")) return null;
  return stripped;
}

/**
 * Extract the set of `"METHOD /api/v1/..."` keys actually mounted on an
 * assembled Express app by walking its router stack (no external libraries).
 *
 * @param {import("express").Express} app
 * @returns {Set<string>}
 */
function extractApiRouteKeys(app) {
  const keys = new Set();
  const stack = app._router?.stack ?? [];

  for (const layer of stack) {
    // Direct route declared on the app itself (e.g. the SPA catch-all `GET *`).
    if (layer.route && typeof layer.route.path === "string") {
      const p = layer.route.path;
      if (p.startsWith("/api/v1/")) {
        for (const method of Object.keys(layer.route.methods)) {
          if (layer.route.methods[method]) keys.add(`${method.toUpperCase()} ${p}`);
        }
      }
      continue;
    }

    // Mounted router (e.g. /api/v1/users) — decode prefix, then walk children.
    if (layer.name === "router" && layer.handle?.stack) {
      const prefix = decodeMountPath(layer.regexp);
      if (!prefix) continue;
      for (const sub of layer.handle.stack) {
        if (!sub.route || typeof sub.route.path !== "string") continue;
        const full = `${prefix}${sub.route.path}`;
        for (const method of Object.keys(sub.route.methods)) {
          if (sub.route.methods[method]) keys.add(`${method.toUpperCase()} ${full}`);
        }
      }
    }
  }

  return keys;
}

/** The expected route-key set for a given flag combination. */
function expectedKeys({ email, google }) {
  const expected = new Set(serverRouteKeys);
  if (email) EMAIL_ROUTE_KEYS.forEach((k) => expected.add(k));
  if (google) GOOGLE_ROUTE_KEYS.forEach((k) => expected.add(k));
  // sentry contributes nothing.
  SENTRY_ROUTE_KEYS.forEach((k) => expected.add(k));
  return expected;
}

describe("Property 20: route map is preserved under integration feature flags", () => {
  it("matches baseline (+ exactly the enabled integration's routes) for every flag combination", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (email, sentry, google) => {
        const env = {
          ...emailEnv(email),
          ...sentryEnv(sentry),
          ...googleEnv(google),
        };

        const app = createApp({ env });
        const got = extractApiRouteKeys(app);
        const expected = expectedKeys({ email, sentry, google });

        // Exact set equality: zero added, zero removed, zero method-changed.
        const missing = [...expected].filter((k) => !got.has(k));
        const extra = [...got].filter((k) => !expected.has(k));
        expect(missing).toEqual([]);
        expect(extra).toEqual([]);
        expect(got.size).toBe(expected.size);

        // Sentry never adds a route: enabling it must not introduce any
        // /api/v1/ key beyond what email/google contribute.
        const baselinePlusEmailGoogle = expectedKeys({ email, google });
        expect([...got].filter((k) => !baselinePlusEmailGoogle.has(k))).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  it("never removes or method-changes a baseline route, under any flag combination", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (email, sentry, google) => {
        const env = {
          ...emailEnv(email),
          ...sentryEnv(sentry),
          ...googleEnv(google),
        };

        const app = createApp({ env });
        const got = extractApiRouteKeys(app);

        // Every baseline (method, path) key is still present and unchanged.
        for (const key of serverRouteKeys) {
          expect(got.has(key)).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("all flags OFF reproduces the baseline exactly", () => {
    const env = { ...emailEnv(false), ...sentryEnv(false), ...googleEnv(false) };
    const got = extractApiRouteKeys(createApp({ env }));
    expect(got).toEqual(new Set(serverRouteKeys));
  });

  it("email ON adds exactly the /api/v1/email routes and nothing else", () => {
    const env = { ...emailEnv(true), ...sentryEnv(false), ...googleEnv(false) };
    const got = extractApiRouteKeys(createApp({ env }));
    expect(got).toEqual(expectedKeys({ email: true }));
    EMAIL_ROUTE_KEYS.forEach((k) => expect(got.has(k)).toBe(true));
    GOOGLE_ROUTE_KEYS.forEach((k) => expect(got.has(k)).toBe(false));
  });

  it("google ON adds exactly the /api/v1/auth route and nothing else", () => {
    const env = { ...emailEnv(false), ...sentryEnv(false), ...googleEnv(true) };
    const got = extractApiRouteKeys(createApp({ env }));
    expect(got).toEqual(expectedKeys({ google: true }));
    GOOGLE_ROUTE_KEYS.forEach((k) => expect(got.has(k)).toBe(true));
    EMAIL_ROUTE_KEYS.forEach((k) => expect(got.has(k)).toBe(false));
  });

  it("sentry ON (alone) adds no routes — set equals the baseline", () => {
    const env = { ...emailEnv(false), ...sentryEnv(true), ...googleEnv(false) };
    const got = extractApiRouteKeys(createApp({ env }));
    expect(got).toEqual(new Set(serverRouteKeys));
  });
});
