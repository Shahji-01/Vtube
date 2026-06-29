// ---------------------VIDEO ROUTE VALIDATION SCHEMAS---------------------------
//
// Per-route validation schemas for the videos route group, consumed by the
// centralized `validate(schema)` middleware. Each schema is shaped
// `{ params?, query?, body? }` mapping a field name to a rule (or array of
// rules) from `./validators.js`.
//
// Notes on ordering (see design §1 and the videos router):
//   - The ObjectId param check runs BEFORE any multer upload so malformed ids
//     are rejected cheaply (no file processing).
//   - Body-field validation for multipart endpoints (publish/update) runs AFTER
//     multer so `req.body` is populated.
//
// Requirements: 1.6, 1.7, 1.8, 1.9, 2.1, 3.4, 3.5, 3.7

import { isObjectId, required, nonBlank, maxLen, optional } from "./validators.js";
import { ApiError } from "../utils/ApiError.js";

// Shared length bounds for the editable text fields.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

// Max length of an autocomplete prefix query (`?q=`).
const AUTOCOMPLETE_Q_MAX = 100;

/** Param schema: `:video_Id` must be a valid Mongo ObjectId. */
export const videoIdParam = {
  params: { video_Id: isObjectId },
};

/**
 * publishAVideo (POST /) — body validated AFTER multer.
 * `title` and `description` are required, non-blank, and length-capped.
 */
export const publishVideoBody = {
  body: {
    title: [required, nonBlank, maxLen(TITLE_MAX)],
    description: [required, nonBlank, maxLen(DESCRIPTION_MAX)],
  },
};

/**
 * updateVideo (PATCH /:video_Id) — body validated AFTER multer.
 * `title`/`description` are optional, but when present must be non-blank and
 * length-capped.
 */
export const updateVideoBody = {
  body: {
    title: optional(nonBlank, maxLen(TITLE_MAX)),
    description: optional(nonBlank, maxLen(DESCRIPTION_MAX)),
  },
};

// ---------------------DISCOVERY FILTER RULES (Phase 4)------------------------
//
// Local field rules for the discovery filters on `GET /api/v1/videos`. They
// follow the same `(value) => string | null` contract as `./validators.js`
// (return `null` when acceptable, else a short fragment the `validate`
// middleware joins with the field name, e.g. "uploadDateFrom is not a valid
// date"). They are declared here (not in `validators.js`) to keep this change
// additive and scoped to the videos route group.

/**
 * Rule: value must be parseable as a date (e.g. an ISO-8601 string).
 * Uses `Date.parse`, which returns `NaN` for unparseable input.
 * @param {*} v - The value to check.
 * @returns {string|null} Error fragment or `null`.
 */
const isValidDate = (v) =>
  !Number.isNaN(Date.parse(v)) ? null : "is not a valid date";

/**
 * Rule factory: value must be one of the allowed members.
 * @param {...string} allowed - The permitted values.
 * @returns {Function} A rule `(value) => string | null`.
 */
const oneOf = (...allowed) => (v) =>
  allowed.includes(v) ? null : `must be one of: ${allowed.join(", ")}`;

/**
 * Rule: value must look like a non-negative number (lenient, so existing
 * numeric callers keep working while obvious garbage is rejected).
 * @param {*} v - The value to check.
 * @returns {string|null} Error fragment or `null`.
 */
const isNumericIsh = (v) =>
  Number.isFinite(Number(v)) && Number(v) >= 0 ? null : "must be a number";

// Allowed `durationBucket` values (design §4: short < 240s, medium 240–1200s,
// long > 1200s). The bucket→range mapping itself lives in the controller.
const DURATION_BUCKETS = ["short", "medium", "long"];

