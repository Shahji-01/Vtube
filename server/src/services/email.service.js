/**
 * email.service.js — Environment-driven transactional email (Req 12).
 *
 * Built from `loadEnv()` and gated entirely on the `EMAIL_*` Email_Config
 * variables via `isIntegrationEnabled(INTEGRATIONS.email, env)`:
 *
 * - Enabled (every EMAIL_* var present & non-blank): a real nodemailer SMTP
 *   transport is created from EMAIL_HOST/PORT/AUTH_USER/AUTH_PASS with EMAIL_FROM
 *   as the sender. `sendVerificationEmail` / `sendPasswordResetEmail` send with a
 *   hard 30 s timeout. On any send failure or timeout the service logs a redacted
 *   `error` record and returns a failure result WITHOUT throwing (Req 12.6).
 * - Disabled (any EMAIL_* var absent or blank): the methods perform no send and
 *   return a stable `{ ok: false, code: "FEATURE_UNAVAILABLE" }`; constructing
 *   the service raises no startup error (Req 12.3, 12.4).
 *
 * Tokens are caller-provided single-use values that the caller must issue with a
 * ≤ 60-minute expiry (Req 12.5); this service only transmits them and embeds no
 * other Secret_Value in the message.
 *
 * Req 12.1, 12.2, 12.3, 12.4, 12.5, 12.6.
 */

import nodemailer from "nodemailer";
import { loadEnv, isIntegrationEnabled, INTEGRATIONS } from "../config/env.js";
import logger from "../config/logger.js";

/** Hard ceiling for a single send attempt, in milliseconds (Req 12.6). */
const SEND_TIMEOUT_MS = 30_000;

/** Stable result returned by every method while the service is disabled. */
const FEATURE_UNAVAILABLE = Object.freeze({ ok: false, code: "FEATURE_UNAVAILABLE" });

/**
 * Reject after `ms` so a stalled SMTP send cannot hang the caller (Req 12.6).
 *
 * @param {number} ms
 * @returns {{ promise: Promise<never>, cancel: () => void }}
 */
function timeoutAfter(ms) {
    let handle;
    const promise = new Promise((_resolve, reject) => {
        handle = setTimeout(() => {
            const err = new Error("Email send timed out");
            err.code = "ETIMEDOUT";
            reject(err);
        }, ms);
    });
    return { promise, cancel: () => clearTimeout(handle) };
}

/**
 * Send one message through the transport, bounded by SEND_TIMEOUT_MS. On
 * success returns `{ ok: true, messageId }`; on failure/timeout it logs a
 * redacted `error` record and returns `{ ok: false, code: "SEND_FAILED" }`
 * without throwing (Req 12.6). The log carries no Email_Config value or token —
 * only the operation name and the (recipient-free) error name/code.
 *
 * @param {import("nodemailer").Transporter} transport
 * @param {{ from: string, to: string, subject: string, text: string, html: string }} message
 * @param {string} operation - Label for the log record (e.g. "verification").
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, code: "SEND_FAILED" }>}
 */
async function sendWithTimeout(transport, message, operation) {
    const timer = timeoutAfter(SEND_TIMEOUT_MS);
    try {
        const info = await Promise.race([transport.sendMail(message), timer.promise]);
        return { ok: true, messageId: info?.messageId };
    } catch (error) {
        // Redacted: never log the recipient, token, or any EMAIL_* credential.
        logger.error(
            { operation, errName: error?.name, errCode: error?.code },
            "Email send failed"
        );
        return { ok: false, code: "SEND_FAILED" };
    } finally {
        timer.cancel();
    }
}

/**
 * Build the email service for a given environment view. Exposed as a factory so
 * it is unit-testable with stubbed env objects; a process-env-backed default
 * instance is exported below.
 *
 * @param {Record<string, unknown>} [env=loadEnv()] - Environment view.
 * @returns {{ enabled: boolean, sendVerificationEmail: Function, sendPasswordResetEmail: Function }}
 */
export function createEmailService(env = loadEnv()) {
    const enabled = isIntegrationEnabled(INTEGRATIONS.email, env);

    // Disabled: no transport, no startup error; methods are stable no-ops.
    if (!enabled) {
        return Object.freeze({
            enabled: false,
            async sendVerificationEmail() {
                return FEATURE_UNAVAILABLE;
            },
            async sendPasswordResetEmail() {
                return FEATURE_UNAVAILABLE;
            },
        });
    }

    const from = env.EMAIL_FROM;
    const transport = nodemailer.createTransport({
        host: env.EMAIL_HOST,
        port: Number(env.EMAIL_PORT),
        // SMTPS (implicit TLS) on 465; STARTTLS otherwise.
        secure: Number(env.EMAIL_PORT) === 465,
        auth: {
            user: env.EMAIL_AUTH_USER,
            pass: env.EMAIL_AUTH_PASS,
        },
    });

    /**
     * Send an account-verification email carrying the caller-issued token.
     *
     * @param {string} to - Recipient address.
     * @param {string} token - Single-use verification token (caller-issued, ≤ 60 min).
     * @returns {Promise<{ ok: boolean, code?: string, messageId?: string }>}
     */
    async function sendVerificationEmail(to, token) {
        return sendWithTimeout(
            transport,
            {
                from,
                to,
                subject: "Verify your VTube account",
                text:
                    "Use the following single-use code to verify your account. " +
                    `It expires within 60 minutes.\n\n${token}\n`,
                html:
                    "<p>Use the following single-use code to verify your account. " +
                    "It expires within 60 minutes.</p>" +
                    `<p><strong>${token}</strong></p>`,
            },
            "verification"
        );
    }

    /**
     * Send a password-reset email carrying the caller-issued token.
     *
     * @param {string} to - Recipient address.
     * @param {string} token - Single-use reset token (caller-issued, ≤ 60 min).
     * @returns {Promise<{ ok: boolean, code?: string, messageId?: string }>}
     */
    async function sendPasswordResetEmail(to, token) {
        return sendWithTimeout(
            transport,
            {
                from,
                to,
                subject: "Reset your VTube password",
                text:
                    "Use the following single-use code to reset your password. " +
                    `It expires within 60 minutes.\n\n${token}\n`,
                html:
                    "<p>Use the following single-use code to reset your password. " +
                    "It expires within 60 minutes.</p>" +
                    `<p><strong>${token}</strong></p>`,
            },
            "password-reset"
        );
    }

    return Object.freeze({ enabled: true, sendVerificationEmail, sendPasswordResetEmail });
}

/**
 * Process-env-backed default instance for app wiring (routes mounted in 6.2).
 */
const emailService = createEmailService();

export default emailService;
