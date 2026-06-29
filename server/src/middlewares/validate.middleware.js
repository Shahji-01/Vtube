// ---------------------VALIDATE MIDDLEWARE-------------------------------------
//
// A higher-order Express middleware that validates `req.params`, `req.query`,
// and `req.body` against a plain-object schema before the controller runs.
//
// A schema is shaped `{ params?, query?, body? }` where each part maps field
// names to a rule or an array of rules from `../validators/validators.js`. Each
// rule is `(value) => string | null`, returning `null` on success or a short
// human-readable error fragment (e.g. "is required") on failure.
//
// On failure the middleware forwards `next(new ApiError(400, "Validation
// failed", errors))` where `errors` is an array of `{ field, message }` naming
// every violating field. On success it calls `next()` without mutating the
// request `body`, `params`, or `query`.
//
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5

import { ApiError } from "../utils/ApiError.js";
import { firstError, asArray } from "../validators/validators.js";

/**
 * Build a validation middleware for the supplied per-part schema.
 * @param {{params?: Object, query?: Object, body?: Object}} schema -
 *   Per-part validation schema. Each part maps `field` to `rule | rule[]`.
 * @returns {Function} An Express middleware `(req, res, next)`.
 */
export const validate = (schema) => (req, _res, next) => {
  const errors = []; // [{ field, message }]

  for (const part of ["params", "query", "body"]) {
    const partSchema = schema?.[part];
    if (!partSchema) continue;

    for (const [field, rules] of Object.entries(partSchema)) {
      const ruleMessage = firstError(asArray(rules), req[part]?.[field]);
      if (ruleMessage) {
        errors.push({ field, message: `${field} ${ruleMessage}` });
      }
    }
  }

  if (errors.length) {
    return next(new ApiError(400, "Validation failed", errors));
  }

  // Valid input: pass control without mutating request shape.
  next();
};
