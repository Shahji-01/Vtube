/**
 * Feature: phase-2-quality-hardening, Property 3: Invalid ObjectId is rejected
 * before any database access.
 *
 * Validates: Requirements 1.1, 1.4
 * (Phase-1 design Property 3 — Validates Requirements 1.7, 6.1)
 *
 * For any string that is not a valid Mongo ObjectId supplied as a
 * resource-identifying parameter, `validate({ params: { id: isObjectId } })`
 * rejects the request with HTTP 400 and an Error_Response naming the offending
 * parameter, and no database query is issued for that identifier.
 *
 * A mock model spy stands in for the data layer; it must remain uncalled. No
 * real DB or network I/O.
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { isValidObjectId } from "mongoose";

import { validate } from "../../middlewares/validate.middleware.js";
import { ApiError } from "../../utils/ApiError.js";
import { isObjectId } from "../../validators/validators.js";

const RUNS = { numRuns: 200 };

const SCHEMA = { params: { id: isObjectId } };

describe("Property 3: invalid ObjectId is rejected before any database access", () => {
  it("rejects with 400 naming the id param and never queries the model", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.constant(""),
          fc.constant("   "),
          fc.integer().map(String),
          fc.lorem(),
          fc.hexaString({ minLength: 0, maxLength: 23 }),
          fc.hexaString({ minLength: 25, maxLength: 40 }),
        ),
        (rawId) => {
          // Only test ids that are genuinely NOT valid ObjectIds.
          fc.pre(!isValidObjectId(rawId));

          // A mock data layer whose methods must never be touched.
          const model = {
            findById: vi.fn(),
            findOne: vi.fn(),
            find: vi.fn(),
          };

          const req = { params: { id: rawId }, query: {}, body: {} };
          const next = vi.fn();
          const controller = vi.fn((r) => model.findById(r.params.id));

          // Express flow: the controller (which queries the DB) only runs if
          // validate calls next() with no error.
          validate(SCHEMA)(req, {}, (err) => {
            next(err);
            if (!err) controller(req);
          });

          // Rejected with a 400 ApiError naming the offending parameter.
          expect(next).toHaveBeenCalledTimes(1);
          const err = next.mock.calls[0][0];
          expect(err).toBeInstanceOf(ApiError);
          expect(err.statusCode).toBe(400);
          expect(err.errors.some((e) => e.field === "id")).toBe(true);

          // No database access occurred for the bad identifier.
          expect(controller).not.toHaveBeenCalled();
          expect(model.findById).not.toHaveBeenCalled();
          expect(model.findOne).not.toHaveBeenCalled();
          expect(model.find).not.toHaveBeenCalled();
        },
      ),
      RUNS,
    );
  });
});
