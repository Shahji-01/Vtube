// ---------------------REUSABLE FIELD VALIDATORS-------------------------------
//
// Pure, side-effect-free field rules used by the centralized `validate(schema)`
// middleware. Each rule is a function `(value) => string | null` that returns
// `null` when the value is acceptable, or a short human-readable error fragment
// (e.g. "is required") when it is not. The fragment is combined with the field
// name by the middleware to produce messages like "title is required".
//
// Requirements: 1.1, 1.7, 1.8, 1.9, 1.10, 6.1

import { isValidObjectId } from "mongoose";

/**
 * Normalize a rule or list of rules into an array of rules.
 * @param {Function|Function[]} rules - A single rule or an array of rules.
 * @returns {Function[]} The rules as an array.
 */
export const asArray = (rules) => (Array.isArray(rules) ? rules : [rules]);

/**
 * Run rules in order against a value and return the first error message, if any.
 * @param {Function|Function[]} rules - Rule or rules to evaluate.
 * @param {*} value - The value to validate.
 * @returns {string|null} The first error message, or `null` if all rules pass.
 */
export const firstError = (rules, value) => {
  for (const rule of asArray(rules)) {
    const message = rule(value);
    if (message) return message;
  }
  return null;
};

/**
 * Rule: value must be a valid Mongo ObjectId.
 * @param {*} v - The value to check.
 * @returns {string|null} Error message or `null`.
 */
export const isObjectId = (v) => (isValidObjectId(v) ? null : "is not a valid id");

/**
 * Rule: value must be present (not `undefined` and not `null`).
 * @param {*} v - The value to check.
 * @returns {string|null} Error message or `null`.
 */
export const required = (v) =>
  v !== undefined && v !== null ? null : "is required";

/**
 * Rule: value must be a string with non-whitespace content.
 * @param {*} v - The value to check.
 * @returns {string|null} Error message or `null`.
 */
export const nonBlank = (v) =>
  typeof v === "string" && v.trim().length > 0 ? null : "must not be empty";

/**
 * Rule factory: value must be a string whose trimmed length is at most `n`.
 * @param {number} n - The maximum allowed trimmed length.
 * @returns {Function} A rule `(value) => string | null`.
 */
export const maxLen = (n) => (v) =>
  typeof v === "string" && v.trim().length <= n
    ? null
    : `must be at most ${n} characters`;

/**
 * Rule factory: skip validation when the value is absent (`undefined` or the
 * empty string `""`); otherwise apply the supplied rules.
 * @param {...Function} rules - Rules to apply when a value is present.
 * @returns {Function} A rule `(value) => string | null`.
 */
export const optional = (...rules) => (v) =>
  v === undefined || v === "" ? null : firstError(rules, v);
