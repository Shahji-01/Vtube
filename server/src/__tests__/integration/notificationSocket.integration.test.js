// ----------------END-TO-END NOTIFICATION SOCKET INTEGRATION TEST-------------
//
// Task 11.4: Write an end-to-end socket integration test.
// Validates: Requirements 1.5, 1.6, 1.8
//
// This is a REAL end-to-end delivery test (not a pure mock and not a PBT). It
// stands up a real Node `http.Server` with the real Socket.IO server attached
// via `initNotificationSocket`, then connects TWO real `socket.io-client`
// connections to an ephemeral localhost port:
//
//   - the RECIPIENT  (authenticated as `recipientId`)
//   - a NON-RECIPIENT (authenticated as `otherUserId`)
//
// Both connections authenticate through the REAL `socketAuth` handshake
// middleware using REAL JWTs signed with `process.env.ACCESS_TOKEN_SECRET`.
// We then call the REAL `triggerNotification(...)`, which calls the REAL
// `emitNotification`/`emitUnreadCount` against the REAL `io`, and assert:
//
//   - the recipient receives EXACTLY ONE `Realtime_Notification_Event`   (R1.5)
//   - the non-recipient receives NOTHING (room isolation)                (R1.6)
//   - the recipient also receives an unread-count signal                 (R1.8)
//
// To avoid a live MongoDB while still exercising the real socket path, only the
// Mongoose models are mocked:
//   - `User`         → `User.findById(id).select(...)` resolves a user whose
//                      `_id` is the presented token's `_id`, so the socket joins
//                      exactly `user:<id>`.
//   - `Notification` → `create`/`findById(...).populate(...)`/`countDocuments`
//                      resolve in-memory, so the REAL `triggerNotification` runs
//                      end-to-end without touching a database.
// `logger` is mocked to keep test output clean. Everything else (Socket.IO
// server, socket.io-client, JWT signing/verification, room join + targeted
// emit) is REAL.

import http from "http";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import jwt from "jsonwebtoken";
import ioClient from "socket.io-client";

// The real `socketAuth` verifies with this secret; set it BEFORE importing the
// modules under test so `jwt.sign`/`jwt.verify` agree.
process.env.ACCESS_TOKEN_SECRET =
  process.env.ACCESS_TOKEN_SECRET || "test-secret";

// ── In-memory Notification model mock (shared via vi.hoisted) ────────────────
const { notificationModel, state } = vi.hoisted(() => {
  const state = { unread: 4 };
  return {
    state,
    notificationModel: {
      // Persist: echo the doc with a fresh _id, no DB.
      create: vi.fn(async (doc) => ({
        _id: "deadbeefdeadbeefdeadbeef",
        ...doc,
      })),
      // findById(...).populate(...).populate(...) → a populated-ish payload.
      findById: vi.fn(() => {
        const query = {
          populate: vi.fn(() => query),
          then: (resolve) =>
            resolve({ _id: "deadbeefdeadbeefdeadbeef", populated: true }),
        };
        return query;
      }),
      // Recipient's unread count.
      countDocuments: vi.fn(async () => state.unread),
    },
  };
});

vi.mock("../../models/notification.model.js", () => ({
  Notification: notificationModel,
}));

// `socketAuth` calls `User.findById(decoded._id).select(...)`. Resolve a user
// whose `_id` equals the requested id so the socket joins `user:<id>`.
vi.mock("../../models/user.model.js", () => ({
  User: {
    findById: vi.fn((id) => ({
      select: vi.fn(async () => ({
        _id: String(id),
        username: `u_${String(id).slice(0, 6)}`,
      })),
    })),
  },
}));

vi.mock("../../config/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Real modules under test (real io + real emit path).
const { initNotificationSocket, getIO } = await import(
  "../../socket/notificationSocket.js"
);
const { triggerNotification } = await import("../../utils/notification.js");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Distinct, ObjectId-shaped 24-hex ids.
const recipientId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";
const senderId = "507f1f77bcf86cd799439013";
const videoId = "507f1f77bcf86cd799439014";

let httpServer;
let port;
let recipientClient;
let otherClient;

beforeAll(async () => {
  httpServer = http.createServer();
  initNotificationSocket(httpServer);

  // Ephemeral port.
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;

  const recipientToken = jwt.sign(
    { _id: recipientId },
    process.env.ACCESS_TOKEN_SECRET,
  );
  const otherToken = jwt.sign(
    { _id: otherUserId },
    process.env.ACCESS_TOKEN_SECRET,
  );

  const url = `http://127.0.0.1:${port}`;
  recipientClient = ioClient(url, {
    auth: { token: recipientToken },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  otherClient = ioClient(url, {
    auth: { token: otherToken },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });

  // Wait for BOTH to connect (or fail fast on a handshake rejection).
  await Promise.all([
    new Promise((resolve, reject) => {
      recipientClient.once("connect", resolve);
      recipientClient.once("connect_error", reject);
    }),
    new Promise((resolve, reject) => {
      otherClient.once("connect", resolve);
      otherClient.once("connect_error", reject);
    }),
  ]);

  // Give the server-side `connection` handler a beat to run `socket.join(...)`
  // before we emit, so the targeted room is populated.
  await delay(150);
}, 20000);

afterAll(() => {
  recipientClient?.disconnect();
  otherClient?.disconnect();
  getIO()?.close();
  httpServer?.close();
});

describe("notification socket end-to-end delivery (R1.5, R1.6, R1.8)", () => {
  it("delivers exactly one event to the recipient room and nothing to a non-recipient", async () => {
    const recipientEvents = [];
    const otherEvents = [];
    const recipientUnread = [];

    recipientClient.on("Realtime_Notification_Event", (p) =>
      recipientEvents.push(p),
    );
    recipientClient.on("notification:unread", (p) => recipientUnread.push(p));
    otherClient.on("Realtime_Notification_Event", (p) => otherEvents.push(p));

    // Resolve as soon as the recipient gets its event (bounded by the race).
    const firstEvent = new Promise((resolve) =>
      recipientClient.once("Realtime_Notification_Event", resolve),
    );

    // Real trigger → real persist (mocked model) → real emit to the real io.
    const result = await triggerNotification({
      type: "LIKE",
      recipient: recipientId,
      sender: senderId,
      video: videoId,
      comment: undefined,
    });

    // A record was "persisted" and returned (sender !== recipient).
    expect(result).toMatchObject({ type: "LIKE", recipient: recipientId });

    // Wait for delivery (bounded), then a short settle window to prove the
    // non-recipient never receives a stray event.
    await Promise.race([firstEvent, delay(1500)]);
    await delay(300);

    // Recipient room got EXACTLY ONE notification event.
    expect(recipientEvents).toHaveLength(1);
    expect(recipientEvents[0]).toBeTruthy();

    // Non-recipient room got NOTHING (room isolation).
    expect(otherEvents).toHaveLength(0);

    // Recipient also received the unread-count signal with the current count.
    expect(recipientUnread.length).toBeGreaterThanOrEqual(1);
    expect(recipientUnread[0]).toMatchObject({ unreadCount: state.unread });
  }, 15000);
});
