/**
 * googleOAuth.service.test.js — Unit tests for verifyAndResolveUser (Task 6.8).
 *
 * Validates: Requirements 14.3, 14.4, 14.5, 14.6, 14.7
 *
 * google-auth-library's OAuth2Client is mocked so `verifyIdToken` returns a
 * controllable payload, and the User model is mocked so no real DB is touched.
 * The module-load-time `enabled` flag (derived from GOOGLE_* env vars) is set
 * per case via process.env + vi.resetModules + dynamic import.
 *
 * Asserts:
 *  - disabled (no GOOGLE_* vars) -> FEATURE_UNAVAILABLE, no DB access (14.7)
 *  - verified email matching an existing user -> that user, created:false,
 *    no new user created (14.4)
 *  - verified email with no match -> exactly one new user, created:true (14.5)
 *  - unverified email or a verify throw -> AUTH_FAILED, no user created (14.6)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stable mock fns shared across module reloads.
const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
const { userModel } = vi.hoisted(() => ({
    userModel: { findOne: vi.fn(), create: vi.fn() },
}));

vi.mock("google-auth-library", () => ({
    OAuth2Client: vi.fn(() => ({ verifyIdToken })),
}));

vi.mock("../../models/user.model.js", () => ({ User: userModel }));

/**
 * Build a value that works both when awaited directly (User.findOne({ email }))
 * and when chained as `.select(...).lean()` (the username-uniqueness lookup).
 */
function queryResult(value) {
    return {
        select() {
            return this;
        },
        lean() {
            return Promise.resolve(value);
        },
        then(resolve, reject) {
            return Promise.resolve(value).then(resolve, reject);
        },
    };
}

const GOOGLE_ENV = {
    GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "client-secret-value",
};

const ORIGINAL = {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
};

function enableGoogleEnv() {
    process.env.GOOGLE_CLIENT_ID = GOOGLE_ENV.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = GOOGLE_ENV.GOOGLE_CLIENT_SECRET;
}

function disableGoogleEnv() {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
}

/** Load a fresh copy of the service with the current env applied. */
async function loadService() {
    vi.resetModules();
    return import("../../services/googleOAuth.service.js");
}

const verifiedTicket = (email) => ({
    getPayload: () => ({ email, email_verified: true, name: "Test User", picture: null }),
});

beforeEach(() => {
    verifyIdToken.mockReset();
    userModel.findOne.mockReset();
    userModel.create.mockReset();
});

afterEach(() => {
    if (ORIGINAL.id === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = ORIGINAL.id;
    if (ORIGINAL.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = ORIGINAL.secret;
});

describe("verifyAndResolveUser — disabled (Req 14.7)", () => {
    it("returns FEATURE_UNAVAILABLE and touches no DB or verifier when GOOGLE_* is absent", async () => {
        disableGoogleEnv();
        const mod = await loadService();

        expect(mod.enabled).toBe(false);
        const res = await mod.verifyAndResolveUser("any-token");

        expect(res).toEqual({ ok: false, code: "FEATURE_UNAVAILABLE" });
        expect(verifyIdToken).not.toHaveBeenCalled();
        expect(userModel.findOne).not.toHaveBeenCalled();
        expect(userModel.create).not.toHaveBeenCalled();
    });
});

describe("verifyAndResolveUser — enabled (Req 14.3, 14.4, 14.5, 14.6)", () => {
    beforeEach(() => {
        enableGoogleEnv();
    });

    it("returns the existing user (created:false) without creating a new one (Req 14.4)", async () => {
        const existing = { _id: "u1", email: "match@example.com", username: "match" };
        verifyIdToken.mockResolvedValue(verifiedTicket("match@example.com"));
        userModel.findOne.mockImplementation(() => queryResult(existing));

        const mod = await loadService();
        const res = await mod.verifyAndResolveUser("valid-token");

        expect(res).toEqual({ ok: true, user: existing, created: false });
        expect(userModel.create).not.toHaveBeenCalled();
    });

    it("creates exactly one new user (created:true) when no account matches (Req 14.5)", async () => {
        const created = { _id: "u2", email: "new@example.com", username: "new" };
        verifyIdToken.mockResolvedValue(verifiedTicket("new@example.com"));
        // No existing account by email and no username collision.
        userModel.findOne.mockImplementation(() => queryResult(null));
        userModel.create.mockResolvedValue(created);

        const mod = await loadService();
        const res = await mod.verifyAndResolveUser("valid-token");

        expect(res).toEqual({ ok: true, user: created, created: true });
        expect(userModel.create).toHaveBeenCalledTimes(1);
        const payload = userModel.create.mock.calls[0][0];
        expect(payload.email).toBe("new@example.com");
    });

    it("returns AUTH_FAILED and creates nothing for an unverified email (Req 14.6)", async () => {
        verifyIdToken.mockResolvedValue({
            getPayload: () => ({ email: "unverified@example.com", email_verified: false }),
        });
        userModel.findOne.mockImplementation(() => queryResult(null));

        const mod = await loadService();
        const res = await mod.verifyAndResolveUser("valid-token");

        expect(res).toEqual({ ok: false, code: "AUTH_FAILED" });
        expect(userModel.create).not.toHaveBeenCalled();
    });

    it("returns AUTH_FAILED and creates nothing when verification throws (Req 14.6)", async () => {
        verifyIdToken.mockRejectedValue(new Error("invalid token signature"));

        const mod = await loadService();
        const res = await mod.verifyAndResolveUser("tampered-token");

        expect(res).toEqual({ ok: false, code: "AUTH_FAILED" });
        expect(userModel.findOne).not.toHaveBeenCalled();
        expect(userModel.create).not.toHaveBeenCalled();
    });

    it("returns AUTH_FAILED for a blank token without invoking the verifier", async () => {
        const mod = await loadService();
        const res = await mod.verifyAndResolveUser("   ");

        expect(res).toEqual({ ok: false, code: "AUTH_FAILED" });
        expect(verifyIdToken).not.toHaveBeenCalled();
        expect(userModel.create).not.toHaveBeenCalled();
    });
});
