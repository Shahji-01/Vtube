// ---------------------PLAYLIST VALIDATION SCHEMAS-----------------------------
//
// Per-route validation schemas for the playlists router. Each schema is a
// plain object shaped `{ params?, query?, body? }` consumed by the centralized
// `validate(schema)` middleware. Rules are the reusable, side-effect-free field
// validators from `./validators.js`.
//
// Field names mirror exactly what the controllers read:
//   - body field for create/update is `playlistName` (see playlist.controller.js)
//   - route params are `playlistId`, `videoId`, and `userId`
//
// Requirements: 1.6, 1.7, 2.1, 3.7

import { isObjectId, required, nonBlank } from "./validators.js";

/**
 * POST / — create a playlist. Requires a non-empty `playlistName` in the body
 * (the exact field the controller reads).
 */
export const createPlaylistSchema = {
  body: {
    playlistName: [required, nonBlank],
  },
};

/**
 * GET|PATCH|DELETE /:playlistId — reject a malformed `playlistId` with 400
 * before any database access or ownership lookup.
 */
export const playlistIdParamSchema = {
  params: {
    playlistId: isObjectId,
  },
};

/**
 * PATCH /add/:videoId/:playlistId and PATCH /remove/:videoId/:playlistId —
 * both route params must be valid ObjectIds.
 */
export const videoPlaylistParamsSchema = {
  params: {
    videoId: isObjectId,
    playlistId: isObjectId,
  },
};

/**
 * GET /user/:userId — reject a malformed `userId` with 400 before any query.
 */
export const userIdParamSchema = {
  params: {
    userId: isObjectId,
  },
};
