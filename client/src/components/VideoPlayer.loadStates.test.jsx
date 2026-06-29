// Feature: phase-3-viewer-features, Task 8.3 — VideoPlayer load states
// Validates: Requirements 1.5, 1.6, 1.8, 1.9
//
// VideoPlayer loads the player library through a dynamic import on mount and
// races it against a 30s timeout. These tests exercise the load state machine
// ('loading' -> 'ready' | 'error' -> retry -> 'loading') without pulling in the
// real, heavy video.js library:
//
//   1.5 While the chunk loads, a loading indication is shown immediately with no
//       layout shift (the fixed-size container box is present from first paint).
//   1.6 On a successful load, a single live player is initialized, bound to an
//       attached DOM node, and the onReady callback fires.
//   1.8 On load failure (rejection) or a 30s timeout, an error indication with a
//       Retry control is shown and no player is initialized.
//   1.9 Activating Retry re-attempts the dynamic import (resolves the next time
//       -> the player initializes).
//
// The 'video.js' module is mocked: an optional gate keeps the dynamic import
// pending (to observe the loading state and the timeout), and the player factory
// can be told to throw once (to simulate a failed load that a retry recovers
// from). Each test re-imports the component (and React Testing Library) against a
// fresh module registry so the gate is re-evaluated per test in full isolation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hoisted control shared with the mock factory below.
const h = vi.hoisted(() => ({
  // When set to a promise, the dynamic import stays pending until it settles.
  gate: null,
  // When true, the next videojs() call throws once (then resets), simulating a
  // failed player/library load that is routed to the component's error state.
  failNext: false,
  // Every fake player created by the factory, in creation order.
  instances: [],
  // Number of times the player factory was invoked.
  calls: 0,
}))

// The CSS side-effect import is irrelevant under jsdom.
vi.mock('video.js/dist/video-js.css', () => ({}))

// Mock 'video.js' with a fake player factory exposing the methods the component
// calls: isDisposed(), dispose(), autoplay(), src(), poster(), and the ready cb.
vi.mock('video.js', async () => {
  // Optionally keep the dynamic import pending (loading-state / timeout tests).
  if (h.gate) await h.gate

  const videojs = (el, _options, ready) => {
    h.calls += 1
    if (h.failNext) {
      h.failNext = false
      throw new Error('player failed to load')
    }
    const player = {
      el,
      _disposed: false,
      dispose() {
        this._disposed = true
      },
      isDisposed() {
        return this._disposed
      },
      autoplay: () => {},
      src: () => {},
      poster: () => {},
      currentTime: () => {},
      play: () => {},
      pause: () => {},
    }
    h.instances.push(player)
    // Real video.js fires ready asynchronously; defer to a microtask so the
    // component's `player` binding is assigned before onReady runs.
    if (typeof ready === 'function') Promise.resolve().then(() => ready())
    return player
  }
  return { default: videojs }
})

const PLAYER_OPTIONS = {
  sources: [{ src: 'https://example.com/v.mp4', type: 'video/mp4' }],
  controls: true,
}
const POSTER = 'https://example.com/p.jpg'

// Re-import RTL and the component against a fresh module registry so the mock
// factory (and its gate) is re-evaluated per test. RTL must be re-imported too
// so it shares the same freshly-loaded React instance as the component.
async function loadFresh() {
  vi.resetModules()
  const rtl = await import('@testing-library/react')
  const { default: VideoPlayer } = await import('./VideoPlayer')
  return { rtl, VideoPlayer }
}

const livePlayers = () => h.instances.filter((p) => !p.isDisposed())

let current = null

async function mount(props = {}) {
  const { rtl, VideoPlayer } = await loadFresh()
  let result
  await rtl.act(async () => {
    result = rtl.render(<VideoPlayer options={PLAYER_OPTIONS} {...props} />)
  })
  current = { rtl, result }
  return current
}

beforeEach(() => {
  h.gate = null
  h.failNext = false
  h.instances.length = 0
  h.calls = 0
})

afterEach(() => {
  try {
    current?.result.unmount()
  } catch {
    // ignore teardown errors
  }
  current = null
  vi.useRealTimers()
})

