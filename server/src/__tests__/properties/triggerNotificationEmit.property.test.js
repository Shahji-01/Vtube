// Feature: phase-4-social-discovery, Property 2: Triggering a notification persists one record and emits exactly one event to only the recipient's room with the correct unread count
//
// Validates: Requirements 1.5, 1.6, 1.8
//
// For ANY `{ type, recipient, sender, video, comment }` with `sender !== recipient`,
// calling `triggerNotification(...)`:
//   - creates exactly one Notification (`Notification.create` called once),
//   - calls `emitNotification` exactly once with the recipient id (first arg === recipient),
//   - calls `emitUnreadCount` exactly once with the recipient id and the unread count
//     equal to the mocked `countDocuments` return,
//   - and never emits to any other recipient's room.
//
// Strategy (mocked-model + mocked-socket, per the existing
// `ownership.property.test.js` / `watchEndpointsResponseShape.property.test.js`
// style): the `Notification` model is mocked via `vi.mock` so no real DB I/O
// happens — `create` resolves a fake doc (given fields + an `_id`),
// `findById(...).populate(...).populate(...)` resolves a populated-ish payload,
// and `countDocuments({ recipient, isRead:false })` resolves a controllable
// number. The socket module is mocked so `emitNotification` / `emitUnreadCount`
// are `vi.fn()` recorders, letting us assert exactly which recipient room/value
// was emitted to WITHOUT a live socket.

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { isValidObjectId, Types } from "mongoose";

// ── Hoisted mock state shared with the vi.mock factories ─────────────────────
const { state, notificationModel } = vi.hoisted(() => {
  const state = { unread: 0 };
  return {
    state,
    notificationModel: {
      // Persist: record the call and return the given fields plus a fresh _id.
      create: vi.fn(async (doc) => ({ _id: "deadbeefdeadbeefdeadbeef", ...doc })),
      // findById(...).populate(...).populate(...) → a populated-ish payload.
      findById: vi.fn(() => {
        const query = {
          populate: vi.fn(() => query),
          then: (resolve) => resolve({ _id: "deadbeefdeadbeefdeadbeef", populated: true }),
        };
        return query;
      }),
      // Recipient's unread count — controllable per property run.
      countDocuments: vi.fn(async () => state.unread),
    },
  };
});

// ── Hoisted socket recorders shared with the vi.mock factory ─────────────────
const { emitNotification, emitUnreadCount, getIO } = vi.hoisted(() => ({
  emitNotification: vi.fn(),
  emitUnreadCount: vi.fn(),
  // Truthy IO object in case the module under test references it.
  getIO: vi.fn(() => ({})),
}));

vi.mock("../../models/notification.model.js", () => ({
  Notification: notificationModel,
}));

vi.mock("../../socket/notificationSocket.js", () => ({
  emitNotification,
  emitUnreadCount,
  getIO,
  roomFor: (userId) => `user:${userId}`,
}));

const { triggerNotification } = await import("../../utils/notification.js");

// ── Generators ───────────────────────────────────────────────────────────────
// A fresh, valid, object-id-shaped 24-hex string.
const objectIdArb = fc
  .hexaString({ minLength: 24, maxLength: 24 })
  .filter((s) => isValidObjectId(s));

const typeArb = fc.constantFrom("LIKE", "COMMENT", "SUBSCRIBE", "TWEET");

// Optional object-id-shaped ref (video / comment) or undefined.
const optionalIdArb = fc.option(objectIdArb, { nil: undefined });

describe("Property 2: trigger persists one record and emits exactly one event to only the recipient's room", () => {
  it("creates one Notification and emits once to the recipient (and no other) with the correct unread count", async () => {
    await fc.assert(
      fc.asyncProperty(
        typeArb,
        objectIdArb,
        objectIdArb,
        optionalIdArb,
        optionalIdArb,
        fc.nat({ max: 9999 }),
        async (type, recipient, sender, video, comment, unreadCount) => {
          // Distinct recipient/sender (sender !== recipient).
          fc.pre(recipient !== sender);

          // Fresh recorder state for this iteration.
          notificationModel.create.mockClear();
          notificationModel.countDocuments.mockClear();
          emitNotification.mockClear();
          emitUnreadCount.mockClear();
          state.unread = unreadCount;

          const result = await triggerNotification({
            type,
            recipient,
            sender,
            video,
            comment,
          });

          // Exactly one record persisted, with the given fields.
          expect(notificationModel.create).toHaveBeenCalledTimes(1);
          expect(notificationModel.create).toHaveBeenCalledWith({
            type,
            recipient,
            sender,
            video,
            comment,
          });
          // The persisted doc (with its _id) is returned to the caller.
          expect(result).toMatchObject({ type, recipient, sender });

          // Exactly one notification event, targeted at the recipient.
          expect(emitNotification).toHaveBeenCalledTimes(1);
          expect(emitNotification.mock.calls[0][0]).toBe(recipient);

          // Exactly one unread-count event, targeted at the recipient with the
          // count equal to the mocked countDocuments return.
          expect(emitUnreadCount).toHaveBeenCalledTimes(1);
          expect(emitUnreadCount.mock.calls[0][0]).toBe(recipient);
          expect(emitUnreadCount.mock.calls[0][1]).toBe(unreadCount);

          // The unread count was computed for THIS recipient's unread set.
          expect(notificationModel.countDocuments).toHaveBeenCalledTimes(1);
          expect(notificationModel.countDocuments).toHaveBeenCalledWith({
            recipient,
            isRead: false,
          });

          // Never emits to any other recipient: every emit's target is the recipient.
          for (const call of emitNotification.mock.calls) {
            expect(call[0]).toBe(recipient);
          }
          for (const call of emitUnreadCount.mock.calls) {
            expect(call[0]).toBe(recipient);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
