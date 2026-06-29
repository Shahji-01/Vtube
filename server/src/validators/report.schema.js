// ---------------------REPORT ROUTE VALIDATION SCHEMAS------------------------
//
// Per-route validation schemas for the report route group, consumed by the
// centralized `validate(schema)` middleware. Each schema is shaped
// `{ params?, query?, body? }` mapping a field name to a rule (or array of
// rules) from `./validators.js` or the small inline `oneOf` rule defined here.
//
// The allowed reason/status values are imported from the report model so the
// validators stay in lock-step with the schema enums (no drift). Invalid or
// missing `targetType`, `targetId`, or `reason` are rejected with HTTP 400
// before any database access.
//
// Requirements: 4.2, 4.5

import { required, isObjectId, optional } from "./validators.js";
import { REPORT_REASONS, REPORT_STATUSES } from "../models/report.model.js";

/**
 * Rule factory: value must be one of the entries in `list`.
 * @param {string[]} list - The allowed values.
 * @returns {Function} A rule `(value) => string | null` that returns `null`
 *   when the value is in `list`, otherwise a message naming the allowed values.
 */
const oneOf = (list) => (v) =>
  list.includes(v) ? null : `must be one of: ${list.join(", ")}`;

/**
 * POST / — create a report. Rejects a missing/invalid `targetType`, `targetId`,
 * or `reason` with 400 before any database access.
 */
export const createReportSchema = {
  body: {
    targetType: [required, oneOf(["Video", "Comment"])],
    targetId: [required, isObjectId],
    reason: [required, oneOf(REPORT_REASONS)],
  },
};

/**
 * GET / — list reports. The optional `status` query filter, when present, must
 * be one of the known report statuses.
 */
export const listReportsQuery = {
  query: {
    status: optional(oneOf(REPORT_STATUSES)),
  },
};

/**
 * PATCH /:reportId — reject a malformed `reportId` with 400 before any database
 * access. The field name in the resulting Error_Response is `reportId`.
 */
export const reportIdParam = {
  params: {
    reportId: isObjectId,
  },
};
