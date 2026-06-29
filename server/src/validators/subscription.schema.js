// ---------------------SUBSCRIPTION ROUTE VALIDATION SCHEMAS--------------------
//
// Per-route validation schemas for the subscriptions route group, consumed by
// the centralized `validate(schema)` middleware. Each schema is shaped
// `{ params?, query?, body? }` mapping a field name to a rule (or array of
// rules) from `./validators.js`.
//
// These endpoints guard their id-bearing params with an ObjectId check. They
// are not owned-resource update/delete operations, so no ownership check is
// applied. Middleware order on the router is: verifyJWT → validate → controller.
//
// Requirements: 1.6, 1.7, 2.1

import { isObjectId } from "./validators.js";

/** Param schema: `:channel_Id` must be a valid Mongo ObjectId. */
export const channelIdParam = {
  params: { channel_Id: isObjectId },
};

/** Param schema: `:user_Id` must be a valid Mongo ObjectId. */
export const userIdParam = {
  params: { user_Id: isObjectId },
};

/** Param schema: `:subscriberId` must be a valid Mongo ObjectId. */
export const subscriberIdParam = {
  params: { subscriberId: isObjectId },
};
