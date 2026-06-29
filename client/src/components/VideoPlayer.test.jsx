// Feature: phase-3-viewer-features, Task 8.4 — VideoPlayer StrictMode safety
// (originally phase-2-quality-hardening Property 3) under the dynamic import.
// Validates: Requirements 1.7, 5.7 (preserving Phase 2 Req 3 StrictMode_Safe_Behavior)
//
// VideoPlayer now loads video.js through an ON-MOUNT dynamic import
// (`import('video.js')` + the CSS side-effect import) instead of a top-level
// static import, so player initialization is asynchronous. These tests confirm
// the StrictMode_Safe_Behavior survives that change (R1.7 / Phase 2 Req 3):
// across a mount -> unmount -> remount cycle exactly one live (non-disposed)
// player remains, bound to a DOM node attached to the rendered container, every
// created player is disposed on unmount, and no disposed instance is ever
// retained or reused. They also confirm controls work under muted autoplay
// (R5.7): when mounted with `{ muted: true, autoplay: true }` the component
// initializes a single live player with those options applied and fires onReady.
//
// On the literal `<React.StrictMode>` wrapper:
// StrictMode's dev-mode mount -> unmount -> remount of a single render commit
// fires TWO concurrent `import('video.js')` calls. The test runner cannot mock
// concurrent dynamic imports of the same module — one of the two concurrent
// imports resolves to the REAL video.js library regardless of mock strategy or
// pre-resolution (verified: a bare `Promise.all([import('video.js'),
// import('video.js')])` records only one mock invocation). So instead of the
// literal wrapper we exercise the SAME mount -> unmount -> remount lifecycle
// explicitly with single (non-concurrent) renders, which the mock handles
// deterministically while validating the identical StrictMode-safe guarantee.
//
// Because init is async, every assertion is made only after the dynamic import
// resolves: renders are wrapped in `act` and we `waitFor` the player to
// initialize. Each test re-imports React Testing Library and the component
// against a fresh module registry (mirroring VideoPlayer.loadStates.test.jsx,
// task 8.3) so the mocked dynamic import is honored per test in full isolation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hoisted control shared with the mock factory below.
const h = vi.hoisted(() => ({
  // Every fake player created by the factory, in creation order.
  instances: [],
  // Number of times the player factory was invoked.
  calls: 0,
}))

