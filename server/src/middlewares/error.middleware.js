import { ApiError } from "../utils/ApiError.js";
import logger from "../config/logger.js";

/**
 * Global Express error handler.
 *
 * Translates any error forwarded via `next(err)` (or thrown in a sync handler)
 * into the uniform Error_Response shape:
 *
 *   { statusCode, success: false, message, errors }
 *
 * with `Content-Type: application/json`.
 *
 * Rules:
 *   - When `err` is an ApiError carrying an integer `statusCode` in 400–599,
 *     its status, message, and errors are used.
 *   - Otherwise the response is a generic HTTP 500 with an empty `errors` array
 *     and no internal detail leaked (raw messages, db text, fs paths,
 *     third-party responses, stack traces).
 *   - `message` is always a non-empty string of 1–500 characters; anything
 *     outside that range falls back to the generic message.
 *   - A `stack` field is attached ONLY when `process.env.NODE_ENV !== "production"`.
 *
 * Registered as the final `app.use(...)` after all routers and the SPA catch-all.
 *
 * @type {import("express").ErrorRequestHandler}
 */
const GENERIC_MESSAGE = "Internal Server Error";
const MAX_MESSAGE_LENGTH = 500;

const isClientSafeMessage = (value) =>
  typeof value === "string" &&
  value.length >= 1 &&
  value.length <= MAX_MESSAGE_LENGTH;

/**
 * Report an error to the optional error-monitoring service without ever
 * affecting the HTTP response.
 *
 * The monitoring service (`../services/errorMonitoring.js`) may not exist yet,
 * so it is imported lazily: a missing module, a disabled service, or a failure
 * inside `captureException` all degrade to a silent no-op. The import is
 * fire-and-forget and is never awaited, so it cannot delay or alter the
 * already-sent response (Req 13.4, 13.5).
 *
 * @param {unknown} err - The error forwarded to the global handler.
 */
const reportToErrorMonitoring = (err) => {
  try {
    import("../services/errorMonitoring.js")
      .then((mod) => {
        const errorMonitoring = mod?.default ?? mod?.errorMonitoring ?? mod;
        if (errorMonitoring?.enabled) {
          errorMonitoring.captureException?.(err);
        }
      })
      .catch(() => {});
  } catch {
    // A monitoring failure must never change the HTTP response.
  }
};

export const errorHandler = (err, req, res, _next) => {
  const isApiError = err instanceof ApiError;

  // Multer surfaces upload-limit and field violations as a `MulterError`. These
  // are client faults, so map them to clean 4xx responses instead of letting
  // them fall through to a generic 500. `LIMIT_FILE_SIZE` becomes 413 (payload
  // too large); all other multer codes become a generic 400 with a safe,
  // non-leaking message.
  const isMulterError = err?.name === "MulterError";
  if (isMulterError && !isApiError) {
    const multerStatus = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const multerMessage =
      err.code === "LIMIT_FILE_SIZE"
        ? "File too large"
        : isClientSafeMessage(err.message)
          ? err.message
          : "Invalid file upload";

    const multerBody = {
      statusCode: multerStatus,
      success: false,
      message: multerMessage,
      errors: [],
    };
    if (process.env.NODE_ENV !== "production" && err?.stack) {
      multerBody.stack = err.stack;
    }

    logger.error(
      { err, method: req?.method, path: req?.path },
      "Upload rejected in global error handler"
    );
    reportToErrorMonitoring(err);

    return res
      .status(multerStatus)
      .type("application/json")
      .json(multerBody);
  }

  const validStatus =
    Number.isInteger(err?.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode <= 599;
  const useApiError = isApiError && validStatus;

  // Status: ApiError status when valid, otherwise a generic 500.
  const statusCode = useApiError ? err.statusCode : 500;

  // Message: only trust the ApiError message when it is a client-safe string.
  // Everything else falls back to the generic message so internals never leak.
  const message =
    useApiError && isClientSafeMessage(err.message)
      ? err.message
      : GENERIC_MESSAGE;

  // Errors: only echo a real array from a valid ApiError; never from generics.
  const errors = useApiError && Array.isArray(err.errors) ? err.errors : [];

  const body = { statusCode, success: false, message, errors };

  // Stack is debugging-only and must never be exposed in production.
  if (process.env.NODE_ENV !== "production" && err?.stack) {
    body.stack = err.stack;
  }

  // Structured error logging (Req 11.5): exactly one error-level record before
  // responding, capturing a failure description plus the request method and
  // path. The shared logger redacts secret-bearing keys at any depth.
  logger.error(
    { err, method: req?.method, path: req?.path },
    "Request failed in global error handler"
  );

  // Error monitoring (Req 13.4, 13.5): report when enabled. Defensive and
  // fire-and-forget so it never alters the response below.
  reportToErrorMonitoring(err);

  res.status(statusCode).type("application/json").json(body);
};

export default errorHandler;
