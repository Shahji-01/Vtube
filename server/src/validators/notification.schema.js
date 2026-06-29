// ---------------------NOTIFICATION ROUTE VALIDATION SCHEMAS-------------------
//
// Per-route validation schemas for the notifications route group, consumed by
// the centralized `validate(schema)` middleware. Each schema is shaped
// `{ params?, query?, body? }` mapping a field name to a rule (or array of
// rules) from `./validators.js`.
//
// Field names mirror exactly what `notification.controller.js` reads:
//   - markAsRead (PATCH /:notificationId/read): param `notificationId`
//
// `getNotifications` (GET /) and `clearNotifications` (DELETE /clear) read no
// params/body, so they need no schema. All notification routes already sit
// behind `verifyJWT` (router-level), so ownership is scoped by `req.user._id`.
//
// Requirements: 1.6, 2.1, 2.5

import { isObjectId } from "./validators.js";

/** Param schema: `:notificationId` must be a valid Mongo ObjectId. */
export const notificationIdParam = {
  params: { notificationId: isObjectId },
};
