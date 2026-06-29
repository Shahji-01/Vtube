/**
 * Feature: phase-2-quality-hardening, Property 7
 *
 * Property 7: Ownership guard authorizes correctly and never mutates on rejection.
 * Validates: Requirements 1.1, 1.4
 *
 * `verifyOwnership(Model, idParam)` is exercised with a mocked Mongoose model
 * (no real DB). Across arbitrary id / owner / requester triples we assert:
 *   - owner === requester           -> next() with no error and req.resource set
 *   - owner !== requester           -> 403, req.resource NOT set, doc unmutated
 *   - document missing (null)       -> 404, req.resource NOT set
 *   - id is not a valid ObjectId    -> 400, rejected BEFORE any Model.findById
 *
 * The mocked model records every findById call so we can prove invalid ids are
 * rejected before any database access, and that rejected requests never stash a
 * resource or mutate the loaded document.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isValidObjectId, Types } from "mongoose";

import { verifyOwnership } from "../../middlewares/ownership.middleware.js";

// A fresh, valid 24-hex ObjectId string.
const objectIdArb = fc
  .hexaString({ minLength: 24, maxLength: 24 })
  .filter((s) => isValidObjectId(s));

// A string that is NOT a valid ObjectId (so it must be rejected with 400).
const invalidIdArb = fc.string().filter((s) => !isValidObjectId(s));

/**
 * Build a mocked Mongoose model whose findById resolves to `docToReturn`
 * (or null) and records the ids it was asked to look up.
 */
function makeModel(docToReturn) {
  const calls = [];
  return {
    calls,
    Model: {
      async findById(id) {
        calls.push(id);
        return docToReturn;
      },
    },
  };
}

/**
 * Run the (asyncHandler-wrapped) middleware to completion. asyncHandler calls
 * `next` exactly once — with an error on rejection, or with nothing on success —
 * so resolving inside `next` captures the terminal outcome.
 */
function runMiddleware(mw, req) {
  return new Promise((resolve) => {
    const res = {};
    const next = (err) =>
      resolve({ err, resourceSet: Object.prototype.hasOwnProperty.call(req, "resource") });
    mw(req, res, next);
  });
}

describe("Property 7: ownership guard authorizes correctly and never mutates on rejection", () => {
  it("owner === requester -> passes control and stashes the resource", async () => {
    await fc.assert(
      fc.asyncProperty(objectIdArb, objectIdArb, async (resId, ownerId) => {
        const doc = { _id: resId, owner: new Types.ObjectId(ownerId), title: "x" };
        const { Model } = makeModel(doc);
        const mw = verifyOwnership(Model, "id");
        const req = { params: { id: resId }, user: { _id: new Types.ObjectId(ownerId) } };

        const { err, resourceSet } = await runMiddleware(mw, req);

        expect(err).toBeUndefined();
        expect(resourceSet).toBe(true);
        expect(req.resource).toBe(doc);
      }),
      { numRuns: 150 },
    );
  });

  it("owner !== requester -> 403, no resource stashed, document unmutated", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        objectIdArb,
        objectIdArb,
        async (resId, ownerId, requesterId) => {
          fc.pre(ownerId !== requesterId);
          const doc = { _id: resId, owner: new Types.ObjectId(ownerId), title: "x" };
          const snapshot = JSON.stringify(doc);
          const { Model } = makeModel(doc);
          const mw = verifyOwnership(Model, "id");
          const req = { params: { id: resId }, user: { _id: new Types.ObjectId(requesterId) } };

          const { err, resourceSet } = await runMiddleware(mw, req);

          expect(err).toBeDefined();
          expect(err.statusCode).toBe(403);
          expect(resourceSet).toBe(false);
          // The 403 message discloses no stored resource content.
          expect(err.message).not.toContain(doc.title);
          // The loaded document is never mutated on rejection.
          expect(JSON.stringify(doc)).toBe(snapshot);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("document missing -> 404 and no resource stashed", async () => {
    await fc.assert(
      fc.asyncProperty(objectIdArb, objectIdArb, async (resId, requesterId) => {
        const { Model, calls } = makeModel(null);
        const mw = verifyOwnership(Model, "id");
        const req = { params: { id: resId }, user: { _id: new Types.ObjectId(requesterId) } };

        const { err, resourceSet } = await runMiddleware(mw, req);

        expect(err).toBeDefined();
        expect(err.statusCode).toBe(404);
        expect(resourceSet).toBe(false);
        // A lookup was attempted (id was valid) but yielded nothing.
        expect(calls).toEqual([resId]);
      }),
      { numRuns: 150 },
    );
  });

  it("invalid id -> 400 and rejected before any database access", async () => {
    await fc.assert(
      fc.asyncProperty(invalidIdArb, objectIdArb, async (badId, requesterId) => {
        const { Model, calls } = makeModel({ _id: "ignored", owner: requesterId });
        const mw = verifyOwnership(Model, "id");
        const req = { params: { id: badId }, user: { _id: new Types.ObjectId(requesterId) } };

        const { err, resourceSet } = await runMiddleware(mw, req);

        expect(err).toBeDefined();
        expect(err.statusCode).toBe(400);
        expect(resourceSet).toBe(false);
        // No DB access occurred — invalid ids are rejected before findById.
        expect(calls).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });
});
