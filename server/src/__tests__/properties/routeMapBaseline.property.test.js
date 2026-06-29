/**
 * Feature: phase-2-quality-hardening, Property 11
 *
 * Property 11: Route map is preserved (server (method,path) set equals baseline).
 * Validates: Requirements 1.1, 1.5, 15.2
 *
 * With every credential-gated integration flag OFF, the live `createApp`
 * exposes exactly the documented Phase-1 baseline of `/api/v1/` (method, path)
 * pairs (`serverRouteKeys`) — zero added, removed, or method-changed. The
 * extracted set is asserted equal to the baseline across repeated assembly to
 * prove determinism. Routers/models perform no real I/O at assembly time.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { createApp } from "../../app.js";
import { serverRouteKeys } from "../fixtures/routeBaseline.js";

// All integrations OFF — blank/absent required vars (mirrors isIntegrationEnabled).
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

/**
 * Decode an Express 4 mounted-router layer regexp back into its `/api/v1/...`
 * mount prefix. Returns null for any regexp that is not an `/api/v1` mount.
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

describe("Property 11: route map is preserved (server set equals baseline)", () => {
  it("the extracted /api/v1 (method,path) set equals the baseline exactly", () => {
    fc.assert(
      // The route surface is input-independent; re-assemble repeatedly to prove
      // deterministic equality with the checked-in baseline (>=100 runs).
      fc.property(fc.integer(), () => {
        const app = createApp({ env: ALL_OFF_ENV });
        const got = extractApiRouteKeys(app);

        const missing = [...serverRouteKeys].filter((k) => !got.has(k));
        const extra = [...got].filter((k) => !serverRouteKeys.has(k));

        expect(missing).toEqual([]);
        expect(extra).toEqual([]);
        expect(got).toEqual(new Set(serverRouteKeys));
      }),
      { numRuns: 100 },
    );
  });
});
