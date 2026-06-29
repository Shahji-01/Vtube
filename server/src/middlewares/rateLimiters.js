import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/ApiError.js";

// Tiered rate limiting (design §5). All tiers emit RFC standard `RateLimit-*`
// headers (and `Retry-After` on 429) and suppress the deprecated `X-RateLimit-*`
// legacy headers.
const common = { standardHeaders: true, legacyHeaders: false };

// Phase 1 production defaults, overridable per-tier via env (test/staging).
//   Global tier: broad protection for the whole API surface — 200 requests / 15 min.
//   Auth tier:   tight cap on credential/token endpoints to blunt brute-force — 10 / 15 min.
//   Upload tier: protect expensive media uploads — 20 / 60 min.
export function buildLimiters(env = {}) {
  // On rejection, forward an ApiError(429) to the global error handler so the
  // 429 response carries the uniform Error_Response shape
  // (`{ statusCode, success: false, message, errors }`) instead of a raw text
  // body. express-rate-limit sets the RateLimit-* and Retry-After headers
  // BEFORE invoking this handler, so those headers are preserved on the
  // forwarded error response (Req 9.3, and headers for Req 2.2 / 9.5).
  const mk = (limit, windowMs, message) =>
    rateLimit({
      ...common,
      limit,
      windowMs,
      message,
      handler: (req, res, next) => next(new ApiError(429, message)),
    });

  return {
    globalLimiter: mk(
      env.RATE_LIMIT_GLOBAL ?? 200,
      env.RL_GLOBAL_WINDOW_MS ?? 15 * 60 * 1000, // 15 minutes
      "Too many requests from this IP, please try again after 15 minutes"
    ),
    authLimiter: mk(
      env.RATE_LIMIT_AUTH ?? 10,
      env.RL_AUTH_WINDOW_MS ?? 15 * 60 * 1000, // 15 minutes
      "Too many authentication attempts, please try again after 15 minutes"
    ),
    uploadLimiter: mk(
      env.RATE_LIMIT_UPLOAD ?? 20,
      env.RL_UPLOAD_WINDOW_MS ?? 60 * 60 * 1000, // 1 hour
      "Too many uploads from this IP, please try again after an hour"
    ),
  };
}

// Named exports preserved for back-compat: the running app imports these directly.
// Derived from the live process environment so the production default is unchanged.
export const { globalLimiter, authLimiter, uploadLimiter } = buildLimiters(
  process.env
);
