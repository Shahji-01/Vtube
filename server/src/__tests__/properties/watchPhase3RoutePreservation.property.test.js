/**
 * Feature: phase-3-viewer-features, Property 14: Existing routes are preserved and Watch Later never touches playlists
 *
 * Property 14 has two halves, both proven here without real I/O:
 *
 *  1. Route preservation — the live `/api/v1/` (method, path) surface exposed by
 *     `createApp` (all integration flags OFF) equals the checked-in baseline
 *     (`serverRouteKeys`) exactly, and grows over the pre-Phase-3 surface ONLY by
 *     the documented additive Phase 3 routes (two watch-progress + three
 *     watch-later pairs). Every pre-Phase-3 route is still present; zero existing
 *     entries are removed or method-changed. Routes are enumerated from the
 *     assembled Express app exactly as the existing `routeMapBaseline` suite does.
 *
 *  2. Playlist isolation — for any Watch Later add or remove operation, NO read or
 *     write is ever issued against the Playlist collection. The Playlist model is
 *     mocked with spies on every method; the real `addToWatchLater` /
 *     `removeFromWatchLater` controllers are invoked across fast-check-varied
 *     inputs (existing/missing video, add or remove) and every Playlist spy must
 *     record zero calls.
 *
 * Validates: Requirements 4.12, 6.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — route preservation
// ─────────────────────────────────────────────────────────────────────────────

import { createApp } from "../../app.js";
import { serverRouteKeys } from "../fixtures/routeBaseline.js";

// All integrations OFF — blank/absent required vars (mirrors isIntegrationEnabled
// and the existing routeMapBaseline suite).
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

// The documented additive Phase 3 routes — the ONLY way the surface may grow.
const PHASE3_ADDITIVE_ROUTE_KEYS = Object.freeze(
  new Set([
    "PUT /api/v1/watch-progress/:videoId",
    "GET /api/v1/watch-progress/:videoId",
    "POST /api/v1/watch-later/:videoId",
    "DELETE /api/v1/watch-later/:videoId",
    "GET /api/v1/watch-later/",
  ]),
);

// The pre-Phase-3 baseline = the current baseline minus the additive Phase 3 keys.
const PRE_PHASE3_ROUTE_KEYS = Object.freeze(
  new Set([...serverRouteKeys].filter((k) => !PHASE3_ADDITIVE_ROUTE_KEYS.has(k))),
);

/**
 * Decode an Express 4 mounted-router layer regexp back into its `/api/v1/...`
 * mount prefix. Returns null for any regexp that is not an `/api/v1` mount.
 * (Mirrors the existing routeMapBaseline suite.)
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

describe("Property 14a: existing routes are preserved (surface grows only by the additive Phase 3 routes)", () => {
  it("the live /api/v1 (method,path) set equals the baseline and adds exactly the documented Phase 3 routes", () => {
    fc.assert(
      // The route surface is input-independent; re-assemble repeatedly to prove
      // deterministic equality with the checked-in baseline (>=100 runs).
      fc.property(fc.integer(), () => {
        const app = createApp({ env: ALL_OFF_ENV });
        const live = extractApiRouteKeys(app);

        // Exact equality with the documented baseline.
        const missing = [...serverRouteKeys].filter((k) => !live.has(k));
        const extra = [...live].filter((k) => !serverRouteKeys.has(k));
        expect(missing).toEqual([]);
        expect(extra).toEqual([]);
        expect(live).toEqual(new Set(serverRouteKeys));

        // Every pre-Phase-3 route is still present — none removed or method-changed.
        const removed = [...PRE_PHASE3_ROUTE_KEYS].filter((k) => !live.has(k));
        expect(removed).toEqual([]);

        // The surface grows over the pre-Phase-3 baseline ONLY by the additive set.
        const grew = [...live].filter((k) => !PRE_PHASE3_ROUTE_KEYS.has(k));
        expect(new Set(grew)).toEqual(new Set(PHASE3_ADDITIVE_ROUTE_KEYS));
      }),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — Watch Later never touches the Playlist collection
// ─────────────────────────────────────────────────────────────────────────────

// Hoisted spies shared with the vi.mock factories. The Playlist mock records a
// call on EVERY method the controllers could conceivably reach; any non-zero
// count fails the property.
const {
  playlistSpies,
  watchLaterFindOneAndUpdate,
  watchLaterFindOne,
  watchLaterFindOneAndDelete,
  videoFindById,
} = vi.hoisted(() => {
  const playlistSpies = {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
    aggregate: vi.fn(),
    countDocuments: vi.fn(),
  };

  const store = new Map();
  return {
    playlistSpies,
    // In-memory upsert mimicking the unique {user, video} index.
    watchLaterFindOneAndUpdate: vi.fn(async (filter, update) => {
      const key = `${filter.user}|${filter.video}`;
      if (!store.has(key)) {
        store.set(key, { _id: `wl-${key}`, ...update.$setOnInsert });
      }
      return store.get(key);
    }),
    watchLaterFindOne: vi.fn(async (filter) => {
      const key = `${filter.user}|${filter.video}`;
      return store.get(key) ?? null;
    }),
    watchLaterFindOneAndDelete: vi.fn(async (filter) => {
      const key = `${filter.user}|${filter.video}`;
      const existing = store.get(key) ?? null;
      store.delete(key);
      return existing;
    }),
    videoFindById: vi.fn(),
  };
});

vi.mock("../../models/playlist.model.js", () => ({
  Playlist: playlistSpies,
}));
vi.mock("../../models/watchLater.model.js", () => ({
  WatchLater: {
    findOneAndUpdate: watchLaterFindOneAndUpdate,
    findOne: watchLaterFindOne,
    findOneAndDelete: watchLaterFindOneAndDelete,
  },
}));
vi.mock("../../models/video.model.js", () => ({
  Video: { findById: videoFindById },
}));

const { addToWatchLater, removeFromWatchLater } = await import(
  "../../controllers/watchLater.controller.js"
);

const RUNS = { numRuns: 150 };

/** Chainable res spy that records every json payload it receives. */
function makeRes() {
  const res = { payloads: [] };
  res.status = vi.fn(() => res);
  res.json = vi.fn((body) => {
    res.payloads.push(body);
    return res;
  });
  return res;
}

