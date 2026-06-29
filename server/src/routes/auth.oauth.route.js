/**
 * auth.oauth.route.js — Conditionally-mounted Google sign-in (Req 14.1–14.3, 14.7, 15.3).
 *
 * Exposes `POST /google`, which accepts a Google `idToken` in the request body,
 * delegates verification + user resolution to `googleOAuth.service`
 * (`verifyAndResolveUser`), and — on success — establishes a VTube session by
 * issuing `accessToken` + `refreshToken` cookies with the SAME cookie options
 * (`{ httpOnly: true, secure: true }`) and the SAME `ApiResponse` success shape
 * used by `loginUser` (Req 14.3).
 *
 * The router is mounted in `app.js` ONLY when the Google integration is enabled
 * (both `GOOGLE_*` vars present and non-blank); when disabled the route is never
 * registered, preserving the route baseline (Req 14.2, 14.7, 15.3).
 *
 * As defence-in-depth, a non-ok service result is mapped to a stable, non-leaking
 * `ApiError`: 401 for `AUTH_FAILED` and 503 for `FEATURE_UNAVAILABLE`. No Google
 * config, secret, or token value is ever surfaced to the client (Req 14.6).
 */

import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { rotateRefreshToken } from "../services/tokenService.js";
import { verifyAndResolveUser } from "../services/googleOAuth.service.js";
import { cookieOptions } from "../config/cookies.js";

const router = Router();

/**
 * Cookie options matching `loginUser` — resolved from the environment so the
 * Google-login session cookies are hardened consistently with the rest of the
 * app (HttpOnly always; Secure in production; configurable SameSite, e.g.
 * `none` for a cross-site Vercel↔Render deployment).
 */
const COOKIE_OPTIONS = cookieOptions();

/**
 * Map a non-ok Google verification result to a stable, non-leaking ApiError.
 *
 * @param {{ code?: string }} result
 * @returns {never}
 */
function rejectGoogleResult(result) {
    if (result?.code === "FEATURE_UNAVAILABLE") {
        throw new ApiError(503, "Google sign-in is currently unavailable");
    }
    // Default to AUTH_FAILED — never reveal *why* verification failed.
    throw new ApiError(401, "Google authentication failed");
}

// POST /google — verify a Google ID token and establish a session.
router.route("/google").post(
    asyncHandler(async (req, res) => {
        const idToken = req.body?.idToken;

        const result = await verifyAndResolveUser(idToken);
        if (!result?.ok) {
            rejectGoogleResult(result);
        }

        // Issue a fresh access/refresh token pair and persist the refresh token
        // as the rotation anchor (mirrors the credential-login token flow).
        const { accessToken, refreshToken } = await rotateRefreshToken(
            User,
            result.user._id
        );

        const loggedInUser = await User.findById(result.user._id).select(
            "-password -refreshToken"
        );

        return res
            .status(200)
            .cookie("refreshToken", refreshToken, COOKIE_OPTIONS)
            .cookie("accessToken", accessToken, COOKIE_OPTIONS)
            .json(
                new ApiResponse(
                    200,
                    {
                        user: loggedInUser,
                        accessToken,
                        refreshToken,
                    },
                    "User successfully logged in"
                )
            );
    })
);

export default router;
