// ---------------------PHASE 4 ROUTE-WIRING / MIDDLEWARE-ORDER EXAMPLES--------
//
// Example tests that assert the Phase-4 routes are wired onto their Express
// routers with the correct guard middleware, handler COUNT, and registration
// ORDER — all by static introspection, without booting an HTTP server.
//
// How Express exposes wiring (used by the helpers below):
//   - A router keeps every registration as a `Layer` in `router.stack`, in the
//     exact order they were declared. Route layers carry a `.route` with
//     `.path` and `.methods` (a `{ get: true, ... }` map).
//   - Each route's handler chain lives in `route.stack`: one sub-`Layer` per
//     handler, tagged with `.method` (lowercase verb) and `.name`.
//   - Express sets `layer.name = handler.name || "<anonymous>"`. Direct arrow
//     assignments keep their name (`optionalJWT`, `requireModerator`,
//     `enforceDateRange`), while `asyncHandler(...)` results, `validate(schema)`
//     return values, and factory-built guards (`verifyVideoOwnerOfComment(...)`)
//     are anonymous. We therefore assert middleware IDENTITY only on the names
//     Express reliably surfaces, and otherwise assert on handler COUNT (which is
//     stable regardless of anonymity).
//
// The MUST-PASS correctness point is that `GET /videos/search/suggestions` is
// registered BEFORE `GET /:video_Id`, so the literal path matches ahead of the
// id param (R2.8).
//
// Validates: Requirements 5.3, 2.8

import { describe, it, expect } from "vitest";

import videoRouter from "../../routes/video.route.js";
import commentRouter from "../../routes/comment.route.js";
import reportRouter from "../../routes/report.route.js";

// ── Introspection helpers over the Express router/route layer arrays ──────────

/** The first route layer registered for `path` (or undefined). */
const routeLayer = (router, path) =>
  router.stack.find((l) => l.route && l.route.path === path);

/** Registration-order index of the first route layer matching path[+method]. */
const routeIndex = (router, path, method) =>
  router.stack.findIndex(
    (l) =>
      l.route &&
      l.route.path === path &&
      (method ? Boolean(l.route.methods?.[method]) : true),
  );

/** Is a handler registered for the given path + HTTP method? */
const hasRoute = (router, path, method) =>
  Boolean(routeLayer(router, path)?.route.methods?.[method]);

/** Handler `.name`s for one HTTP method on a route, in handler order. */
function handlerNames(router, path, method) {
  const layer = routeLayer(router, path);
  if (!layer) return [];
  return layer.route.stack
    .filter((s) => s.method === method)
    .map((s) => s.name);
}

/** Number of handlers wired for one HTTP method on a route. */
const handlerCount = (router, path, method) =>
  handlerNames(router, path, method).length;

// ── Report router ─────────────────────────────────────────────────────────────
//
// Expected chains (per task 7.3):
//   POST   /                   → verifyJWT, validate, createReport          (3)
//   GET    /                   → verifyJWT, requireModerator, validate, …   (4)
//   PATCH  /:reportId/resolve  → verifyJWT, requireModerator, validate, …   (4)
//   PATCH  /:reportId/dismiss  → verifyJWT, requireModerator, validate, …   (4)

