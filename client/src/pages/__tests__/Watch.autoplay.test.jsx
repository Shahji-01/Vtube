// Feature: phase-3-viewer-features, Task 12.2 — Watch autoplay / unmute tests
// Validates: Requirements 5.1, 5.3, 5.4, 5.5
//
// Watch.jsx reads the `prefers-reduced-motion: reduce` media query and mounts
// the VideoPlayer with `{ muted: true, autoplay: true }` normally, or
// `{ muted: false, autoplay: false }` under reduced motion. It renders a visible
// UnmuteButton bound to the player's mute state, and guards the explicit
// `player.play()` so a blocked autoplay surfaces no user-facing error.
//
// Watch.jsx is heavy (loads the video, comments, related, the real
// VideoPlayer + video.js, hooks, etc.), so we mock its dependencies and assert
// only the autoplay/unmute wiring:
//   - ../../components/VideoPlayer → a stub that records the `options` prop it
//     receives and calls `onReady(fakePlayer)` once on mount.
//   - ../../api/axios → the video fetch resolves a fake video; comments/related
//     resolve empty.
//   - ../../context/AuthContext → useAuth() → { user } (anonymous here, so the
//     progress hook stays disabled and never touches the network).
//   - ../../context/ToastContext → useToast() → a no-op toast.
//   - window.matchMedia → controlled per test to drive the reduced-motion path.
//
// Tests:
//   1. Motion allowed → VideoPlayer options have muted:true + autoplay:true, and
//      the UnmuteButton is present conveying the muted state (R5.1).
//   2. Reduced motion set → options have muted:false + autoplay:false (R5.4).
//   3. Unmute affordance toggles audio: after onReady fires with a muted player,
//      clicking Unmute calls player.muted(false) and the affordance flips to the
//      unmuted ("Mute") state (R5.3).
//   4. Blocked autoplay surfaces no error: the fake player's play() rejects; the
//      component stays rendered and nothing throws (R5.5).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// ── Hoisted state shared with the async mock factories below ──
const h = vi.hoisted(() => ({
  // VideoPlayer stub capture slots.
  capturedOptions: null,
  capturedPoster: null,
  // The fake video.js player the stub hands to onReady (set per test).
  fakePlayer: null,
  // Authenticated user (null = anonymous → progress hook disabled).
  user: null,
  // Captured toast() calls (no-op).
  toast: vi.fn(),
  // The fake video returned by the /videos/:id fetch.
  video: {
    _id: 'vid-1',
    videoFile: 'https://res.cloudinary.com/demo/video/upload/v1/vtube/clip.mp4',
    thumbnail: 'https://res.cloudinary.com/demo/image/upload/v1/vtube/poster.jpg',
    duration: 600,
    title: 'Autoplay Test Video',
    owner: { _id: 'owner-1', username: 'creator', fullName: 'Creator Name', avatar: '' },
  },
}))

// ── Mock VideoPlayer: record options + fire onReady(fakePlayer) once on mount ──
vi.mock('../../components/VideoPlayer', async () => {
  const React = await import('react')
  return {
    default: ({ options, onReady, poster }) => {
      // Capture the options/poster on every render so the test can inspect the
      // final wiring after the video loads.
      h.capturedOptions = options
      h.capturedPoster = poster

      // Hand the parent a fake player once, mirroring video.js `onReady`.
      React.useEffect(() => {
        if (onReady && h.fakePlayer) onReady(h.fakePlayer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      return React.createElement('div', { 'data-testid': 'video-player-stub' })
    },
  }
})

// ── Mock the axios client: video resolves; comments/related resolve empty ──
vi.mock('../../api/axios', () => {
  const get = vi.fn((url) => {
    if (typeof url === 'string' && url.startsWith('/videos/')) {
      return Promise.resolve({ data: { data: h.video } })
    }
    // comments, related videos, watch-progress, etc.
    return Promise.resolve({ data: { data: { docs: [] } } })
  })
  const api = {
    get,
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    defaults: { baseURL: '/api/v1' },
  }
  return { default: api, getToken: vi.fn(() => null) }
})

// ── Mock the contexts so Watch + its children mount cleanly ──
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: h.user }),
}))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => h.toast,
}))

import Watch from '../Watch'

