/**
 * email.service.test.js — Unit tests for the env-gated email service (Task 6.3).
 *
 * Validates: Requirements 12.3, 12.4, 12.5, 12.6
 *
 * Covers, via the exported `createEmailService(env)` factory:
 *  - Disabled state (no EMAIL_* vars): enabled === false and both send methods
 *    return { ok: false, code: "FEATURE_UNAVAILABLE" } without touching the
 *    transport (Req 12.3, 12.4).
 *  - Enabled state (all EMAIL_* vars): nodemailer is mocked so a resolved
 *    sendMail yields { ok: true } (Req 12.5 — token transmitted), while a
 *    rejected or hanging sendMail yields { ok: false, code: "SEND_FAILED" }
 *    without throwing (Req 12.6). The 30s timeout is exercised with fake timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock nodemailer's default export so no real SMTP transport is created.
const { sendMail, createTransport } = vi.hoisted(() => {
    const sendMail = vi.fn();
    const createTransport = vi.fn(() => ({ sendMail }));
    return { sendMail, createTransport };
});

vi.mock("nodemailer", () => ({ default: { createTransport } }));

import { createEmailService } from "../../services/email.service.js";

const FULL_ENV = Object.freeze({
    EMAIL_HOST: "smtp.example.com",
    EMAIL_PORT: "587",
    EMAIL_AUTH_USER: "mailer@example.com",
    EMAIL_AUTH_PASS: "super-secret-pass",
    EMAIL_FROM: "VTube <noreply@example.com>",
});

beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("createEmailService — disabled state (Req 12.3, 12.4)", () => {
    it("reports enabled === false when EMAIL_* vars are absent and builds no transport", () => {
        const svc = createEmailService({});
        expect(svc.enabled).toBe(false);
        expect(createTransport).not.toHaveBeenCalled();
    });

    it("returns FEATURE_UNAVAILABLE from sendVerificationEmail without sending", async () => {
        const svc = createEmailService({});
        const res = await svc.sendVerificationEmail("user@example.com", "tok-123");
        expect(res).toEqual({ ok: false, code: "FEATURE_UNAVAILABLE" });
        expect(sendMail).not.toHaveBeenCalled();
    });

    it("returns FEATURE_UNAVAILABLE from sendPasswordResetEmail without sending", async () => {
        const svc = createEmailService({});
        const res = await svc.sendPasswordResetEmail("user@example.com", "tok-123");
        expect(res).toEqual({ ok: false, code: "FEATURE_UNAVAILABLE" });
        expect(sendMail).not.toHaveBeenCalled();
    });

    it("treats a partially-configured env (one blank var) as disabled", async () => {
        const svc = createEmailService({ ...FULL_ENV, EMAIL_AUTH_PASS: "   " });
        expect(svc.enabled).toBe(false);
        const res = await svc.sendVerificationEmail("user@example.com", "tok");
        expect(res).toEqual({ ok: false, code: "FEATURE_UNAVAILABLE" });
        expect(createTransport).not.toHaveBeenCalled();
    });
});

describe("createEmailService — enabled state (Req 12.5, 12.6)", () => {
    it("reports enabled === true and constructs a transport from EMAIL_* config", () => {
        const svc = createEmailService(FULL_ENV);
        expect(svc.enabled).toBe(true);
        expect(createTransport).toHaveBeenCalledTimes(1);
        const opts = createTransport.mock.calls[0][0];
        expect(opts.host).toBe("smtp.example.com");
        expect(opts.port).toBe(587);
        expect(opts.auth).toEqual({
            user: "mailer@example.com",
            pass: "super-secret-pass",
        });
    });

    it("returns { ok: true, messageId } and transmits the token when sendMail resolves (Req 12.5)", async () => {
        sendMail.mockResolvedValue({ messageId: "msg-1" });
        const svc = createEmailService(FULL_ENV);

        const res = await svc.sendVerificationEmail("user@example.com", "verify-token");

        expect(res).toEqual({ ok: true, messageId: "msg-1" });
        expect(sendMail).toHaveBeenCalledTimes(1);
        const message = sendMail.mock.calls[0][0];
        expect(message.to).toBe("user@example.com");
        expect(message.from).toBe(FULL_ENV.EMAIL_FROM);
        // The single-use token is carried in the body (Req 12.5).
        expect(message.text).toContain("verify-token");
        expect(message.html).toContain("verify-token");
    });

    it("password-reset send succeeds and carries its token when sendMail resolves", async () => {
        sendMail.mockResolvedValue({ messageId: "msg-reset" });
        const svc = createEmailService(FULL_ENV);

        const res = await svc.sendPasswordResetEmail("user@example.com", "reset-token");

        expect(res).toEqual({ ok: true, messageId: "msg-reset" });
        expect(sendMail.mock.calls[0][0].text).toContain("reset-token");
    });

    it("returns SEND_FAILED without throwing when sendMail rejects (Req 12.6)", async () => {
        sendMail.mockRejectedValue(new Error("SMTP connection refused"));
        const svc = createEmailService(FULL_ENV);

        const res = await svc.sendVerificationEmail("user@example.com", "tok");

        expect(res).toEqual({ ok: false, code: "SEND_FAILED" });
    });

    it("returns SEND_FAILED when sendMail hangs past the 30s timeout (Req 12.6)", async () => {
        vi.useFakeTimers();
        // A promise that never settles simulates a stalled SMTP send.
        sendMail.mockReturnValue(new Promise(() => {}));
        const svc = createEmailService(FULL_ENV);

        const pending = svc.sendPasswordResetEmail("user@example.com", "tok");

        // Advance past the hard 30s ceiling so the timeout fires.
        await vi.advanceTimersByTimeAsync(30_000);

        await expect(pending).resolves.toEqual({ ok: false, code: "SEND_FAILED" });
    });
});
