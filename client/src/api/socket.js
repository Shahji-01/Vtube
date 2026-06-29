import { io } from 'socket.io-client'
import { getToken } from './axios'

// Module-level singleton socket instance.
let socket = null

const NOTIFICATION_EVENT = 'Realtime_Notification_Event'
const UNREAD_COUNT_EVENT = 'notification:unread'

/**
 * Resolve the Socket.IO server origin.
 * - Split deploy: prefer VITE_SOCKET_URL, else derive the origin from
 *   VITE_API_URL (e.g. https://vtube-api.onrender.com/api/v1 → origin).
 * - Same-origin deploy / local dev: fall back to window.location.origin.
 */
const resolveSocketUrl = () => {
  const explicit = import.meta.env.VITE_SOCKET_URL
  if (explicit) return explicit

  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl) {
    try {
      return new URL(apiUrl).origin
    } catch {
      /* malformed env — fall through to same-origin */
    }
  }
  return window.location.origin
}

/**
 * Connect the notification socket to the server (default `/socket.io` path).
 * Reuses an existing live connection when present.
 *
 * @param {string} [token] - access token; falls back to getToken().
 * @returns {import('socket.io-client').Socket}
 */
export const connectNotificationSocket = (token) => {
  if (socket && socket.connected) return socket

  socket = io(resolveSocketUrl(), {
    auth: { token: token ?? getToken() },
    withCredentials: true,
    autoConnect: true,
  })

  return socket
}

/**
 * @returns {import('socket.io-client').Socket | null}
 */
export const getSocket = () => socket

/**
 * Disconnect and clear the socket. Never throws.
 */
export const disconnectNotificationSocket = () => {
  if (socket) {
    try {
      socket.disconnect()
    } catch {
      /* never throw to callers */
    }
    socket = null
  }
}

/**
 * Subscribe to realtime notification events.
 * @param {(payload: unknown) => void} cb
 * @returns {() => void} unsubscribe (no-op when disconnected)
 */
export const onNotification = (cb) => {
  if (!socket) return () => {}
  socket.on(NOTIFICATION_EVENT, cb)
  return () => socket.off(NOTIFICATION_EVENT, cb)
}

/**
 * Subscribe to unread-count signals.
 * @param {(payload: unknown) => void} cb
 * @returns {() => void} unsubscribe (no-op when disconnected)
 */
export const onUnreadCount = (cb) => {
  if (!socket) return () => {}
  socket.on(UNREAD_COUNT_EVENT, cb)
  return () => socket.off(UNREAD_COUNT_EVENT, cb)
}
