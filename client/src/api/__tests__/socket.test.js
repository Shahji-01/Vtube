// Feature: phase-4-social-discovery, Task 12.1 — Notification_Socket client unit tests
// Validates: Requirements 1.2, 1.10
//
// The socket module (src/api/socket.js) wraps socket.io-client to manage a
// single Notification_Socket singleton:
//   - connectNotificationSocket(token) creates the socket with an
//     auth: { token } option and withCredentials: true, reusing a live
//     connection instead of creating a second socket (R1.2).
//   - onNotification / onUnreadCount register listeners for the
//     'Realtime_Notification_Event' / 'notification:unread' events and return
//     unsubscribe functions that detach the same handler. When no socket is
//     connected they return safe no-op unsubscribes (R1.10).
//   - disconnectNotificationSocket() tears the socket down without throwing and
//     clears the singleton so getSocket() returns null.
//
// These tests mock:
//   - socket.io-client → io() returns a recorder `fakeSocket` so we can assert
//     the connection options and listener registrations.
//   - ../axios         → getToken() returns a known token to verify the auth
//     option falls back to the stored access token.
//
// The module holds a module-level singleton, so each test calls
// vi.resetModules() and dynamically imports a fresh copy.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Hoisted recorder shared with the mock factories below ──
const h = vi.hoisted(() => ({
  fakeSocket: {
    connected: false,
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  },
  KNOWN_TOKEN: 'stored-token-xyz',
}))

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => h.fakeSocket),
}))

vi.mock('../axios', () => ({
  getToken: vi.fn(() => h.KNOWN_TOKEN),
}))

const NOTIFICATION_EVENT = 'Realtime_Notification_Event'
const UNREAD_COUNT_EVENT = 'notification:unread'

// Fresh module + io spy per test (singleton lives at module scope).
const loadModule = async () => {
  vi.resetModules()
  const mod = await import('../socket.js')
  const { io } = await import('socket.io-client')
  return { mod, io }
}

beforeEach(() => {
  // Clears call history on every mock (io, getToken, fakeSocket.*) while
  // preserving their implementations — the io spy is shared across the
  // per-test module reloads, so its calls must be reset between tests.
  vi.clearAllMocks()
  h.fakeSocket.connected = false
})

describe('connectNotificationSocket', () => {
  it('creates the socket with auth token + withCredentials and returns it', async () => {
    const { mod, io } = await loadModule()

    const result = mod.connectNotificationSocket('tok')

    expect(io).toHaveBeenCalledTimes(1)
    const [, options] = io.mock.calls[0]
    expect(options).toMatchObject({
      auth: { token: 'tok' },
      withCredentials: true,
    })
    expect(result).toBe(h.fakeSocket)
  })

  it('falls back to getToken() when no token is passed', async () => {
    const { mod, io } = await loadModule()

    mod.connectNotificationSocket()

    const [, options] = io.mock.calls[0]
    expect(options.auth.token).toBe(h.KNOWN_TOKEN)
  })

  it('reuses the existing socket while connected (does not create a second)', async () => {
    const { mod, io } = await loadModule()

    const first = mod.connectNotificationSocket('tok')
    expect(io).toHaveBeenCalledTimes(1)

    // Simulate the live connection, then connect again.
    h.fakeSocket.connected = true
    const second = mod.connectNotificationSocket('tok')

    expect(io).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })
})

describe('onNotification / onUnreadCount (connected)', () => {
  it('registers a Realtime_Notification_Event listener and unsubscribes it', async () => {
    const { mod } = await loadModule()
    mod.connectNotificationSocket('tok')

    const cb = vi.fn()
    const unsubscribe = mod.onNotification(cb)

    expect(h.fakeSocket.on).toHaveBeenCalledWith(NOTIFICATION_EVENT, cb)

    unsubscribe()
    expect(h.fakeSocket.off).toHaveBeenCalledWith(NOTIFICATION_EVENT, cb)
  })

  it('registers a notification:unread listener and unsubscribes it', async () => {
    const { mod } = await loadModule()
    mod.connectNotificationSocket('tok')

    const cb = vi.fn()
    const unsubscribe = mod.onUnreadCount(cb)

    expect(h.fakeSocket.on).toHaveBeenCalledWith(UNREAD_COUNT_EVENT, cb)

    unsubscribe()
    expect(h.fakeSocket.off).toHaveBeenCalledWith(UNREAD_COUNT_EVENT, cb)
  })
})

describe('disconnectNotificationSocket', () => {
  it('disconnects the socket without throwing and clears the singleton', async () => {
    const { mod } = await loadModule()
    mod.connectNotificationSocket('tok')

    expect(mod.getSocket()).toBe(h.fakeSocket)

    expect(() => mod.disconnectNotificationSocket()).not.toThrow()
    expect(h.fakeSocket.disconnect).toHaveBeenCalledTimes(1)
    expect(mod.getSocket()).toBeNull()
  })
})

describe('onNotification / onUnreadCount (disconnected)', () => {
  it('return no-op unsubscribes that never touch the socket and never throw', async () => {
    const { mod } = await loadModule()

    // No socket created yet.
    const cb = vi.fn()
    const unsubNotif = mod.onNotification(cb)
    const unsubUnread = mod.onUnreadCount(cb)

    expect(h.fakeSocket.on).not.toHaveBeenCalled()
    expect(() => unsubNotif()).not.toThrow()
    expect(() => unsubUnread()).not.toThrow()
    expect(h.fakeSocket.off).not.toHaveBeenCalled()
  })
})
