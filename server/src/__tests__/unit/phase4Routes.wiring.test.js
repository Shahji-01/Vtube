// ---------------------PHASE 4 ROUTE-WIRING EXAMPLE TESTS----------------------
//
// Example tests that assert the Phase-4 routes are wired onto their Express
// routers with the correct method, registration order, and guard middleware —
// without booting an HTTP server. We inspect each router's `.stack` (the array
// of Express `Layer`s, preserved in registration order) and, per route, its
// `route.stack` (the per-handler `Layer`s, each tagged with a `.method` and a
// `.name`).
//
// Name-matching notes (what Express actually exposes on `Layer.name`):
//   - Express sets `layer.name = handler.name || "<anonymous>"`.
//   - `optionalJWT`, `enforceDateRange`, and `requireModerator` are declared as
//     direct arrow-function assignments, so their function `.name` is preserved
//     and reliably matchable.
//   - `verifyJWT` (an `asyncHandler(...)` call result), every `validate(schema)`
//     return value, and the asyncHandler-wrapped controllers are anonymous, so
//     they surface as `"<anonymous>"`. We therefore assert only on the names
//     Express reliably exposes (per the task): `requireModerator` presence /
//     absence, `enforceDateRange` presence, and the suggestions-before-:video_Id
//     ordering.
//
// Requirements: 5.3, 2.8

import { describe, it, expect } from "vitest";

import videoRouter from "../../routes/video.route.js";
import commentRouter from "../../routes/comment.route.js";
import reportRouter from "../../routes/report.route.js";

// ── Helpers over the Express router/route layer arrays ────────────────────────

/** All layers in a router that carry a declared `route` (skip mount/middleware). */
const routeLayers = (router) => router.stack.filter((l) => l.route);

/** Index (registration order) of the first route layer matching path[+method]. */
function routeIndex(router, path, method) {
  return router.stack.findIndex(
    (l) =>
      l.route &&
      l.route.path === path &&
      (method ? Boolean(l.route.methods?.[method]) : true),
  );
}

/** The route layer for a given path (or undefined). */
function routeLayer(router, path) {
  return router.stack.find((l) => l.route && l.route.path === path);
}

/** Does a path exist with the given HTTP method registered on it? */
function hasRoute(router, path, method) {
  const layer = routeLayer(router, path);
  return Boolean(layer && layer.route.methods?.[method]);
}

/**
 * Handler `.name`s for one HTTP method on a route layer, in handler order.
 * Express tags each handler sub-layer with `.method` (lowercase) and `.name`.
 */
function handlerNames(router, path, method) {
  const layer = routeLayer(router, path);
  if (!layer) return [];
  return layer.route.stack.filter((s) => s.method === method).map((s) => s.name);
}

// ── Video router ──────────────────────────────────────────────────────────────

describe("video router wiring", () => {
  it("registers GET /search/suggestions", () => {
    expect(hasRoute(videoRouter, "/search/suggestions", "get")).toBe(true);
  });

  it("registers GET /search/suggestions BEFORE the /:video_Id layer", () => {
    const suggestionsIdx = routeIndex(videoRouter, "/search/suggestions", "get");
    const videoIdIdx = routeIndex(videoRouter, "/:video_Id");

    expect(suggestionsIdx).toBeGreaterThanOrEqual(0);
    expect(videoIdIdx).toBeGreaterThanOrEqual(0);
    // Express preserves registration order in router.stack, so a smaller index
    // means the literal path is matched ahead of the id param (R2.8, R5.3).
    expect(suggestionsIdx).toBeLessThan(videoIdIdx);
  });

  it("wires enforceDateRange (after optionalJWT, before the controller) on GET /", () => {
    const names = handlerNames(videoRouter, "/", "get");

    // enforceDateRange is a named middleware Express exposes reliably.
    expect(names).toContain("enforceDateRange");
    // optionalJWT (also a direct arrow assignment) runs first.
    expect(names).toContain("optionalJWT");

    const optionalJwtIdx = names.indexOf("optionalJWT");
    const enforceIdx = names.indexOf("enforceDateRange");
    const lastIdx = names.length - 1; // the controller is the final handler

    // Order: optionalJWT → ... → enforceDateRange → ... → controller (last).
    expect(optionalJwtIdx).toBeLessThan(enforceIdx);
    expect(enforceIdx).toBeLessThan(lastIdx);
  });
});

// ── Comment router ────────────────────────────────────────────────────────────

describe("comment router wiring", () => {
  it("registers PATCH /c/:comment_Id/pin", () => {
    expect(hasRoute(commentRouter, "/c/:comment_Id/pin", "patch")).toBe(true);
  });

  it("registers PATCH /c/:comment_Id/unpin", () => {
    expect(hasRoute(commentRouter, "/c/:comment_Id/unpin", "patch")).toBe(true);
  });
});

// ── Report router ─────────────────────────────────────────────────────────────

describe("report router wiring", () => {
  it("registers POST / and GET / on the root path", () => {
    expect(hasRoute(reportRouter, "/", "post")).toBe(true);
    expect(hasRoute(reportRouter, "/", "get")).toBe(true);
  });

  it("registers PATCH /:reportId/resolve and PATCH /:reportId/dismiss", () => {
    expect(hasRoute(reportRouter, "/:reportId/resolve", "patch")).toBe(true);
    expect(hasRoute(reportRouter, "/:reportId/dismiss", "patch")).toBe(true);
  });

  it("guards GET / with requireModerator but NOT POST /", () => {
    expect(handlerNames(reportRouter, "/", "get")).toContain("requireModerator");
    expect(handlerNames(reportRouter, "/", "post")).not.toContain("requireModerator");
  });

  it("guards resolve and dismiss with requireModerator", () => {
    expect(handlerNames(reportRouter, "/:reportId/resolve", "patch")).toContain(
      "requireModerator",
    );
    expect(handlerNames(reportRouter, "/:reportId/dismiss", "patch")).toContain(
      "requireModerator",
    );
  });

  it("exposes exactly the four documented Phase-4 report routes", () => {
    const paths = routeLayers(reportRouter).map((l) => l.route.path);
    expect(new Set(paths)).toEqual(
      new Set(["/", "/:reportId/resolve", "/:reportId/dismiss"]),
    );
  });
});
