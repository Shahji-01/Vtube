// ---------------------SOCKET-ATTACH + createApp SMOKE TESTS-------------------
//
// Smoke tests proving the two ends of the socket-layer wiring contract:
//
//   1. `createApp()` builds a plain Express app WITHOUT touching the socket
//      layer. Building the app must NOT initialize the Socket.IO singleton, so
//      REST-only behavior (and the no-op emit helpers) is preserved when no
//      socket is attached. (R5.5)
//
//   2. `initNotificationSocket(httpServer)` attaches a Socket.IO server to a
//      real Node `http.Server` and flips the `getIO()` singleton from `null`
//      to a live instance. (R1.1)
//
// The Socket.IO instance is a module-level singleton, so test ORDER matters:
// every assertion that depends on the "not yet initialized" state runs BEFORE
// the init test. We never call `.listen()` — Socket.IO only needs the
// `http.Server` object to attach its request listeners — and we close both the
// io server and the http server in `afterAll` so vitest reports no open
// handles.
//
// Task 11.1: Write socket-attach + createApp smoke tests.
// Validates: Requirements 1.1, 5.5

import http from "http";
import { describe, it, expect, afterAll } from "vitest";

import { createApp } from "../../app.js";
import {
  initNotificationSocket,
  getIO,
} from "../../socket/notificationSocket.js";

describe("createApp is socket-free (R5.5)", () => {
  it("builds an Express app (a callable function)", () => {
    const app = createApp();
    // An Express app is itself a request-handler function.
    expect(typeof app).toBe("function");
  });

  it("does not initialize the socket layer as a side effect", () => {
    // Building the app must leave the Socket.IO singleton untouched. Asserted
    // BEFORE any init runs, so getIO() is still in its pristine null state.
    expect(getIO()).toBeNull();

    createApp();

    // Still null after building — createApp never attaches a socket.
    expect(getIO()).toBeNull();
  });
});

describe("initNotificationSocket attaches to an http.Server (R1.1)", () => {
  let httpServer;

  afterAll(() => {
    // Close the io server first (stops accepting connections), then the http
    // server it was attached to — avoids open-handle warnings.
    getIO()?.close();
    httpServer?.close();
  });

  it("flips getIO() from null to a live Socket.IO server", () => {
    // Precondition: untouched singleton (this describe runs after the
    // socket-free block, which asserts and preserves the null state).
    expect(getIO()).toBeNull();

    httpServer = http.createServer();
    const io = initNotificationSocket(httpServer);

    // initNotificationSocket returns the instance AND stores it in the
    // singleton, so getIO() now resolves to the very same non-null server.
    expect(io).not.toBeNull();
    expect(getIO()).not.toBeNull();
    expect(getIO()).toBe(io);
    // A Socket.IO server exposes `.emit`/`.to` — sanity-check it's the real thing.
    expect(typeof getIO().on).toBe("function");
    expect(typeof getIO().to).toBe("function");
  });
});
