// Feature: phase-4-social-discovery, Property 3: Self-notification persists nothing and emits nothing
//
// Property 3: Self-notification persists nothing and emits nothing.
// Validates: Requirements 1.7
//
// When `triggerNotification` is called with the SAME user as both `recipient`
// and `sender`, the self-notify short-circuit must fire: the function returns
// `null`, never calls `Notification.create` (so nothing is persisted), and never
// calls `emitNotification` / `emitUnreadCount` (so nothing is delivered).
//
// Strategy (mocked-model + mocked-socket recorder, per the Phase 2/3
// `ownership.property.test.js` style): the `Notification` model and the socket
// module are mocked via `vi.mock` so no real DB or network I/O happens. Every
// model and emit helper is a `vi.fn()` spy whose call count we assert is zero.
// We generate a single id and pass it as BOTH recipient and sender, covering
// plain object-id-shaped strings AND equal objects whose `.toString()` matches.

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { isValidObjectId } from "mongoose";

// ── Hoisted mock fns shared with the vi.mock factories ───────────────────────
const { notificationCreate, notificationFindById, notificationCountDocuments } =
  vi.hoisted(() => ({
    notificationCreate: vi.fn(),
    notificationFindById: vi.fn(),
    notificationCountDocuments: vi.fn(),
  }));

const { emitNotification, emitUnreadCount } = vi.hoisted(() => ({
  emitNotification: vi.fn(),
  emitUnreadCount: vi.fn(),
}));

vi.mock("../../models/notification.model.js", () => ({
  Notification: {
    create: notificationCreate,
    findById: notificationFindById,
    countDocuments: notificationCountDocuments,
  },
}));

vi.mock("../../socket/notificationSocket.js", () => ({
  emitNotification,
  emitUnreadCount,
}));

// Keep the import free of real side effects (no log output).
vi.mock("../../config/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { triggerNotification } = await import("../../utils/notification.js");

// A fresh, valid 24-hex ObjectId string.
const objectIdArb = fc
  .hexaString({ minLength: 24, maxLength: 24 })
  .filter((s) => isValidObjectId(s));

// A notification type drawn from the documented set.
const typeArb = fc.constantFrom("LIKE", "COMMENT", "SUBSCRIBE", "TWEET");

// Optional object-id-shaped ref (video / comment) or undefined — varied to show
// the self-notify short-circuit is independent of the optional payload refs.
const optionalIdArb = fc.option(objectIdArb, { nil: undefined });

beforeEach(() => {
  notificationCreate.mockReset();
  notificationFindById.mockReset();
  notificationCountDocuments.mockReset();
  emitNotification.mockReset();
  emitUnreadCount.mockReset();
});

describe("Property 3: self-notification persists nothing and emits nothing", () => {
  it("string id used as both recipient and sender -> null, no persist, no emit", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectIdArb,
        typeArb,
        optionalIdArb,
        optionalIdArb,
        async (id, type, video, comment) => {
          const result = await triggerNotification({
            type,
            recipient: id,
            sender: id,
            video,
            comment,
          });

          expect(result).toBeNull();
          expect(notificationCreate).not.toHaveBeenCalled();
          expect(notificationFindById).not.toHaveBeenCalled();
          expect(notificationCountDocuments).not.toHaveBeenCalled();
          expect(emitNotification).not.toHaveBeenCalled();
          expect(emitUnreadCount).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 150 },
    );
  });

  it("equal id-shaped objects (matching .toString()) -> null, no persist, no emit", async () => {
    await fc.assert(
      fc.asyncProperty(objectIdArb, typeArb, async (id, type) => {
        // Two distinct object instances whose `.toString()` both yield the same
        // id string — mirrors comparing two Mongoose ObjectId instances.
        const recipient = { toString: () => id };
        const sender = { toString: () => id };

        const result = await triggerNotification({
          type,
          recipient,
          sender,
        });

        expect(result).toBeNull();
        expect(notificationCreate).not.toHaveBeenCalled();
        expect(notificationFindById).not.toHaveBeenCalled();
        expect(notificationCountDocuments).not.toHaveBeenCalled();
        expect(emitNotification).not.toHaveBeenCalled();
        expect(emitUnreadCount).not.toHaveBeenCalled();
      }),
      { numRuns: 150 },
    );
  });

  it("the very same object reference for recipient and sender -> null, no persist, no emit", async () => {
    await fc.assert(
      fc.asyncProperty(objectIdArb, typeArb, async (id, type) => {
        const same = { toString: () => id };

        const result = await triggerNotification({
          type,
          recipient: same,
          sender: same,
        });

        expect(result).toBeNull();
        expect(notificationCreate).not.toHaveBeenCalled();
        expect(emitNotification).not.toHaveBeenCalled();
        expect(emitUnreadCount).not.toHaveBeenCalled();
      }),
      { numRuns: 150 },
    );
  });
});
