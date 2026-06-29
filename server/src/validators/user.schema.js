// ---------------------USER ROUTE VALIDATION SCHEMAS---------------------------
//
// Per-route validation schemas for the users route group, consumed by the
// centralized `validate(schema)` middleware. Each schema is shaped
// `{ params?, query?, body? }` mapping a field name to a rule (or array of
// rules) from `./validators.js`.
//
// Field names mirror exactly what `user.controller.js` reads:
//   - register:        body `fullName`, `email`, `username`, `password`
//   - login:           body `email` | `username`, `password`
//   - change-password: body `oldPassword`, `newPassword` (and `confirmPassword`)
//   - update-account:  body `fullName`, `email` (optional, partial update)
//   - history/:video_Id (DELETE): param `video_Id`
//
// Ordering note (see design §1): for the multipart `register` endpoint the body
// schema runs AFTER multer's `upload.fields(...)` so `req.body` is populated.
//
// Conservative posture: only fields the controller treats as mandatory are
// required, so no currently-valid request breaks. In particular, `login`
// accepts EITHER `email` OR `username`, so neither identifier is individually
// required (requiring one would reject valid logins that supply only the
// other). Only `password` — which every successful login must carry — is
// required.
//
// Requirements: 1.6, 2.1, 2.4, 2.5, 2.6

import { isObjectId, required, nonBlank, optional } from "./validators.js";

/**
 * registerUser (POST /register) — body validated AFTER multer.
 * `fullName`, `email`, `username`, and `password` are required and non-blank,
 * matching the controller's "all fields are required" guard.
 */
export const registerBody = {
  body: {
    fullName: [required, nonBlank],
    email: [required, nonBlank],
    username: [required, nonBlank],
    password: [required, nonBlank],
  },
};

/**
 * loginUser (POST /login).
 * The controller authenticates with either `email` or `username` (an OR), so
 * neither is required here — only `password`, which any successful login must
 * provide. When an identifier is supplied it must be non-blank.
 */
export const loginBody = {
  body: {
    email: optional(nonBlank),
    username: optional(nonBlank),
    password: [required, nonBlank],
  },
};

/**
 * changeCurrentPassword (POST /change-password).
 * The controller requires `oldPassword` and `newPassword`; both must be
 * non-blank.
 */
export const changePasswordBody = {
  body: {
    oldPassword: [required, nonBlank],
    newPassword: [required, nonBlank],
  },
};

/**
 * updateUserDetails (PATCH /update-account) — partial update.
 * `fullName`/`email` are optional, but when present must be non-blank. This
 * preserves the controller's "at least one field" semantics without rejecting
 * any currently-valid partial update.
 */
export const updateAccountBody = {
  body: {
    fullName: optional(nonBlank),
    email: optional(nonBlank),
  },
};

/** Param schema: `:video_Id` (DELETE /history/:video_Id) must be a valid ObjectId. */
export const watchHistoryVideoIdParam = {
  params: { video_Id: isObjectId },
};
