// Feature: phase-4-social-discovery, Task 12.2 — NotificationsDropdown fallback + realtime tests
// Validates: Requirements 1.10, 1.5, 1.8
//
// NotificationsDropdown loads notifications via the unchanged Notification_REST
// endpoint (GET /api/v1/notifications) and, when a Notification_Socket is live,
// also applies realtime pushes — prepending new events and reflecting the
// server's Unread_Count_Signal in the unread badge.
//
// These tests mock:
//   - ../../api/axios            → default `api` whose get('/notifications')
//                                  resolves a list (one unread) and whose
//                                  patch/delete resolve.
//   - ../../api/socket           → connectNotificationSocket / getSocket plus
//                                  controllable onNotification / onUnreadCount
//                                  that capture their callbacks so a test can
//                                  invoke them to simulate a server push. When
//                                  "disconnected" they return no-op unsubscribes
//                                  and never invoke the callback.
//   - ../../context/AuthContext  → useAuth() → { user } (controlled per test).
//
// Tests:
//   1. Realtime_Fallback: with the socket unavailable (no callbacks ever fired),
//      the dropdown still loads notifications over REST — the unread badge
//      reflects the fetched list and the items render — with no thrown error
//      (R1.10).
//   2. Realtime: with an authenticated user and a live socket, invoking the
//      captured onNotification callback prepends the pushed notification and
//      bumps the badge (R1.5); invoking the captured onUnreadCount callback with
//      { unreadCount: N } sets the badge to N (R1.8).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── Hoisted control shared with the mock factories below ──
const h = vi.hoisted(() => ({
  // Authenticated user (null = anonymous). Mutated per test.
  user: { _id: 'me-1', username: 'me' },
  // Whether a live Notification_Socket exists.
  socketConnected: false,
  // Captured socket callbacks (set only when "connected").
  notificationCb: null,
  unreadCountCb: null,
}))

// ── Mock the axios client: api.get resolves the REST list; patch/delete resolve ──
vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

// ── Mock the notification socket: callbacks captured only when connected ──
vi.mock('../../api/socket', () => ({
  connectNotificationSocket: vi.fn(() => ({ connected: h.socketConnected })),
  getSocket: vi.fn(() => (h.socketConnected ? { connected: true } : null)),
  onNotification: vi.fn((cb) => {
    if (!h.socketConnected) return () => {} // no-op unsubscribe; cb never fires
    h.notificationCb = cb
    return () => {
      h.notificationCb = null
    }
  }),
  onUnreadCount: vi.fn((cb) => {
    if (!h.socketConnected) return () => {} // no-op unsubscribe; cb never fires
    h.unreadCountCb = cb
    return () => {
      h.unreadCountCb = null
    }
  }),
}))

// ── Mock AuthContext: useAuth() → { user } (controlled via hoisted state) ──
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: h.user }),
}))

import api from '../../api/axios'
import NotificationsDropdown from '../NotificationsDropdown'

const NOW = new Date().toISOString()

function makeNotification(overrides = {}) {
  return {
    _id: 'n-1',
    type: 'LIKE',
    isRead: false,
    sender: { username: 'alice', avatar: '' },
    video: { title: 'Cool Video' },
    createdAt: NOW,
    ...overrides,
  }
}

function renderDropdown() {
  return render(
    <MemoryRouter>
      <NotificationsDropdown />
    </MemoryRouter>,
  )
}

// The unread badge element carries the `notification-badge` class.
const queryBadge = (container) => container.querySelector('.notification-badge')

beforeEach(() => {
  h.user = { _id: 'me-1', username: 'me' }
  h.socketConnected = false
  h.notificationCb = null
  h.unreadCountCb = null

  api.get.mockReset()
  api.patch.mockReset()
  api.delete.mockReset()
  api.get.mockResolvedValue({ data: { data: [makeNotification()] } })
  api.patch.mockResolvedValue({ data: {} })
  api.delete.mockResolvedValue({ data: {} })
})

describe('NotificationsDropdown', () => {
  it('Realtime_Fallback: with the socket unavailable, still loads notifications over REST and surfaces no error (R1.10)', async () => {
    // Socket is "unavailable": onNotification/onUnreadCount return no-op
    // unsubscribes and never invoke their callbacks.
    h.socketConnected = false

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { container } = renderDropdown()

    // The REST endpoint was queried (path unchanged).
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/notifications'))

    // The unread badge reflects the fetched list (one unread → "1").
    await waitFor(() => {
      const badge = queryBadge(container)
      expect(badge).not.toBeNull()
      expect(badge).toHaveTextContent('1')
    })

    // No realtime callback was ever captured (socket unavailable).
    expect(h.notificationCb).toBeNull()
    expect(h.unreadCountCb).toBeNull()

    // Opening the dropdown renders the REST-loaded item.
    fireEvent.click(screen.getByTitle('Notifications'))
    expect(await screen.findByText('@alice')).toBeInTheDocument()
    expect(screen.getByText(/liked your video/i)).toBeInTheDocument()

    // No hard error surfaced from the fallback path.
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('Realtime: a pushed notification prepends and bumps the badge, and the unread-count signal sets it (R1.5, R1.8)', async () => {
    // A live socket: onNotification/onUnreadCount capture their callbacks.
    h.socketConnected = true

    const { container } = renderDropdown()

    // Initial REST load: one unread → badge "1", and the socket callback captured.
    await waitFor(() => {
      const badge = queryBadge(container)
      expect(badge).toHaveTextContent('1')
    })
    await waitFor(() => expect(h.notificationCb).toBeTypeOf('function'))

    // ── Simulate a server push (Realtime_Notification_Event) ──
    const pushed = makeNotification({
      _id: 'n-2',
      type: 'COMMENT',
      isRead: false,
      sender: { username: 'bob', avatar: '' },
      video: { title: 'Another Video' },
    })

    act(() => {
      h.notificationCb(pushed)
    })

    // Badge increments (1 → 2) because the pushed item is unread.
    await waitFor(() => expect(queryBadge(container)).toHaveTextContent('2'))

    // Open the dropdown and confirm the pushed item is rendered and prepended.
    fireEvent.click(screen.getByTitle('Notifications'))
    expect(await screen.findByText('@bob')).toBeInTheDocument()

    const users = container.querySelectorAll('.notification-user')
    expect(users).toHaveLength(2)
    expect(users[0]).toHaveTextContent('@bob') // newest first
    expect(users[1]).toHaveTextContent('@alice')

    // ── Simulate an Unread_Count_Signal ──
    await waitFor(() => expect(h.unreadCountCb).toBeTypeOf('function'))

    act(() => {
      h.unreadCountCb({ unreadCount: 7 })
    })

    await waitFor(() => expect(queryBadge(container)).toHaveTextContent('7'))
  })
})
