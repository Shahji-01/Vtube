import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createLogger } from "../../config/logger.js";

// Feature: phase-2-quality-hardening, Property 23
// Property 23: Log level honors production suppression.
// Validates: Requirements 11.6

/** Levels pino enables/queries via isLevelEnabled. */
const ABOVE_DEBUG = ["info", "warn", "error"];

/** Arbitrary explicit LOG_LEVEL values (plus "absent"). */
const logLevelArb = fc.constantFrom(
  "debug",
  "info",
  "warn",
  "error",
  "trace",
  undefined,
);

describe("Property 23: Log level honors production suppression", () => {
  it("production forces level 'info': debug suppressed, info/warn/error emitted", () => {
    fc.assert(
      fc.property(logLevelArb, (LOG_LEVEL) => {
        // In production the LOG_LEVEL override must be ignored and pinned to info.
        const logger = createLogger({ NODE_ENV: "production", LOG_LEVEL });

        expect(logger.level).toBe("info");
        // debug is below info → suppressed (Req 11.6).
        expect(logger.isLevelEnabled("debug")).toBe(false);
        // info and above remain enabled.
        for (const level of ABOVE_DEBUG) {
          expect(logger.isLevelEnabled(level)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("non-production honors LOG_LEVEL, defaulting to debug (debug enabled)", () => {
    const nonProdEnvArb = fc.constantFrom(
      "development",
      "test",
      "staging",
      undefined,
    );

    fc.assert(
      fc.property(nonProdEnvArb, (NODE_ENV) => {
        // No explicit LOG_LEVEL → defaults to debug, so debug is enabled.
        const logger = createLogger({ NODE_ENV });

        expect(logger.level).toBe("debug");
        expect(logger.isLevelEnabled("debug")).toBe(true);
        for (const level of ABOVE_DEBUG) {
          expect(logger.isLevelEnabled(level)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("non-production with explicit LOG_LEVEL honors that level", () => {
    const nonProdEnvArb = fc.constantFrom("development", "test", undefined);
    const explicitLevelArb = fc.constantFrom("debug", "info", "warn", "error");

    fc.assert(
      fc.property(nonProdEnvArb, explicitLevelArb, (NODE_ENV, LOG_LEVEL) => {
        const logger = createLogger({ NODE_ENV, LOG_LEVEL });
        expect(logger.level).toBe(LOG_LEVEL);
      }),
      { numRuns: 200 },
    );
  });
});
