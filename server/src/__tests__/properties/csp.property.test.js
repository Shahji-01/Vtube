import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildHelmetOptions } from "../../config/security.js";

// Feature: phase-2-quality-hardening, Property 21
// Property 21: CSP directives include required origins and gate the dev origin
//              on environment.
// Validates: Requirements 6.2, 6.3, 6.5, 6.6

const CLOUDINARY = "https://res.cloudinary.com";
const VITE_DEV = ["http://localhost:5173", "http://127.0.0.1:5173"];

/** Generator for arbitrary NODE_ENV values, biased to include "production". */
const nodeEnvArb = fc.oneof(
  fc.constant("production"),
  fc.constant("development"),
  fc.constant("test"),
  fc.constant(undefined),
  fc.string(),
);

describe("Property 21: CSP directive construction", () => {
  it("default-src is always 'self'; Cloudinary always in img/media; Vite dev origins gated on non-production", () => {
    fc.assert(
      fc.property(nodeEnvArb, (NODE_ENV) => {
        const options = buildHelmetOptions({ NODE_ENV });
        const directives = options.contentSecurityPolicy.directives;
        const isProd = NODE_ENV === "production";

        // default-src restricted to 'self' (Req 6.6 baseline).
        expect(directives["default-src"]).toContain("'self'");

        // Cloudinary origin always permitted for images and media (Req 6.2).
        expect(directives["img-src"]).toContain(CLOUDINARY);
        expect(directives["media-src"]).toContain(CLOUDINARY);

        // Vite dev origins present in connect-src/script-src iff not production
        // (Req 6.3 enables them in dev; Req 6.5 excludes them in production).
        for (const directiveName of ["connect-src", "script-src"]) {
          for (const devOrigin of VITE_DEV) {
            if (isProd) {
              expect(directives[directiveName]).not.toContain(devOrigin);
            } else {
              expect(directives[directiveName]).toContain(devOrigin);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("CORP is set to cross-origin for every environment", () => {
    fc.assert(
      fc.property(nodeEnvArb, (NODE_ENV) => {
        const options = buildHelmetOptions({ NODE_ENV });
        expect(options.crossOriginResourcePolicy).toEqual({ policy: "cross-origin" });
      }),
      { numRuns: 200 },
    );
  });
});
