/**
 * googleOAuth.service.js — Environment-driven Google sign-in (Req 14).
 *
 * Gated entirely on the `GOOGLE_*` credentials via
 * `isIntegrationEnabled(INTEGRATIONS.google, env)`:
 *
 * - Enabled (both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET present & non-blank):
 *   `verifyAndResolveUser(idToken)` verifies a Google ID token through
 *   google-auth-library's OAuth2Client with the GOOGLE_CLIENT_ID audience and
 *   requires `email_verified`. A verified email matching an existing User
 *   authenticates that account (Req 14.4); a verified email with no match
 *   creates exactly one new User and authenticates it (Req 14.5). Any failure,
 *   cancellation, or unverified email creates nothing, changes nothing, and
 *   returns a stable non-leaking error result (Req 14.6).
 * - Disabled (either var absent or blank): `verifyAndResolveUser` performs no
 *   external action and returns a stable "feature unavailable" result; the
 *   module raises no startup error (Req 14.2, 14.7).
 *
 * This module ONLY verifies the Google identity and resolves/creates the User.
 * Session establishment (cookies + ApiResponse shape, Req 14.3) is the
 * caller/route's responsibility (task 6.7).
 *
 * Req 14.1, 14.2, 14.4, 14.5, 14.6, 14.7.
 */

import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { loadEnv, isIntegrationEnabled, INTEGRATIONS } from "../config/env.js";
import { User } from "../models/user.model.js";
import logger from "../config/logger.js";

/** Stable result returned while the feature is disabled (Req 14.7). */
const FEATURE_UNAVAILABLE = Object.freeze({ ok: false, code: "FEATURE_UNAVAILABLE" });

/** Stable, non-leaking failure for verification problems (Req 14.6). */
const AUTH_FAILED = Object.freeze({ ok: false, code: "AUTH_FAILED" });

/** Placeholder avatar used when Google supplies no picture (avatar is required). */
const DEFAULT_AVATAR = "https://www.gravatar.com/avatar/?d=mp";

/**
 * Resolve the enabled flag at module load from the process environment.
 * Both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be non-blank.
 */
export const enabled = isIntegrationEnabled(INTEGRATIONS.google, loadEnv());

/**
 * Lazily-constructed verifier client. Built only when enabled so a disabled
 * deployment never instantiates an OAuth client (Req 14.2).
 */
const client = enabled ? new OAuth2Client(loadEnv().GOOGLE_CLIENT_ID) : null;

/**
 * Derive a unique, schema-valid username from an email local-part. The model
 * requires usernames to be unique and lowercase, so the base is sanitized and a
 * short random suffix is appended until an unused value is found.
 *
 * @param {string} email
 * @returns {Promise<string>}
 */
async function generateUniqueUsername(email) {
    const base =
        String(email)
            .split("@")[0]
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, "")
            .slice(0, 20) || "user";

    // Try the bare base first, then append random suffixes until unique.
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate =
            attempt === 0 ? base : `${base}-${crypto.randomBytes(3).toString("hex")}`;
        // eslint-disable-next-line no-await-in-loop
        const existing = await User.findOne({ username: candidate }).select("_id").lean();
        if (!existing) return candidate;
    }

    // Extremely unlikely fallback: a fully random username.
    return `user-${crypto.randomBytes(6).toString("hex")}`;
}

/**
 * Verify a Google ID token and resolve it to a VTube User.
 *
 * When disabled, returns FEATURE_UNAVAILABLE without touching the database
 * (Req 14.7). When enabled, verifies the token against the GOOGLE_CLIENT_ID
 * audience and requires a verified email. An existing account is returned as-is
 * (Req 14.4); otherwise exactly one new account is created and returned
 * (Req 14.5). On any verification failure, cancellation, or unverified email,
 * nothing is created or modified and AUTH_FAILED is returned (Req 14.6).
 *
 * @param {string} idToken - The Google ID token from the client sign-in flow.
 * @returns {Promise<{ ok: true, user: object, created: boolean } | { ok: false, code: string }>}
 */
export async function verifyAndResolveUser(idToken) {
    if (!enabled || !client) return FEATURE_UNAVAILABLE;

    if (typeof idToken !== "string" || idToken.trim().length === 0) {
        return AUTH_FAILED;
    }

    let payload;
    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: loadEnv().GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
    } catch (error) {
        // Redacted: never log the token or any credential — only the error name.
        logger.error({ operation: "google-verify", errName: error?.name }, "Google ID token verification failed");
        return AUTH_FAILED;
    }

    // Require a Google-verified email (Req 14.6).
    const email = payload?.email?.toLowerCase();
    const emailVerified = payload?.email_verified === true || payload?.email_verified === "true";
    if (!email || !emailVerified) {
        return AUTH_FAILED;
    }

    // Existing account by verified email → authenticate it, no duplicate (Req 14.4).
    const existing = await User.findOne({ email });
    if (existing) {
        return { ok: true, user: existing, created: false };
    }

    // No match → create exactly one new account for that email (Req 14.5).
    try {
        const username = await generateUniqueUsername(email);
        const user = await User.create({
            username,
            email,
            fullName: payload?.name?.trim() || username,
            avatar: payload?.picture || DEFAULT_AVATAR,
            // Random, unguessable password the user never uses (login is via Google).
            password: crypto.randomBytes(32).toString("hex"),
        });
        return { ok: true, user, created: true };
    } catch (error) {
        // A duplicate-key race means another request created the account first;
        // resolve to that existing account rather than failing (Req 14.5).
        if (error?.code === 11000) {
            const raced = await User.findOne({ email });
            if (raced) return { ok: true, user: raced, created: false };
        }
        logger.error({ operation: "google-create", errName: error?.name }, "Google account provisioning failed");
        return AUTH_FAILED;
    }
}

export default { enabled, verifyAndResolveUser };
