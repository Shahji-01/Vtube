/**
 * Helmet security-header options builder.
 *
 * Builds the Content Security Policy (CSP) and Cross-Origin Resource Policy
 * (CORP) directive set passed to the `helmet` middleware. Pure function: no
 * side effects, deterministic for a given `env`, safe to test in isolation.
 *
 * Behavior:
 * - `default-src` is restricted to `'self'`.
 * - The Cloudinary media origin is always permitted in `img-src` and
 *   `media-src` so client images/media load without a CSP violation.
 * - The Vite dev origins are added to `connect-src`, `script-src`, and
 *   `style-src` only when the environment is NOT production.
 * - `crossOriginResourcePolicy` is set to `cross-origin` so the client and
 *   Cloudinary media can be consumed while other origins remain constrained.
 *
 * @param {{ NODE_ENV?: string }} env - Environment view (e.g. from loadEnv).
 * @returns {object} Options object for `helmet(...)`.
 */
export function buildHelmetOptions(env) {
  const isProd = env?.NODE_ENV === "production";
  const cloudinary = "https://res.cloudinary.com";
  const viteDev = isProd
    ? []
    : ["http://localhost:5173", "http://127.0.0.1:5173"];

  return {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:", cloudinary],
        "media-src": ["'self'", "blob:", cloudinary],
        "connect-src": ["'self'", ...viteDev],
        "script-src": ["'self'", ...viteDev],
        "style-src": ["'self'", "'unsafe-inline'", ...viteDev],
        "worker-src": ["'self'", "blob:"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  };
}