describe("report router middleware order", () => {
  it("wires POST / as a 3-handler chain WITHOUT the moderator guard", () => {
    expect(hasRoute(reportRouter, "/", "post")).toBe(true);
    // verifyJWT → validate → createReport.
    expect(handlerCount(reportRouter, "/", "post")).toBe(3);
    expect(handlerNames(reportRouter, "/", "post")).not.toContain(
      "requireModerator",
    );
  });

  it("wires GET / with the moderator guard, giving it MORE handlers than POST /", () => {
    expect(hasRoute(reportRouter, "/", "get")).toBe(true);
    // verifyJWT → requireModerator → validate → listReports.
    const getNames = handlerNames(reportRouter, "/", "get");
    expect(getNames).toContain("requireModerator");
    expect(getNames.length).toBe(4);
    // The extra requireModerator means GET has one more handler than POST.
    expect(getNames.length).toBeGreaterThan(
      handlerCount(reportRouter, "/", "post"),
    );
    // requireModerator runs after verifyJWT (index 0) and before the controller.
    const modIdx = getNames.indexOf("requireModerator");
    expect(modIdx).toBeGreaterThan(0);
    expect(modIdx).toBeLessThan(getNames.length - 1);
  });

  it("wires resolve/dismiss as 4-handler moderator chains", () => {
    for (const path of ["/:reportId/resolve", "/:reportId/dismiss"]) {
      expect(hasRoute(reportRouter, path, "patch")).toBe(true);
      const names = handlerNames(reportRouter, path, "patch");
      // verifyJWT → requireModerator → validate → controller.
      expect(names.length).toBe(4);
      expect(names).toContain("requireModerator");
      const modIdx = names.indexOf("requireModerator");
      expect(modIdx).toBeGreaterThan(0); // after verifyJWT
      expect(modIdx).toBeLessThan(names.length - 1); // before the controller
    }
  });
});

// ── Comment router ────────────────────────────────────────────────────────────
//
// Expected chains (per task 7.2):
//   PATCH /c/:comment_Id/pin    → verifyJWT, validate, verifyVideoOwnerOfComment, pinComment   (4)
//   PATCH /c/:comment_Id/unpin  → verifyJWT, validate, verifyVideoOwnerOfComment, unpinComment (4)

describe("comment router middleware order", () => {
  it.each(["/c/:comment_Id/pin", "/c/:comment_Id/unpin"])(
    "wires PATCH %s as a 4-handler owner-guarded chain",
    (path) => {
      expect(hasRoute(commentRouter, path, "patch")).toBe(true);
      // verifyJWT → validate → verifyVideoOwnerOfComment → controller.
      // All four are anonymous (asyncHandler/validate/factory results), so we
      // assert on the stable handler COUNT rather than fragile names.
      expect(handlerCount(commentRouter, path, "patch")).toBe(4);
    },
  );
});

// ── Video router ──────────────────────────────────────────────────────────────

describe("video router middleware order", () => {
  // The MUST-PASS correctness assertion (R2.8): the literal suggestions path is
  // registered ahead of the id param so Express matches it first.
  it("registers GET /search/suggestions BEFORE GET /:video_Id", () => {
    const suggestionsIdx = routeIndex(videoRouter, "/search/suggestions", "get");
    const videoIdIdx = routeIndex(videoRouter, "/:video_Id");

    expect(suggestionsIdx).toBeGreaterThanOrEqual(0);
    expect(videoIdIdx).toBeGreaterThanOrEqual(0);
    expect(suggestionsIdx).toBeLessThan(videoIdIdx);
  });

  it("wires GET /search/suggestions with optionalJWT + validate before the controller", () => {
    const names = handlerNames(videoRouter, "/search/suggestions", "get");
    // optionalJWT → validate(autocompleteQuery) → searchSuggestions.
    expect(names.length).toBe(3);
    expect(names).toContain("optionalJWT");
    expect(names.indexOf("optionalJWT")).toBeLessThan(names.length - 1);
  });

  it("wires validate + enforceDateRange before the controller on GET /", () => {
    const names = handlerNames(videoRouter, "/", "get");
    // optionalJWT → validate(getAllVideosQuery) → enforceDateRange → cache → getAllVideos.
    expect(names).toContain("optionalJWT");
    expect(names).toContain("enforceDateRange");

    const optionalJwtIdx = names.indexOf("optionalJWT");
    const enforceIdx = names.indexOf("enforceDateRange");
    const lastIdx = names.length - 1; // controller is the final handler

    // optionalJWT runs first; enforceDateRange sits after it and before the
    // controller. The anonymous validate layer lives between them.
    expect(optionalJwtIdx).toBeLessThan(enforceIdx);
    expect(enforceIdx).toBeLessThan(lastIdx);
    // At least: optionalJWT, validate, enforceDateRange, controller.
    expect(names.length).toBeGreaterThanOrEqual(4);
  });
});