/** Flush queued micro/macro tasks so asyncHandler's promise chain settles. */
async function flush() {
  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Invoke the asyncHandler-wrapped controller once and return the next spy. */
async function runHandler(handler, req, res) {
  const next = vi.fn();
  handler(req, res, next);
  await flush();
  return next;
}

const objectIdArb = fc.hexaString({ minLength: 24, maxLength: 24 });

beforeEach(() => {
  for (const spy of Object.values(playlistSpies)) spy.mockClear();
  watchLaterFindOneAndUpdate.mockClear();
  watchLaterFindOne.mockClear();
  watchLaterFindOneAndDelete.mockClear();
  videoFindById.mockReset();
});

describe("Property 14b: Watch Later add/remove never touches the Playlist collection", () => {
  it("no Playlist method is read or written during any add or remove operation", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        objectIdArb,
        // op: "add" or "remove"; videoExists controls the 404 vs success path.
        fc.constantFrom("add", "remove"),
        fc.boolean(),
        async (userId, videoId, op, videoExists) => {
          // Reset Playlist spies per run so a zero count means "never touched here".
          for (const spy of Object.values(playlistSpies)) spy.mockClear();

          // Video.findById only matters for the add path (remove never loads it).
          if (videoExists) {
            videoFindById.mockResolvedValue({ _id: videoId, duration: 100 });
          } else {
            videoFindById.mockResolvedValue(null);
          }

          const req = { params: { videoId }, user: { _id: userId } };
          const res = makeRes();
          const handler = op === "add" ? addToWatchLater : removeFromWatchLater;
          await runHandler(handler, req, res);

          // The core invariant: the Playlist collection is never touched.
          for (const [name, spy] of Object.entries(playlistSpies)) {
            expect(
              spy,
              `Playlist.${name} was called during a watch-later ${op}`,
            ).not.toHaveBeenCalled();
          }
        },
      ),
      RUNS,
    );
  });
});
