// Feature: phase-3-viewer-features, Task 12.3 — WatchLaterButton control tests
// Validates: Requirements 4.9, 4.10
//
// WatchLaterButton renders a real, keyboard-operable <button> whose
// `aria-pressed` reflects Watch Later membership and whose accessible name
// describes the action (Save to Watch Later / Remove from Watch Later).
//
// These tests mock the axios client (api.post / api.delete resolve), and the
// Auth/Toast contexts so we can control the signed-in `user` and capture toast
// calls:
//   1. Authenticated toggle: add → POST /watch-later/:id, aria-pressed flips
//      true and the name becomes "Remove from Watch Later"; remove → DELETE and
//      the state flips back (R4.9).
//   2. Anonymous viewer: activating shows a sign-in toast and sends NO request
//      (R4.10).
//   3. Keyboard operability: the control is a real <button> exposed with role
//      "button" and an accessible name, focusable, and activated by Enter/Space.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ── Hoisted control shared with the mock factories below ──
const h = vi.hoisted(() => ({
  // Current authenticated user (null = anonymous). Mutated per test.
  user: null,
  // Captures every toast({ message, type }) call.
  toast: vi.fn(),
}))

// ── Mock the axios client: api.post / api.delete resolve successfully ──
vi.mock('../../../api/axios', () => {
  const api = {
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  }
  return { default: api }
})

// ── Mock AuthContext: useAuth() → { user } (controlled via hoisted state) ──
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: h.user }),
}))

// ── Mock ToastContext: useToast() → the captured toast function ──
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => h.toast,
}))

import api from '../../../api/axios'
import WatchLaterButton from '../WatchLaterButton'

const VIDEO_ID = 'vid-123'

beforeEach(() => {
  h.user = null
  h.toast.mockReset()
  api.post.mockClear()
  api.delete.mockClear()
  api.post.mockResolvedValue({ data: {} })
  api.delete.mockResolvedValue({ data: {} })
})

describe('WatchLaterButton', () => {
  it('authenticated: toggles add via POST then remove via DELETE, flipping aria-pressed and the accessible name (R4.9)', async () => {
    h.user = { _id: 'u-1', username: 'viewer' }

    render(<WatchLaterButton videoId={VIDEO_ID} />)

    // Initial state: not saved → "Save to Watch Later", aria-pressed false.
    let btn = screen.getByRole('button', { name: 'Save to Watch Later' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')

    // ── Add: clicking issues POST /watch-later/:id ──
    await act(async () => {
      fireEvent.click(btn)
    })

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith(`/watch-later/${VIDEO_ID}`)
    expect(api.delete).not.toHaveBeenCalled()

    // After the request resolves the control reflects the saved state.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove from Watch Later' })).toBeInTheDocument(),
    )
    btn = screen.getByRole('button', { name: 'Remove from Watch Later' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toBeEnabled()

    // ── Remove: clicking the saved control issues DELETE /watch-later/:id ──
    await act(async () => {
      fireEvent.click(btn)
    })

    expect(api.delete).toHaveBeenCalledTimes(1)
    expect(api.delete).toHaveBeenCalledWith(`/watch-later/${VIDEO_ID}`)
    expect(api.post).toHaveBeenCalledTimes(1) // no extra POST

    // State flips back to the unsaved control.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save to Watch Later' })).toBeInTheDocument(),
    )
    btn = screen.getByRole('button', { name: 'Save to Watch Later' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('anonymous: activating shows a sign-in toast and sends NO request (R4.10)', async () => {
    h.user = null

    render(<WatchLaterButton videoId={VIDEO_ID} />)

    const btn = screen.getByRole('button', { name: 'Save to Watch Later' })

    await act(async () => {
      fireEvent.click(btn)
    })

    // A sign-in toast was shown.
    expect(h.toast).toHaveBeenCalledTimes(1)
    const [arg] = h.toast.mock.calls[0]
    expect(arg.message).toMatch(/sign in/i)

    // No add/remove request was issued, and the control stays unsaved.
    expect(api.post).not.toHaveBeenCalled()
    expect(api.delete).not.toHaveBeenCalled()
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Save to Watch Later' })).toBeInTheDocument()
  })

  it('is operable by keyboard: a real focusable <button> with an accessible name that Enter/Space activate (R4.9)', async () => {
    h.user = { _id: 'u-1', username: 'viewer' }

    render(<WatchLaterButton videoId={VIDEO_ID} />)

    const btn = screen.getByRole('button', { name: 'Save to Watch Later' })

    // A real <button> element — natively focusable and keyboard-activatable.
    expect(btn.tagName.toLowerCase()).toBe('button')
    expect(btn).toHaveAttribute('type', 'button')

    btn.focus()
    expect(btn).toHaveFocus()

    // The browser dispatches a click when Enter/Space activate a focused
    // <button>; emulate that activation to confirm the handler runs (POST).
    await act(async () => {
      fireEvent.keyDown(btn, { key: 'Enter', code: 'Enter' })
      fireEvent.click(btn)
    })

    expect(api.post).toHaveBeenCalledWith(`/watch-later/${VIDEO_ID}`)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove from Watch Later' })).toBeInTheDocument(),
    )
  })
})
