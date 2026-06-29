// Feature: phase-3-viewer-features, Task 9.3 — save-cadence tests for useWatchProgress
// Validates: Requirements 3.9, 3.12
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// ── Mock the axios client (default export `api` + named `getToken`) ──
vi.mock('../../api/axios.js', () => {
  const api = {
    get: vi.fn(() => Promise.resolve({ data: { data: { positionSeconds: 0 } } })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    defaults: { baseURL: '/api/v1' },
  }
  return {
    default: api,
    getToken: vi.fn(() => null),
  }
})

import api from '../../api/axios.js'
import useWatchProgress, { SAVE_INTERVAL_MS } from '../useWatchProgress.js'

/**
 * Fake video.js player. `on`/`off` register/unregister handlers we trigger
 * manually via `trigger(event)`. `currentTime()` returns a controllable value;
 * `currentTime(v)` sets it (mirroring the real player seek API).
 */
function createFakePlayer(initialTime = 0) {
  const handlers = {}
  let time = initialTime
  return {
    on: vi.fn((event, cb) => {
      ;(handlers[event] ??= []).push(cb)
    }),
    off: vi.fn((event, cb) => {
      if (handlers[event]) handlers[event] = handlers[event].filter((h) => h !== cb)
    }),
    currentTime: vi.fn((v) => {
      if (v !== undefined) {
        time = v
        return
      }
      return time
    }),
    // test helpers (not part of the player API)
    trigger(event) {
      ;(handlers[event] ?? []).forEach((h) => h())
    },
    setTime(t) {
      time = t
    },
  }
}

// Mount the hook and flush the initial resume-fetch promise so no act() warning
// leaks from the async setResumeTo state update.
async function mountHook(player, overrides = {}) {
  let result
  await act(async () => {
    result = renderHook(() =>
      useWatchProgress({ videoId: 'vid-1', duration: 600, player, enabled: true, ...overrides }),
    )
  })
  return result
}

describe('useWatchProgress save cadence (Requirements 3.9, 3.12)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { data: { positionSeconds: 0 } } })
    api.put.mockResolvedValue({ data: {} })
    api.defaults.baseURL = '/api/v1'
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('throttles continuous playback to at most one save per SAVE_INTERVAL_MS', async () => {
    const player = createFakePlayer(0)
    await mountHook(player)

    // Repeated timeupdates within a single 5s window → exactly one PUT.
    player.setTime(1)
    player.trigger('timeupdate')
    player.setTime(2)
    player.trigger('timeupdate')
    player.setTime(3)
    player.trigger('timeupdate')

    expect(api.put).toHaveBeenCalledTimes(1)
    expect(api.put).toHaveBeenLastCalledWith('/watch-progress/vid-1', { positionSeconds: 1 })

    // Advance past the throttle window → next timeupdate saves again.
    vi.advanceTimersByTime(SAVE_INTERVAL_MS + 1)
    player.setTime(10)
    player.trigger('timeupdate')

    expect(api.put).toHaveBeenCalledTimes(2)
    expect(api.put).toHaveBeenLastCalledWith('/watch-progress/vid-1', { positionSeconds: 10 })
  })

  it('saves once when the player fires a pause event', async () => {
    const player = createFakePlayer(0)
    await mountHook(player)

    player.setTime(42)
    player.trigger('pause')

    expect(api.put).toHaveBeenCalledTimes(1)
    expect(api.put).toHaveBeenCalledWith('/watch-progress/vid-1', { positionSeconds: 42 })
  })

  it('flushes a final position via sendBeacon on pagehide (unload)', async () => {
    const beacon = vi.fn(() => true)
    navigator.sendBeacon = beacon

    const player = createFakePlayer(123)
    await mountHook(player)

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(beacon).toHaveBeenCalledTimes(1)
    const [url] = beacon.mock.calls[0]
    expect(url).toContain('/watch-progress/vid-1')
  })

  it('startOver() seeks the player to 0 and PUTs positionSeconds 0', async () => {
    const player = createFakePlayer(200)
    const { result } = await mountHook(player)

    act(() => {
      result.current.startOver()
    })

    expect(player.currentTime).toHaveBeenCalledWith(0)
    expect(api.put).toHaveBeenCalledWith('/watch-progress/vid-1', { positionSeconds: 0 })
  })
})
