/**
 * Feature: phase-4-social-discovery, Property 16: The route baseline is preserved and grows only additively
 *
 * The live `/api/v1/` (method, path) surface exposed by `createApp` (all
 * integration flags OFF) is enumerated from the assembled Express app exactly
 * as the Phase 3 route-preservation suite does. The property proves three
 * things, all without real I/O:
 *
 *  1. The live route-key set equals the checked-in baseline (`serverRouteKeys`,
 *     which now includes the additive Phase 4 set) exactly — no entry missing,
 *     none extra.
 *
 *  2. The pre-Phase-4 baseline (`serverRouteKeys` minus the documented Phase 4
 *     additive routes) is fully contained in the live set — every pre-existing
 *     `(method, path)` pair is still present, none removed or method-changed.
 *
 *  3. The live surface grows over the pre-Phase-4 baseline by EXACTLY the
 *     documented additive Phase 4 routes (search suggestions, comment
 *     pin/unpin, and the four reports endpoints) — nothing more, nothing less.
 *
 * Validates: Requirements 5.1, 5.2
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createApp } from "../../app.js";
import { serverRouteKeys } from "../fixtures/routeBaseline.js";

// All integrations OFF — blank/absent required vars (mirrors isIntegrationEnabled
// and the existing route-preservation suites).
const ALL_OFF_ENV = Object.freeze({
  EMAIL_HOST: "",
  EMAIL_PORT: "   ",
  EMAIL_AUTH_USER: undefined,
  EMAIL_AUTH_PASS: "",
  EMAIL_FROM: undefined,
  SENTRY_DSN: "  ",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: undefined,
});

// The documented additive Phase 4 routes — the ONLY way the surface may grow
// over the pre-Phase-4 baseline.
const PHASE4_ADDITIVE_ROUTE_KEYS = Object.freeze(
  new Set([
    "GET /api/v1/videos/search/suggestions",
    "PATCH /api/v1/comments/c/:comment_Id/pin",
    "PATCH /api/v1/comments/c/:comment_Id/unpin",
    "POST /api/v1/reports/",
    "GET /api/v1/reports/",
    "PATCH /api/v1/reports/:reportId/resolve",
    "PATCH /api/v1/reports/:reportId/dismiss",
  ]),
);

// The pre-Phase-4 baseline = the current baseline minus the additive Phase 4 keys.
const PRE_PHASE4_ROUTE_KEYS = Object.freeze(
  new Set([...serverRouteKeys].filter((k) => !PHASE4_ADDITIVE_ROUTE_KEYS.has(k))),
);

/**
 * Decode an Express 4 mounted-router layer regexp back into its `/api/v1/...`
 * mount prefix. Returns null for any regexp that is not an `/api/v1` mount.
 * (Mirrors the existing route-preservation suites.)
 */
function decodeMountPath(regexp) {
  const src = regexp.toString();
  const stripped = src
    .replace(/^\/\^/, "")
    .replace(/\\\/\?\(\?=\\\/\|\$\)\/i$/, "")
    .replace(/\\\//g, "/");
  if (!stripped.startsWith("/api/v1")) return null;
  return stripped;
}

/** Extract the set of "METHOD /api/v1/..." keys mounted on an assembled app. */
function extractApiRouteKeys(app) {
  const keys = new Set();
  const stack = app._router?.stack ?? [];

  for (const layer of stack) {
    if (layer.route && typeof layer.route.path === "string") {
      const p = layer.route.path;
      if (p.startsWith("/api/v1/")) {
        for (const method of Object.keys(layer.route.methods)) {
          if (layer.route.methods[method]) keys.add(`${method.toUpperCase()} ${p}`);
        }
      }
      continue;
    }

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

describe("Property 16: the route baseline is preserved and grows only additively", () => {
  it("the live /api/v1 set equals the baseline, keeps every pre-Phase-4 route, and grows by exactly the additive Phase 4 routes", () => {
    fc.assert(
      // The route surface is input-independent; re-assemble repeatedly to prove
      // deterministic equality with the checked-in baseline (>=100 runs).
      fc.property(fc.integer(), () => {
        const app = createApp({ env: ALL_OFF_ENV });
        const live = extractApiRouteKeys(app);

        // (1) Exact equality with the documented baseline (which includes Phase 4).
        const missing = [...serverRouteKeys].filter((k) => !live.has(k));
        const extra = [...live].filter((k) => !serverRouteKeys.has(k));
        expect(missing).toEqual([]);
        expect(extra).toEqual([]);
        expect(live).toEqual(new Set(serverRouteKeys));

        // (2) Every pre-Phase-4 route is still present — none removed or method-changed.
        const removed = [...PRE_PHASE4_ROUTE_KEYS].filter((k) => !live.has(k));
        expect(removed).toEqual([]);

        // (3) The surface grows over the pre-Phase-4 baseline ONLY by the additive set.
        const grew = [...live].filter((k) => !PRE_PHASE4_ROUTE_KEYS.has(k));
        expect(new Set(grew)).toEqual(new Set(PHASE4_ADDITIVE_ROUTE_KEYS));
      }),
      { numRuns: 100 },
    );
  });
});
