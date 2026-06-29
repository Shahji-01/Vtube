import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import logger from "../config/logger.js";

/**
 * Module-level Socket.IO singleton. Stays `null` until `initNotificationSocket`
 * is called from `index.js`, which lets every emit helper degrade to a no-op
 * when no socket layer is attached (e.g. in tests that only build the Express
 * app). (R1.5, R1.6, R1.9)
 */
let io = null;

/**
 * Per-user room name. A socket joins exactly its own room so a targeted
 * `io.to(roomFor(id)).emit(...)` reaches only that user's connections. (R1.6)
 *
 * @param {string|object} userId - The recipient user id.
 * @returns {string} The room name, e.g. `user:507f1f77bcf86cd799439011`.
 */
export function roomFor(userId) {
  return `user:${userId}`;
}

/**
 * Extract a JWT from a Socket.IO handshake. Mirrors `verifyJWT`'s token
 * sources, in priority order:
 *   1. `socket.handshake.auth.token` (set by socket.io-client)
 *   2. `Authorization: Bearer <token>` handshake header
 *   3. the `accessToken` cookie in the handshake `cookie` header
 *
 * @param {import("socket.io").Socket} socket
 * @returns {string|null} The token, or `null` when none is present.
 */
function extractToken(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (authToken) return authToken;

  const authHeader = socket.handshake?.headers?.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }

  const cookieHeader = socket.handshake?.headers?.cookie;
  if (cookieHeader) {
    const match = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("accessToken="));
    if (match) {
      return decodeURIComponent(match.slice("accessToken=".length));
    }
  }

  return null;
}

/**
 * Socket.IO handshake auth middleware. Verifies the access token with the same
 * `ACCESS_TOKEN_SECRET` as `verifyJWT` and loads the user. On ANY failure
 * (missing / malformed / expired token, or unknown user) it rejects the
 * connection via `next(new Error("Unauthorized"))` — Socket.IO surfaces this as
 * a `connect_error` and the connection handler never runs, so no room is
 * joined. (R1.3) On success it attaches `socket.user` and continues. (R1.2)
 *
 * @param {import("socket.io").Socket} socket
 * @param {(err?: Error) => void} next
 */
export async function socketAuth(socket, next) {
  try {
    const token = extractToken(socket);
    if (!token) {
      return next(new Error("Unauthorized"));
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decoded?._id).select(
      "-password -refreshToken"
    );
    if (!user) {
      return next(new Error("Unauthorized"));
    }

    socket.user = user;
    return next();
  } catch {
    // Any verification/lookup error → reject without leaking details.
    return next(new Error("Unauthorized"));
  }
}

/**
 * Connection handler for an authenticated socket. Joins the socket to exactly
 * its own `user:<id>` room (and no other) so targeted emits reach only that
 * user's connections, then logs connect/disconnect via pino. (R1.4)
 *
 * @param {import("socket.io").Socket} socket - An authenticated socket whose
 *   `socket.user` was set by `socketAuth`.
 */
export function handleConnection(socket) {
  const room = roomFor(socket.user._id);
  socket.join(room);
  logger.info(
    { userId: socket.user._id?.toString(), socketId: socket.id, room },
    "Notification socket connected"
  );

  socket.on("disconnect", (reason) => {
    logger.info(
      { userId: socket.user._id?.toString(), socketId: socket.id, reason },
      "Notification socket disconnected"
    );
  });
}

/**
 * Initialize the notification Socket.IO server, attaching it to the shared
 * Node `http.Server` that also serves Express. Constructs the server with CORS
 * mirroring the Express `allowedOrigins` list, registers the handshake auth
 * middleware, wires the connection handler (each authenticated socket joins its
 * own `user:<id>` room), stores the instance in the module singleton, and
 * returns it. Called exactly once from `index.js`. (R1.1, R1.4)
 *
 * @param {import("http").Server} httpServer - The HTTP server to attach to.
 * @returns {import("socket.io").Server} The initialized Socket.IO server.
 */
export function initNotificationSocket(httpServer) {
  const allowedOrigins = [
    process.env.COR_ORIGIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.use(socketAuth);

  io.on("connection", handleConnection);

  return io;
}

/**
 * Accessor for the Socket.IO singleton.
 *
 * @returns {import("socket.io").Server|null} The server, or `null` if never
 *   initialized.
 */
export function getIO() {
  return io;
}

/**
 * Emit a realtime notification to a single recipient's room. No-op when the
 * socket layer is not initialized, so REST-only behavior is preserved. (R1.5,
 * R1.6)
 *
 * @param {string|object} recipientId - The recipient user id.
 * @param {*} payload - The notification payload to deliver.
 */
export function emitNotification(recipientId, payload) {
  if (io === null) return;
  io.to(roomFor(recipientId)).emit("Realtime_Notification_Event", payload);
}

/**
 * Emit an unread-count signal to a single recipient's room. No-op when the
 * socket layer is not initialized. (R1.8)
 *
 * @param {string|object} recipientId - The recipient user id.
 * @param {number} count - The recipient's current unread notification count.
 */
export function emitUnreadCount(recipientId, count) {
  if (io === null) return;
  io.to(roomFor(recipientId)).emit("notification:unread", {
    unreadCount: count,
  });
}
