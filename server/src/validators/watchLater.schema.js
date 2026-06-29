// ---------------------WATCH LATER ROUTE VALIDATION SCHEMAS--------------------
//
// Per-route validation schemas for the watch-later route group, consumed by the
// centralized `validate(schema)` middleware. Each schema is shaped
// `{ params?, query?, body? }` mapping a field name to a rule (or array of
// rules) from `./validators.js`.
//
// The add/remove endpoints are keyed by `:videoId`, so the only validation
// these routes need is that the `videoId` route param is a valid Mongo
// ObjectId. The check runs before any database access; a malformed id is
// rejected with HTTP 400 naming the `videoId` field. Middleware order on the
// router is: validate → verifyJWT → controller.
//
// Requirements: 4.3, 6.2

import { isObjectId } from "./validators.js";

/**
 * POST|DELETE /:videoId — reject a malformed `videoId` with 400 before any
 * database access. The field name in the resulting Error_Response is `videoId`.
 */
export const videoIdParamSchema = {
  params: {
    videoId: isObjectId,
  },
};
