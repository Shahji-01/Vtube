/**
 * Feature: phase-4-social-discovery, Property 11: Only the video owner may pin or unpin a comment
 *
 * Validates: Requirements 3.3
 *
 * `verifyVideoOwnerOfComment("comment_Id")` is the ownership-by-parent guard that
 * authorizes pin/unpin actions on a comment based on ownership of the comment's
 * PARENT VIDEO. It loads the comment, resolves its parent video, and compares
 * `video.owner` to `req.user._id`.
 *
 * The real guard is exercised here with the `Comment` and `Video` Mongoose models
 * mocked (no real DB):
 *   - `Comment.findById(id)`      -> a comment `{ _id, video }`
 *   - `Video.findById(videoId)`   -> a video   `{ _id, owner }`
 *
 * Across arbitrary actor/owner id pairs we assert:
 *   - actor !== video.owner  -> next(err) with ApiError statusCode 403, the guard
 *     short-circuits (the controller is never reached) and the comment's `pinned`
 *     state is never changed.
 *   - actor === video.owner  -> next() with no error and the comment is stashed on
 *     `req.resource`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { isValidObjectId, Types } from "mongoose";

// Mock the Mongoose models the guard imports so no real DB is touched. Each mock
// records the ids it was asked to look up.
vi.mock("../../models/comment.model.js", () => ({
  Comment: { findById: vi.fn() },
}));
vi.mock("../../models/video.model.js", () => ({
  Video: { findById: vi.fn() },
}));

import { Comment } from "../../models/comment.model.js";
import { Video } from "../../models/video.model.js";
import { verifyVideoOwnerOfComment } from "../../middlewares/ownership.middleware.js";

// A fresh, valid 24-hex ObjectId string.
const objectIdArb = fc
  .hexaString({ minLength: 24, maxLength: 24 })
  .filter((s) => isValidObjectId(s));

/**
 * Run the (asyncHandler-wrapped) middleware to completion. asyncHandler calls
 * `next` exactly once — with an error on rejection, or with nothing on success —
 * so resolving inside `next` captures the terminal outcome. We also flush
 * microtasks to be sure the async chain has settled.
 */
function runMiddleware(mw, req) {
  return new Promise((resolve) => {
    const res = {};
    const next = (err) =>
      resolve({
        err,
        resourceSet: Object.prototype.hasOwnProperty.call(req, "resource"),
      });
    mw(req, res, next);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Property 11: only the video owner may pin or unpin a comment", () => {
  it("non-owner pin/unpin -> 403 ApiError, controller never reached, pinned state unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        objectIdArb,
        objectIdArb,
        objectIdArb,
        fc.boolean(),
        async (commentId, videoId, ownerId, actorId, initialPinned) => {
          // The actor must differ from the video owner.
          fc.pre(ownerId !== actorId);

          const comment = {
            _id: new Types.ObjectId(commentId),
            video: new Types.ObjectId(videoId),
            pinned: initialPinned,
          };
          const video = {
            _id: new Types.ObjectId(videoId),
            owner: new Types.ObjectId(ownerId),
          };
          const pinnedBefore = comment.pinned;

          Comment.findById.mockResolvedValueOnce(comment);
          Video.findById.mockResolvedValueOnce(video);

          const mw = verifyVideoOwnerOfComment("comment_Id");
          const req = {
            params: { comment_Id: commentId },
            user: { _id: new Types.ObjectId(actorId) },
          };

          const { err, resourceSet } = await runMiddleware(mw, req);

          // Guard short-circuits with a 403 ApiError.
          expect(err).toBeDefined();
          expect(err.statusCode).toBe(403);
          // The controller is never reached: no resource stashed for it to use.
          expect(resourceSet).toBe(false);
          // The comment's pinned state is never changed by the guard.
          expect(comment.pinned).toBe(pinnedBefore);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("video owner -> next() with no error and the comment is stashed on req.resource", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        objectIdArb,
        objectIdArb,
        fc.boolean(),
        async (commentId, videoId, ownerId, initialPinned) => {
          const comment = {
            _id: new Types.ObjectId(commentId),
            video: new Types.ObjectId(videoId),
            pinned: initialPinned,
          };
          const video = {
            _id: new Types.ObjectId(videoId),
            owner: new Types.ObjectId(ownerId),
          };

          Comment.findById.mockResolvedValueOnce(comment);
          Video.findById.mockResolvedValueOnce(video);

          const mw = verifyVideoOwnerOfComment("comment_Id");
          // Same id value as the video owner -> authorized actor.
          const req = {
            params: { comment_Id: commentId },
            user: { _id: new Types.ObjectId(ownerId) },
          };

          const { err, resourceSet } = await runMiddleware(mw, req);

          expect(err).toBeUndefined();
          expect(resourceSet).toBe(true);
          expect(req.resource).toBe(comment);
        },
      ),
      { numRuns: 150 },
    );
  });
});