describe('VideoPlayer load states', () => {
  it('shows the error + Retry state after the 30s load timeout with no player (1.8)', async () => {
    const onReady = vi.fn()

    // Keep the dynamic import pending so the 30s timeout wins the race. This
    // runs first so the gated factory is evaluated fresh (no resolved module is
    // cached yet) and the pending gate is honored under fake timers.
    h.gate = new Promise(() => {})
    const { rtl, VideoPlayer } = await loadFresh()

    vi.useFakeTimers()

    let result
    await rtl.act(async () => {
      result = rtl.render(<VideoPlayer options={PLAYER_OPTIONS} onReady={onReady} />)
    })
    current = { rtl, result }

    // Still loading before the timeout fires.
    expect(result.getByRole('status')).toBeInTheDocument()
    expect(result.queryByRole('alert')).not.toBeInTheDocument()

    // Advance past the 30s load timeout.
    await rtl.act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })

    // Error indication with Retry appears; no player was ever initialized.
    expect(result.getByRole('alert')).toBeInTheDocument()
    expect(result.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(result.queryByRole('status')).not.toBeInTheDocument()
    expect(h.calls).toBe(0)
    expect(livePlayers()).toHaveLength(0)
    expect(onReady).not.toHaveBeenCalled()
  })

  it('shows the loading indicator immediately on mount with no layout shift (1.5)', async () => {
    // Keep the import pending so the component stays in the loading state.
    h.gate = new Promise(() => {})

    const { result } = await mount()

    // The fixed-size player box is present from first paint (no layout shift):
    // the stable [data-vjs-player] wrapper and its full-size container exist.
    const wrapper = result.container.querySelector('[data-vjs-player]')
    expect(wrapper).toBeInTheDocument()
    expect(wrapper).toHaveStyle({ width: '100%', height: '100%' })

    // The loading indication is rendered over that box.
    const status = result.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(result.getByText('Loading player')).toBeInTheDocument()

    // No error state and no player initialized while loading.
    expect(result.queryByRole('alert')).not.toBeInTheDocument()
    expect(h.calls).toBe(0)
    expect(h.instances).toHaveLength(0)
  })

  it('initializes a single live player bound to an attached node and fires onReady on resolve (1.6)', async () => {
    const onReady = vi.fn()

    const { rtl, result } = await mount({ onReady })

    await rtl.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))

    // Exactly one live player was created.
    expect(h.calls).toBe(1)
    const live = livePlayers()
    expect(live).toHaveLength(1)

    const player = live[0]
    // onReady receives that player instance.
    expect(onReady).toHaveBeenCalledWith(player)

    // The player is bound to a <video-js> node attached to the document and
    // contained within the component's stable container box.
    expect(player.el).toBeTruthy()
    expect(player.el.tagName.toLowerCase()).toBe('video-js')
    expect(document.contains(player.el)).toBe(true)
    const wrapper = result.container.querySelector('[data-vjs-player]')
    expect(wrapper.contains(player.el)).toBe(true)

    // Loading indication is gone and no error state is shown.
    expect(result.queryByRole('status')).not.toBeInTheDocument()
    expect(result.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the error + Retry state with no player on a failed load, and Retry recovers (1.8, 1.9)', async () => {
    const onReady = vi.fn()
    // First load attempt fails.
    h.failNext = true

    const { rtl, result } = await mount({ onReady })

    // Error indication with a Retry control appears; no player was initialized.
    const alert = await rtl.waitFor(() => result.getByRole('alert'))
    expect(alert).toBeInTheDocument()
    const retry = result.getByRole('button', { name: /retry/i })
    expect(retry).toBeInTheDocument()
    expect(livePlayers()).toHaveLength(0)
    expect(onReady).not.toHaveBeenCalled()
    expect(result.queryByRole('status')).not.toBeInTheDocument()

    // Activating Retry re-attempts the import; this time the load succeeds.
    rtl.fireEvent.click(retry)

    await rtl.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))

    // A single live player is now bound to an attached node and the error
    // state has been cleared.
    const live = livePlayers()
    expect(live).toHaveLength(1)
    expect(document.contains(live[0].el)).toBe(true)
    expect(result.queryByRole('alert')).not.toBeInTheDocument()
  })
})
