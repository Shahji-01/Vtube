import { ApiError } from "../utils/ApiError.js";

/**
 * requireModerator — authorization guard that restricts access to moderators
 * and admins.
 *
 * MUST run AFTER `verifyJWT`, which populates `req.user`. The guard enforces:
 *   - 403 if `req.user` is absent (request was not authenticated)
 *   - 403 if `req.user.role` is neither "moderator" nor "admin"
 *
 * On success control passes to `next()`.
 *
 * The 403 message is intentionally generic and never echoes the user's role.
 *
 * @type {import("express").RequestHandler}
 */
export const requireModerator = (req, _res, next) => {
  const role = req.user?.role;

  if (!req.user || (role !== "moderator" && role !== "admin")) {
    throw new ApiError(403, "Moderator access required");
  }

  next();
};
