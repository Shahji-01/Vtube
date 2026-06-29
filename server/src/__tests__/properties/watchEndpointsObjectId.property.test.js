/**
 * Feature: phase-3-viewer-features, Property 11: New routes reject invalid ids before any database access
 *
 * Validates: Requirements 3.3, 4.3
 *
 * For any `:videoId` route param that is NOT a valid Mongo ObjectId supplied to
 * one of the four new Phase 3 endpoints — watch-progress save (`PUT`),
 * watch-progress fetch (`GET`), watch-later add (`POST`), and watch-later
 * remove (`DELETE`) — the `validate(videoIdParamSchema)` middleware rejects the
 * request with HTTP 400 and an Error_Response naming the `videoId` field,
 * BEFORE the controller or any database query runs.
 *
 * `validate` runs standalone ahead of the controller, so exercising it in
 * isolation already proves rejection precedes any DB access. To make that
 * explicit, a mock model spy stands in for the data layer and must remain
 * uncalled. No real DB or network I/O.
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { isValidObjectId } from "mongoose";

import { validate } from "../../middlewares/validate.middleware.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  videoIdParamSchema as watchProgressVideoIdParamSchema,
  saveProgressBodySchema,
} from "../../validators/watchProgress.schema.js";
import { videoIdParamSchema as watchLaterVideoIdParamSchema } from "../../validators/watchLater.schema.js";

const RUNS = { numRuns: 200 };

// The four new Phase 3 endpoints, each with the real `validate(...)` schema(s)
// its router wires ahead of the controller.
const ENDPOINTS = [
  {
    name: "watch-progress save (PUT /:videoId)",
    // Mirrors the router: validate(videoIdParamSchema + saveProgressBodySchema).
    schema: {
      ...watchProgressVideoIdParamSchema,
      ...saveProgressBodySchema,
    },
  },
  {
    name: "watch-progress fetch (GET /:videoId)",
    schema: watchProgressVideoIdParamSchema,
  },
  {
    name: "watch-later add (POST /:videoId)",
    schema: watchLaterVideoIdParamSchema,
  },
  {
    name: "watch-later remove (DELETE /:videoId)",
    schema: watchLaterVideoIdParamSchema,
  },
];

// Generator of strings that are NOT valid Mongo ObjectIds: empty, whitespace,
// non-hex, symbols, and hex strings that are too short or too long.
const invalidVideoId = fc.oneof(
  fc.string(),
  fc.constant(""),
  fc.constant("   "),
  fc.integer().map(String),
  fc.lorem(),
  fc.stringMatching(/^[!@#$%^&*()_+={}\[\]:;"'<>,.?/\\|~`-]+$/),
  fc.hexaString({ minLength: 0, maxLength: 23 }),
  fc.hexaString({ minLength: 25, maxLength: 40 }),
);

describe("Property 11: new watch routes reject invalid ids before any database access", () => {
  for (const endpoint of ENDPOINTS) {
    it(`${endpoint.name} rejects with 400 naming videoId and never queries the model`, () => {
      fc.assert(
        fc.property(invalidVideoId, (rawVideoId) => {
          // Only test ids that are genuinely NOT valid ObjectIds.
          fc.pre(!isValidObjectId(rawVideoId));

          // A mock data layer whose methods must never be touched before the
          // id is validated.
          const model = {
            findById: vi.fn(),
            findOne: vi.fn(),
            findOneAndUpdate: vi.fn(),
            find: vi.fn(),
            create: vi.fn(),
            deleteOne: vi.fn(),
          };

          const req = { params: { videoId: rawVideoId }, query: {}, body: {} };
          const next = vi.fn();
          const controller = vi.fn((r) => model.findById(r.params.videoId));

          // Express flow: the controller (which queries the DB) only runs if
          // validate calls next() with no error.
          validate(endpoint.schema)(req, {}, (err) => {
            next(err);
            if (!err) controller(req);
          });

          // Rejected with a 400 ApiError naming the offending parameter.
          expect(next).toHaveBeenCalledTimes(1);
          const err = next.mock.calls[0][0];
          expect(err).toBeInstanceOf(ApiError);
          expect(err.statusCode).toBe(400);
          expect(err.errors.some((e) => e.field === "videoId")).toBe(true);

          // No database access occurred for the bad identifier.
          expect(controller).not.toHaveBeenCalled();
          expect(model.findById).not.toHaveBeenCalled();
          expect(model.findOne).not.toHaveBeenCalled();
          expect(model.findOneAndUpdate).not.toHaveBeenCalled();
          expect(model.find).not.toHaveBeenCalled();
          expect(model.create).not.toHaveBeenCalled();
          expect(model.deleteOne).not.toHaveBeenCalled();
        }),
        RUNS,
      );
    });
  }
});
