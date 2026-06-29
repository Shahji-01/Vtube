/**
 * errorMonitoring.test.js — Unit test for Sentry init-failure degradation (Task 6.5).
 *
 * Validates: Requirements 13.3
 *
 * The service resolves its `enabled` flag at module load from a non-blank
 * SENTRY_DSN, then attempts `Sentry.init` in `initErrorMonitoring()`. This test
 * mocks @sentry/node so `init` throws and asserts that:
 *  - initErrorMonitoring() does NOT throw (startup continues),
 *  - the service degrades to enabled === false,
 *  - captureException no-ops without throwing.
 *
 * Module-load-time `enabled` state is controlled with process.env +
 * vi.resetModules + dynamic import so each case gets a fresh module instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Sentry.init throws to simulate an initialization failure (Req 13.3).
vi.mock("@sentry/node", () => ({
    init: vi.fn(() => {
        throw new Error("Sentry init blew up");
    }),
    captureException: vi.fn(),
}));

const ORIGINAL_DSN = process.env.SENTRY_DSN;

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

afterEach(() => {
    if (ORIGINAL_DSN === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = ORIGINAL_DSN;
});

describe("errorMonitoring — init failure degrades to disabled (Req 13.3)", () => {
    it("does not throw, leaves enabled === false, and attempts init when DSN is present", async () => {
        process.env.SENTRY_DSN = "https://public@sentry.example.com/1";
        vi.resetModules();

        const mod = await import("../../services/errorMonitoring.js");
        const Sentry = await import("@sentry/node");

        expect(() => mod.initErrorMonitoring()).not.toThrow();

        // init was attempted exactly once and threw, degrading the service.
        expect(Sentry.init).toHaveBeenCalledTimes(1);
        expect(mod.default.enabled).toBe(false);
    });

    it("captureException is a safe no-op after a failed init", async () => {
        process.env.SENTRY_DSN = "https://public@sentry.example.com/1";
        vi.resetModules();

        const mod = await import("../../services/errorMonitoring.js");
        const Sentry = await import("@sentry/node");

        mod.initErrorMonitoring();

        expect(() => mod.default.captureException(new Error("boom"))).not.toThrow();
        // Disabled monitoring never forwards to Sentry.
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it("stays disabled and never calls init when SENTRY_DSN is absent", async () => {
        delete process.env.SENTRY_DSN;
        vi.resetModules();

        const mod = await import("../../services/errorMonitoring.js");
        const Sentry = await import("@sentry/node");

        expect(mod.default.enabled).toBe(false);
        expect(() => mod.initErrorMonitoring()).not.toThrow();
        expect(Sentry.init).not.toHaveBeenCalled();
    });
});
