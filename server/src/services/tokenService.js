/**
 * Refresh-token rotation service (Req 8.1, 8.2).
 *
 * Model-injected so it is unit-testable: the caller passes the Mongoose `User`
 * model (or any compatible stand-in exposing `findById`), keeping this module
 * free of direct model imports and external configuration.
 *
 * `rotateRefreshToken` generates a fresh access token and a fresh refresh token
 * via the user document's existing instance methods, then persists the new
 * refresh token to the document as the rotation anchor. Because the stored value
 * is replaced, the previously presented refresh token no longer matches the
 * persisted one, so any later request reusing it is rejected (Req 8.2).
 */

import { ApiError } from "../utils/ApiError.js";

/**
 * Rotate the refresh token for a user.
 *
 * @param {{ findById: (id: any) => Promise<any> }} User - The User model (injected).
 * @param {*} userId - The id of the user whose tokens are rotated.
 * @returns {Promise<{ accessToken: string, refreshToken: string }>} The newly issued tokens.
 * @throws {ApiError} 401 when the user cannot be found.
 * @throws {Error} Propagates any persistence error from `save` so the caller can
 *   reject the request and leave the prior token/cookie unchanged (Req 8.6).
 */
export async function rotateRefreshToken(User, userId) {
  const user = await User.findById(userId);

  if (!user) {
    // No account to rotate against — caller treats this as unauthorized.
    throw new ApiError(401, "Invalid refresh token");
  }

  // Generate the new credentials from the user's existing instance methods.
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Persist the new refresh token as the rotation anchor. Once saved, the prior
  // token no longer equals the stored value, so reuse is rejected downstream.
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
}
