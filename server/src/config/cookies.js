/**
 * cookies.js — Centralized auth-cookie options.
 *
 * The access/refresh token cookies must be hardened consistently across login,
 * logout, and token-refresh. Hardcoding `{ httpOnly: true, secure: true }`
 * inline (the previous approach) breaks local development over plain HTTP,
 * because a `secure` cookie is never sent back by the browser, and it omitted a
 * `sameSite` policy entirely (leaving CSRF posture to the browser default).
 *
 * This helper resolves the options from the environment:
 *   - httpOnly : always true — the token cookies must never be readable from JS.
 *   - secure   : true only in production (HTTPS). In dev/test the app runs over
 *                http://localhost, so `secure` would silently drop the cookie.
 *   - sameSite : "strict" by default — the SPA and API are same-site in the
 *                default single-origin deployment, so strict gives the strongest
 *                CSRF protection without breaking same-site requests. Override to
 *                "none" (with secure) only for a genuinely cross-site frontend.
 *
 * @param {Record<string, string | undefined>} [env=process.env]
 * @returns {{ httpOnly: boolean, secure: boolean, sameSite: "strict" | "lax" | "none" }}
 */
export function cookieOptions(env = process.env) {
  const source = env ?? {};
  const isProduction = source.NODE_ENV === "production";

  // Allow an explicit override for cross-site deployments; otherwise default to
  // the strictest policy that works for a same-site SPA + API.
  const configured = source.COOKIE_SAMESITE?.toLowerCase();
  const sameSite =
    configured === "lax" || configured === "none" || configured === "strict"
      ? configured
      : "strict";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite,
  };
}

export default cookieOptions;
