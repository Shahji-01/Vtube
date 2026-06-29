import { isValidObjectId } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { Comment } from "../models/comment.model.js";
import { Video } from "../models/video.model.js";

/**
 * verifyOwnership — reusable ownership-guard middleware factory.
 *
 * Loads the target document by the route parameter `idParam`, then enforces:
 *   - 400 if the supplied id is not a valid Mongo ObjectId (rejected before lookup)
 *   - 404 if no document with that id exists
 *   - 403 if the document's `ownerField` does not match the authenticated user
 *
 * On success the loaded document is stashed on `req.resource` (so the controller
 * can reuse it without issuing a second query) and control passes to `next()`.
 *
 * The 403 message is intentionally generic and never echoes stored resource
 * content beyond confirming the resource exists.
 *
 * @param {import("mongoose").Model} Model   Mongoose model to look the document up in.
 * @param {string} idParam                   Name of the route param holding the resource id.
 * @param {string} [ownerField="owner"]      Field on the document holding the owner's id.
 * @returns {import("express").RequestHandler}
 */
export const verifyOwnership = (Model, idParam, ownerField = "owner") =>
  asyncHandler(async (req, _res, next) => {
    const id = req.params?.[idParam];

    if (!isValidObjectId(id)) {
      throw new ApiError(400, "Invalid resource id");
    }

    const doc = await Model.findById(id);
    if (!doc) {
      throw new ApiError(404, "Resource not found");
    }

    if (doc[ownerField]?.toString() !== req.user?._id?.toString()) {
      throw new ApiError(403, "You are not allowed to modify this resource");
    }

    req.resource = doc; // reusable by the controller (avoids a second query)
    next();
  });

/**
 * verifyVideoOwnerOfComment — ownership-by-parent guard middleware factory.
 *
 * Authorizes an action on a comment based on ownership of the comment's parent
 * video (e.g. pin/unpin), rather than ownership of the comment itself. Loads the
 * comment by the route parameter `commentIdParam`, resolves its parent video, and
 * enforces:
 *   - 400 if the supplied id is not a valid Mongo ObjectId (rejected before lookup)
 *   - 404 if no comment with that id exists
 *   - 404 if the comment's parent video no longer exists
 *   - 403 if the video's `owner` does not match the authenticated user
 *
 * On success the loaded comment is stashed on `req.resource` (so the controller
 * can reuse it without issuing a second query) and control passes to `next()`.
 *
 * @param {string} [commentIdParam="comment_Id"] Name of the route param holding the comment id.
 * @returns {import("express").RequestHandler}
 */
export const verifyVideoOwnerOfComment = (commentIdParam = "comment_Id") =>
  asyncHandler(async (req, _res, next) => {
    const id = req.params?.[commentIdParam];

    if (!isValidObjectId(id)) {
      throw new ApiError(400, "Invalid resource id");
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      throw new ApiError(404, "Comment not found");
    }

    const video = await Video.findById(comment.video);
    if (!video) {
      throw new ApiError(404, "Video not found");
    }

    if (video.owner?.toString() !== req.user?._id?.toString()) {
      throw new ApiError(403, "You are not allowed to modify this resource");
    }

    req.resource = comment; // reusable by the controller (avoids a second query)
    next();
  });
