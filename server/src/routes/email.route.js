/**
 * email.route.js — Conditionally-mounted email flows (Req 12.2, 12.4, 15.3).
 *
 * Exposes the verification and password-reset *request* endpoints that sit in
 * front of the credential-gated Email_Service. The router is mounted in
 * `app.js` ONLY when the email integration is enabled (every `EMAIL_*` var is
 * present and non-blank); when the integration is disabled the route is never
 * registered, preserving the Phase-1 route baseline (Req 15.3).
 *
 * As a defence-in-depth guard, each handler also re-checks `emailService.enabled`
 * and, if reached while disabled, responds with a stable feature-unavailable
 * `ApiError` that leaks no Secret_Value or Email_Config value (Req 12.4).
 *
 * Tokens are single-use values minted here with a hard ≤ 60-minute expiry
 * (Req 12.5); only the token is transmitted to the recipient by the service.
 */

import { Router } from "express";
import crypto from "crypto";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import emailService from "../services/email.service.js";

const router = Router();

/** Hard ceiling for a freshly issued single-use token, in ms (Req 12.5). */
const TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes

/** Minimal, dependency-free email shape check. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mint a single-use token with an expiry no later than 60 minutes out.
 *
 * @returns {{ token: string, expiresAt: number }}
 */
function issueSingleUseToken() {
    return {
        token: crypto.randomBytes(32).toString("hex"),
        expiresAt: Date.now() + TOKEN_TTL_MS,
    };
}

/**
 * Reject the request with a stable feature-unavailable error when the email
 * integration is disabled. Carries no Secret_Value/Email_Config (Req 12.4).
 */
function assertEmailEnabled() {
    if (!emailService.enabled) {
        throw new ApiError(503, "Email feature is currently unavailable");
    }
}

/**
 * Validate and normalise the recipient address from the request body.
 *
 * @param {unknown} email
 * @returns {string}
 */
function requireEmail(email) {
    if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
        throw new ApiError(400, "A valid email address is required");
    }
    return email.trim().toLowerCase();
}

// POST /verify/request — request an account-verification email.
router.route("/verify/request").post(
    asyncHandler(async (req, res) => {
        assertEmailEnabled();
        const email = requireEmail(req.body?.email);
        const { token, expiresAt } = issueSingleUseToken();

        const result = await emailService.sendVerificationEmail(email, token);
        if (!result?.ok) {
            throw new ApiError(502, "Unable to send verification email");
        }

        return res
            .status(202)
            .json(
                new ApiResponse(
                    202,
                    { expiresAt },
                    "Verification email requested"
                )
            );
    })
);

// POST /password-reset/request — request a password-reset email.
router.route("/password-reset/request").post(
    asyncHandler(async (req, res) => {
        assertEmailEnabled();
        const email = requireEmail(req.body?.email);
        const { token, expiresAt } = issueSingleUseToken();

        const result = await emailService.sendPasswordResetEmail(email, token);
        if (!result?.ok) {
            throw new ApiError(502, "Unable to send password-reset email");
        }

        return res
            .status(202)
            .json(
                new ApiResponse(
                    202,
                    { expiresAt },
                    "Password-reset email requested"
                )
            );
    })
);

export default router;