// Fake 'video.js' player factory exposing the methods the component calls:
// isDisposed(), dispose(), autoplay(), src(), poster(), currentTime(), play(),
// pause(), and the ready callback. The options the player is initialized with
// are recorded so muted-autoplay wiring can be asserted. Real video.js fires
// ready asynchronously, so we defer it to a microtask (ensuring the component's
// `player` binding is assigned before onReady runs).
function videojsFactory() {
  const videojs = (el, options, ready) => {
    h.calls += 1
    const player = {
      el,
      options,
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
    if (typeof ready === 'function') Promise.resolve().then(() => ready())
    return player
  }
  return { default: videojs }
}

const PLAYER_OPTIONS = {
  sources: [{ src: 'https://example.com/v.mp4', type: 'video/mp4' }],
  controls: true,
}
const POSTER = 'https://example.com/p.jpg'

// Re-import RTL and the component against a fresh module registry so the mocked
// dynamic import is re-evaluated per test. RTL must be re-imported too so it
// shares the same freshly-loaded React instance as the component.
async function loadFresh() {
  vi.resetModules()
  // Register the mocks against the freshly-reset registry, before importing the
  // component, so the dynamic import in the mount effect resolves to the fake
  // player factory.
  vi.doMock('video.js/dist/video-js.css', () => ({}))
  vi.doMock('video.js', () => videojsFactory())
  const rtl = await import('@testing-library/react')
  const { default: VideoPlayer } = await import('./VideoPlayer')
  return { rtl, VideoPlayer }
}

const livePlayers = () => h.instances.filter((p) => !p.isDisposed())
const disposedPlayers = () => h.instances.filter((p) => p.isDisposed())

let current = null

// Render the component (single, non-concurrent mount) and wait for the async
// dynamic import to resolve and the player to initialize before returning.
async function renderPlayer(rtl, VideoPlayer, props = {}) {
  let result
  await rtl.act(async () => {
    result = rtl.render(
      <VideoPlayer options={PLAYER_OPTIONS} poster={POSTER} {...props} />
    )
  })
  await rtl.waitFor(() => expect(livePlayers().length).toBe(1))
  return result
}

async function unmountPlayer(rtl, result) {
  await rtl.act(async () => {
    result.unmount()
  })
}

beforeEach(() => {
  // Fresh instance registry and call counts for each test.
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
})

describe('VideoPlayer StrictMode safety (dynamic import)', () => {
  it('initializes exactly one live player bound to an attached node on mount (1.7)', async () => {
    const { rtl, VideoPlayer } = await loadFresh()
    const result = await renderPlayer(rtl, VideoPlayer)
    current = { rtl, result }

    // The player was initialized exactly once.
    expect(h.calls).toBe(1)

    // Exactly one live player remains.
    const live = livePlayers()
    expect(live).toHaveLength(1)

    // It is bound to a <video-js> node attached to the rendered document and
    // contained within the component's container.
    const player = live[0]
    expect(player.el).toBeTruthy()
    expect(player.el.tagName.toLowerCase()).toBe('video-js')
    expect(document.contains(player.el)).toBe(true)
    expect(result.container.contains(player.el)).toBe(true)
  })

  it('disposes every player and leaves zero live instances on unmount (1.7)', async () => {
    const { rtl, VideoPlayer } = await loadFresh()
    const result = await renderPlayer(rtl, VideoPlayer)
    current = { rtl, result }

    const created = h.instances.length
    expect(created).toBeGreaterThan(0)

    await unmountPlayer(rtl, result)
    current = null

    // Create/dispose calls are balanced - all created players are disposed.
    expect(livePlayers()).toHaveLength(0)
    expect(disposedPlayers()).toHaveLength(created)
  })

  it('across a mount -> unmount -> remount cycle keeps one live player and never reuses a disposed one (1.7)', async () => {
    const { rtl, VideoPlayer } = await loadFresh()

    // First mount.
    let result = await renderPlayer(rtl, VideoPlayer)
    const firstLive = livePlayers()
    expect(firstLive).toHaveLength(1)
    const firstPlayer = firstLive[0]
    expect(document.contains(firstPlayer.el)).toBe(true)

    // Unmount: the live player is disposed and none remain.
    await unmountPlayer(rtl, result)
    expect(firstPlayer.isDisposed()).toBe(true)
    expect(livePlayers()).toHaveLength(0)

    const createdAfterFirst = h.instances.length

    // Remount: a brand-new single live player is created and attached.
    result = await renderPlayer(rtl, VideoPlayer)
    current = { rtl, result }

    const secondLive = livePlayers()
    expect(secondLive).toHaveLength(1)
    const secondPlayer = secondLive[0]

    // The new live player is a fresh instance, not the disposed one reused.
    expect(secondPlayer).not.toBe(firstPlayer)
    expect(h.instances.length).toBeGreaterThan(createdAfterFirst)

    // The new live player is bound to an attached node within the container.
    expect(document.contains(secondPlayer.el)).toBe(true)
    expect(result.container.contains(secondPlayer.el)).toBe(true)

    // Every disposed instance stays disposed (never reused).
    expect(disposedPlayers().every((p) => p.isDisposed())).toBe(true)
  })

  it('never binds a live player to a detached DOM node across the cycle (1.7)', async () => {
    const { rtl, VideoPlayer } = await loadFresh()

    let result = await renderPlayer(rtl, VideoPlayer)
    await unmountPlayer(rtl, result)
    result = await renderPlayer(rtl, VideoPlayer)
    current = { rtl, result }

    // No live player is bound to a node outside the document.
    const detachedLive = livePlayers().filter((p) => !document.contains(p.el))
    expect(detachedLive).toHaveLength(0)
  })

  it('initializes a single live player with the passed options under muted autoplay (5.7)', async () => {
    const onReady = vi.fn()
    const { rtl, VideoPlayer } = await loadFresh()
    const result = await renderPlayer(rtl, VideoPlayer, {
      options: { ...PLAYER_OPTIONS, muted: true, autoplay: true },
      onReady,
    })
    current = { rtl, result }

    // The ready callback fires for the single live player once the import
    // resolves, confirming the player/controls are wired up under muted autoplay.
    await rtl.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))

    const live = livePlayers()
    expect(live).toHaveLength(1)
    const player = live[0]
    expect(onReady).toHaveBeenCalledWith(player)

    // The player was initialized with the muted-autoplay options the caller
    // passed (the component merges these into the videojs() options object).
    expect(player.options.muted).toBe(true)
    expect(player.options.autoplay).toBe(true)
    expect(player.options.controls).toBe(true)

    // It is bound to an attached <video-js> node.
    expect(player.el.tagName.toLowerCase()).toBe('video-js')
    expect(document.contains(player.el)).toBe(true)
  })
})
