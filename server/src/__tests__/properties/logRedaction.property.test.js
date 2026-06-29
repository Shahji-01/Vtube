import { describe, it, expect } from "vitest";
import fc from "fast-check";
import pino from "pino";
import { REDACT_PATHS, REDACT_CENSOR, redactSecrets } from "../../config/logger.js";

// Feature: phase-2-quality-hardening, Property 22
// Property 22: Log redaction removes every secret at any depth.
// Validates: Requirements 11.4, 11.5, 13.5
//
// This test exercises the real redaction configuration exported by
// server/src/config/logger.js by attaching it to a pino logger that writes to
// an in-memory stream. It logs arbitrarily-nested objects whose keys are the
// secret names the app must never leak, then asserts that none of the original
// secret string values survive anywhere in the emitted JSON.

/** Secret-bearing key names that must be redacted wherever they appear. */
const SECRET_KEYS = [
  "password",
  "refreshToken",
  "accessToken",
  "token",
  "apiKey",
  "secret",
  "EMAIL_AUTH_PASS",
  "SENTRY_DSN",
  "GOOGLE_CLIENT_SECRET",
];

/** Collect everything a pino destination receives into a single string. */
function makeCaptureStream() {
  const chunks = [];
  return {
    stream: { write: (s) => chunks.push(s) },
    output: () => chunks.join(""),
  };
}

/**
 * A placement describes one secret value buried at a chosen nesting depth under
 * a uniquely-named branch of the logged object.
 */
const placementArb = fc.record({
  key: fc.constantFrom(...SECRET_KEYS),
  depth: fc.nat({ max: 5 }),
});

/**
 * Build a nested object from placements and return both the object and the list
 * of sentinel secret values that were embedded in it. Each secret value is a
 * unique alphanumeric token so it serializes verbatim into JSON and can be
 * searched for unambiguously in the output.
 */
function buildLogPayload(placements) {
  const root = {};
  const sentinels = [];

  placements.forEach((placement, i) => {
    const value = `SECRETVALUE${i}TOKEN`;
    sentinels.push(value);

    // Walk down `depth` filler levels, then set the secret key at the leaf.
    let node = (root[`branch${i}`] = {});
    for (let level = 0; level < placement.depth; level += 1) {
      node = node[`nested${level}`] = {};
    }
    node[placement.key] = value;
  });

  return { payload: root, sentinels };
}

describe("Property 22: Log redaction removes every secret at any depth", () => {
  it("no original secret value survives in the emitted log output", () => {
    fc.assert(
      fc.property(
        fc.array(placementArb, { minLength: 1, maxLength: 8 }),
        (placements) => {
          const { stream, output } = makeCaptureStream();
          const logger = pino(
            {
              redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
              // Mirror the real createLogger config: the log formatter
              // deep-redacts secret-named keys nested below pino's path depth.
              formatters: { log: (obj) => redactSecrets(obj) },
            },
            stream,
          );

          const { payload, sentinels } = buildLogPayload(placements);
          logger.info(payload, "request handled");

          const emitted = output();
          for (const sentinel of sentinels) {
            expect(emitted).not.toContain(sentinel);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