/**
 * Fake video.js player. `muted()` is a getter/setter (mirroring video.js):
 * `muted()` returns the current state, `muted(v)` sets it. `on`/`off` register
 * handlers we can trigger; `play()` is configurable (resolve / reject).
 */
function createFakePlayer({ muted = true, play } = {}) {
  let isMuted = muted
  const handlers = {}
  return {
    muted: vi.fn((v) => {
      if (v === undefined) return isMuted
      isMuted = v
    }),
    on: vi.fn((event, cb) => {
      ;(handlers[event] ??= []).push(cb)
    }),
    off: vi.fn((event, cb) => {
      if (handlers[event]) handlers[event] = handlers[event].filter((fn) => fn !== cb)
    }),
    currentTime: vi.fn(() => 0),
    play: play || vi.fn(() => Promise.resolve()),
    isDisposed: () => false,
    // test helper (not part of the player API)
    trigger(event) {
      ;(handlers[event] ?? []).forEach((fn) => fn())
    },
  }
}

function setReducedMotion(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

async function renderWatch() {
  let utils
  await act(async () => {
    utils = render(
      <MemoryRouter initialEntries={['/watch/vid-1']}>
        <Routes>
          <Route path="/watch/:videoId" element={<Watch />} />
        </Routes>
      </MemoryRouter>,
    )
  })
  // Wait for the video fetch to resolve and the page (and player stub) to mount.
  await screen.findByRole('heading', { name: h.video.title })
  return utils
}

beforeEach(() => {
  h.capturedOptions = null
  h.capturedPoster = null
  h.fakePlayer = null
  h.user = null
  h.toast.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Watch autoplay / unmute wiring', () => {
  it('motion allowed → mounts the player with muted + autoplay and shows the muted Unmute affordance (R5.1)', async () => {
    setReducedMotion(false)
    h.fakePlayer = createFakePlayer({ muted: true })

    await renderWatch()

    // The VideoPlayer received muted-autoplay options.
    expect(h.capturedOptions).toMatchObject({ muted: true, autoplay: true, controls: true })

    // A visible Unmute affordance conveys the muted state (its accessible name
    // names the action it performs while muted → "Unmute").
    const unmute = screen.getByRole('button', { name: 'Unmute' })
    expect(unmute).toBeInTheDocument()
    expect(unmute).toHaveAttribute('aria-pressed', 'false')
  })

  it('reduced motion set → mounts the player with muted:false and autoplay:false (R5.4)', async () => {
    setReducedMotion(true)
    h.fakePlayer = createFakePlayer({ muted: false })

    await renderWatch()

    expect(h.capturedOptions).toMatchObject({ muted: false, autoplay: false, controls: true })

    // With autoplay disabled the affordance starts in the unmuted ("Mute") state.
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument()
  })

  it('activating the Unmute affordance restores audio and flips it to the unmuted state (R5.3)', async () => {
    setReducedMotion(false)
    const player = createFakePlayer({ muted: true })
    h.fakePlayer = player

    await renderWatch()

    // After onReady the affordance reflects the player's muted state.
    const unmute = await screen.findByRole('button', { name: 'Unmute' })
    expect(unmute).toHaveAttribute('aria-pressed', 'false')

    // Clicking restores audio: the player is unmuted and the affordance updates.
    await act(async () => {
      fireEvent.click(unmute)
    })

    expect(player.muted).toHaveBeenCalledWith(false)
    expect(player.muted()).toBe(false)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Mute' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('blocked autoplay surfaces no error: play() rejects but the page stays rendered (R5.5)', async () => {
    setReducedMotion(false)
    const rejectingPlay = vi.fn(() => Promise.reject(new Error('autoplay blocked')))
    const player = createFakePlayer({ muted: true, play: rejectingPlay })
    h.fakePlayer = player

    await renderWatch()

    // Watch attempts an explicit play() when autoplay is desired.
    expect(rejectingPlay).toHaveBeenCalled()

    // Flush the rejected play() microtask; the component's .catch() handles it,
    // so nothing throws and the page remains mounted with its controls.
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByRole('heading', { name: h.video.title })).toBeInTheDocument()
    expect(screen.getByTestId('video-player-stub')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument()
  })
})