// Allowed `sortBy` values. The first three are the new discovery enum
// (`relevance`, `date`, `views`). The remainder are known legacy sortable
// field names that pre-Phase-4 callers may already pass (e.g.
// `sortBy=createdAt&sortType=desc`); accepting them preserves back-compat while
// still rejecting obvious garbage. Set kept permissive on purpose (R2.3, R2.6).
const SORT_BY_ALLOWED = [
  "relevance", // new: text relevance ranking
  "date", // new: maps to createdAt in the controller
  "views", // new: maps to views in the controller
  "createdAt", // legacy field name
  "duration", // legacy field name
];

/**
 * getAllVideos (GET /) query schema — validated BEFORE the controller (no DB
 * access on rejection, R2.7). All filters are optional and additive; the
 * existing `query`/`sortType` free-text params are intentionally left
 * unconstrained so current callers are unaffected (R2.3).
 *
 * NOTE on the cross-field `uploadDateFrom <= uploadDateTo` check: the shared
 * `validate(schema)` middleware only runs PER-FIELD rules — each rule receives
 * a single field's value (`req.query[field]`) and cannot see sibling fields, so
 * a "from must not be later than to" comparison cannot be expressed as a rule
 * here. That cross-field check is therefore provided separately as
 * `validateDateRange(query)` (pure) and the `enforceDateRange` middleware
 * below, which the videos route wires immediately after `validate(...)` so the
 * comparison still rejects with 400 BEFORE any database access.
 */
export const getAllVideosQuery = {
  query: {
    // Discovery date range: each bound, when present, must be a valid date.
    uploadDateFrom: optional(isValidDate),
    uploadDateTo: optional(isValidDate),
    // Duration band.
    durationBucket: optional(oneOf(...DURATION_BUCKETS)),
    // Sort key: new enum + preserved legacy field names.
    sortBy: optional(oneOf(...SORT_BY_ALLOWED)),
    // Preserved params (no behavior-breaking restrictions).
    page: optional(isNumericIsh),
    limit: optional(isNumericIsh),
    userId: optional(isObjectId),
  },
};

/**
 * Cross-field rule: when BOTH `uploadDateFrom` and `uploadDateTo` are present
 * and parseable, `uploadDateFrom` must not be later than `uploadDateTo`.
 *
 * Returns an error fragment-style message (`null` when acceptable). Unparseable
 * or absent bounds return `null` here because the per-field `isValidDate` rules
 * in `getAllVideosQuery` already report those cases — this check is solely the
 * ordering comparison the per-field middleware cannot perform.
 *
 * @param {object} [query] - The request query object (`req.query`).
 * @returns {string|null} Error message or `null`.
 */
export const validateDateRange = (query = {}) => {
  const { uploadDateFrom, uploadDateTo } = query ?? {};

  const fromMissing = uploadDateFrom === undefined || uploadDateFrom === "";
  const toMissing = uploadDateTo === undefined || uploadDateTo === "";
  if (fromMissing || toMissing) return null; // only enforced when BOTH present

  const from = Date.parse(uploadDateFrom);
  const to = Date.parse(uploadDateTo);
  if (Number.isNaN(from) || Number.isNaN(to)) return null; // reported per-field

  return from > to ? "uploadDateFrom must not be later than uploadDateTo" : null;
};

/**
 * Express middleware enforcing the cross-field date-range ordering for
 * `GET /api/v1/videos`. Wire it immediately AFTER `validate(getAllVideosQuery)`
 * so a `from > to` request is rejected with HTTP 400 in the canonical
 * Error_Response shape (`{ statusCode, success:false, message, errors }`),
 * naming the offending field, BEFORE the controller touches the database (R2.7).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export const enforceDateRange = (req, _res, next) => {
  const message = validateDateRange(req?.query);
  if (message) {
    return next(
      new ApiError(400, "Validation failed", [
        { field: "uploadDateFrom", message },
      ])
    );
  }
  next();
};

/**
 * searchSuggestions (GET /search/suggestions) query schema — the autocomplete
 * prefix `q` is required, non-blank, and length-capped. Validated before the
 * controller (R2.8).
 */
export const autocompleteQuery = {
  query: {
    q: [required, nonBlank, maxLen(AUTOCOMPLETE_Q_MAX)],
  },
};
