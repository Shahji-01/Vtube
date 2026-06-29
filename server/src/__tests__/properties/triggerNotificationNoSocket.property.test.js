// Feature: phase-4-social-discovery, Property 4: Persistence is unaffected and emit no-ops when the socket is not initialized
//
// Property 4: For ANY valid `{ type, recipient, sender, ... }` with
// `sender !== recipient`, when the socket layer is uninitialized
// (`getIO() === null`, because `initNotificationSocket` is never called here),
// `triggerNotification(...)` still calls `Notification.create` exactly once
// (persists one record), does NOT throw, and returns the created doc. The
// realtime emit helpers (`emitNotification` / `emitUnreadCount`) are the REAL
// implementations from `notificationSocket.js`; with `io === null` they are
// genuine no-ops, so REST-only behavior is preserved.
//
// Only the `Notification` model is mocked (so no real DB I/O occurs); the socket
// module is used as-is in its uninitialized state.
//
// Validates: Requirements 1.9, 1.10, 5.5

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { isValidObjectId, Types } from "mongoose";

// Shared mock object for the Notification model, hoisted so the vi.mock factory
// below can reference it. Its methods are (re)assigned per property iteration.
const { notificationMock } = vi.hoisted(() => ({
    notificationMock: {
        create: undefined,
        findById: undefined,
        countDocuments: undefined,
    },
}));

// Mock ONLY the Notification model — no DB access. The socket module is NOT
// mocked: triggerNotification will call the real emit helpers, which no-op
// because the socket layer was never initialized.
vi.mock("../../models/notification.model.js", () => ({
    Notification: notificationMock,
}));

import { triggerNotification } from "../../utils/notification.js";
import { getIO } from "../../socket/notificationSocket.js";

// A fresh, valid 24-hex ObjectId string.
const objectIdArb = fc
    .hexaString({ minLength: 24, maxLength: 24 })
    .filter((s) => isValidObjectId(s));

const typeArb = fc.constantFrom("LIKE", "COMMENT", "SUBSCRIBE", "TWEET");

// Build a thenable, chainable query stand-in mirroring
// `findById(...).populate(...).populate(...)` and resolving to `payload`.
function makeQuery(payload) {
    const q = {
        populate: vi.fn(() => q),
        then: (resolve, reject) => Promise.resolve(payload).then(resolve, reject),
    };
    return q;
}

describe("Property 4: persistence unaffected & emit no-ops when socket is uninitialized", () => {
    it("persists exactly one record, does not throw, and returns the created doc with getIO() === null", async () => {
        await fc.assert(
            fc.asyncProperty(
                typeArb,
                objectIdArb,
                objectIdArb,
                fc.option(objectIdArb, { nil: undefined }),
                fc.option(objectIdArb, { nil: undefined }),
                fc.nat({ max: 5000 }),
                async (type, recipientId, senderId, video, comment, unreadCount) => {
                    // Precondition for Property 4: sender !== recipient.
                    fc.pre(recipientId !== senderId);

                    const recipient = new Types.ObjectId(recipientId);
                    const sender = new Types.ObjectId(senderId);

                    const createdDoc = {
                        _id: new Types.ObjectId(),
                        type,
                        recipient,
                        sender,
                        video,
                        comment,
                        isRead: false,
                    };

                    notificationMock.create = vi.fn().mockResolvedValue(createdDoc);
                    notificationMock.findById = vi.fn(() =>
                        makeQuery({ _id: createdDoc._id, sender, video })
                    );
                    notificationMock.countDocuments = vi
                        .fn()
                        .mockResolvedValue(unreadCount);

                    // The socket layer is uninitialized in this test → emit helpers no-op.
                    expect(getIO()).toBeNull();

                    // Must complete without throwing.
                    const result = await triggerNotification({
                        type,
                        recipient,
                        sender,
                        video,
                        comment,
                    });

                    // Persists exactly one record.
                    expect(notificationMock.create).toHaveBeenCalledTimes(1);

                    // Returns the created doc.
                    expect(result).toBe(createdDoc);

                    // Socket remains uninitialized after the call (no init side effect).
                    expect(getIO()).toBeNull();
                }
            ),
            { numRuns: 150 }
        );
    });
});
