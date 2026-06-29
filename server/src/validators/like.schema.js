// ---------------------LIKE ROUTE VALIDATION SCHEMAS----------------------------
//
// Per-route validation schemas for the likes route group, consumed by the
// centralized `validate(schema)` middleware. Each schema is shaped
// `{ params?, query?, body? }` mapping a field name to a rule (or array of
// rules) from `./validators.js`.
//
// These are toggle endpoints (not owned-resource update/delete) so they only
// guard the id-bearing param with an ObjectId check. Middleware order on the
// router is: verifyJWT → validate → controller.
//
// Requirements: 1.6, 1.7, 2.1

import { isObjectId } from "./validators.js";

/** Param schema: `:videoId` must be a valid Mongo ObjectId. */
export const videoIdParam = {
  params: { videoId: isObjectId },
};

/** Param schema: `:commentId` must be a valid Mongo ObjectId. */
export const commentIdParam = {
  params: { commentId: isObjectId },
};

/** Param schema: `:tweetId` must be a valid Mongo ObjectId. */
export const tweetIdParam = {
  params: { tweetId: isObjectId },
};
