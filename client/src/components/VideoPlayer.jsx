import { useRef, useEffect, useState, useCallback } from 'react'
import Spinner from './ui/Spinner'

/**
 * VideoPlayer — video.js wrapper with a deferred (on-mount) dynamic import.
 *
 * video.js (and its stylesheet) are no longer imported at the top level; they
 * are loaded via `import('video.js')` / `import('video.js/dist/video-js.css')`
 * inside the mount effect. This lets Vite emit a separate on-demand chunk and
 * keeps the lazy `Watch` route chunk small. While the library loads we render a
 * fixed-aspect loading indicator (synchronously, so it appears with no layout
 * shift); a 30s timeout races the import, and on rejection/timeout we show an
 * error state with a Retry control and initialize no player.
 *
 * The `<video-js>` element is created imperatively and appended into a stable
 * container ref rather than rendered in JSX. This is resilient to React
 * StrictMode's mount → unmount → mount cycle in development: a mounted-flag
 * guard prevents initializing a player after unmount (including when the async
 * import resolves post-unmount), and the cleanup disposes the live player, so
 * exactly one live instance is ever bound to an attached DOM node.
 *
 * The player runs in `fill` mode and fills its container; the parent provides a
 * fixed 16:9 box (see Watch.module.css `.playerWrap`).
 */

const LOAD_TIMEOUT_MS = 30000

export default function VideoPlayer({ options, onReady, poster }) {
  const containerRef = useRef(null)
  const playerRef = useRef(null)

  // Internal load state machine: 'loading' → 'ready' | 'error' → (retry) → 'loading'.
  const [status, setStatus] = useState('loading')
  // Bumping `attempt` re-runs the load effect (used by the Retry control).
  const [attempt, setAttempt] = useState(0)

  // Keep the latest props in refs so the load/init effect can read current
  // values without re-running (and re-initializing the player) on prop changes.
  const optionsRef = useRef(options)
  const posterRef = useRef(poster)
  const onReadyRef = useRef(onReady)
  optionsRef.current = options
  posterRef.current = poster
  onReadyRef.current = onReady

  // Load the player library (dynamic import) and run the imperative init.
  useEffect(() => {
    // Mounted-flag guard: ensures we never initialize a player after unmount,
    // even if the async import resolves after the effect has been cleaned up.
    let mounted = true
    let timeoutId

    setStatus('loading')

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Player load timed out')),
        LOAD_TIMEOUT_MS
      )
    })

    const loadPromise = Promise.all([
      import('video.js'),
      import('video.js/dist/video-js.css'),
    ]).then(([mod]) => mod.default ?? mod)

    Promise.race([loadPromise, timeoutPromise])
      .then((videojs) => {
        clearTimeout(timeoutId)
        // Bail out if the component unmounted while the import was in flight,
        // or if a player is already bound (defensive against double-resolve).
        if (!mounted || playerRef.current || !containerRef.current) return

        const videoElement = document.createElement('video-js')
        videoElement.classList.add('vjs-big-play-centered')
        containerRef.current.appendChild(videoElement)

        const player = (playerRef.current = videojs(
          videoElement,
          {
            ...optionsRef.current,
            poster: posterRef.current,
            fill: true,
            playbackRates: [0.5, 1, 1.25, 1.5, 2],
          },
          () => {
            if (onReadyRef.current) onReadyRef.current(player)
          }
        ))

        setStatus('ready')
      })
      .catch(() => {
        clearTimeout(timeoutId)
        if (!mounted) return
        // Reject or timeout: surface the error state, initialize no player.
        setStatus('error')
      })

    // Dispose the player on unmount (also runs during StrictMode's first
    // cleanup and on retry). Flips the mounted flag so a late-resolving import
    // cannot initialize a player against a torn-down node.
    return () => {
      mounted = false
      clearTimeout(timeoutId)
      const player = playerRef.current
      if (player && !player.isDisposed()) {
        player.dispose()
        playerRef.current = null
      }
    }
  }, [attempt])

  // Update the live player when props change (without re-importing/re-init).
  useEffect(() => {
    const player = playerRef.current
    if (!player || player.isDisposed()) return
    if (options?.autoplay !== undefined) player.autoplay(options.autoplay)
    if (options?.sources) player.src(options.sources)
    if (poster) player.poster(poster)
  }, [options, poster, status])

  const handleRetry = useCallback(() => {
    setAttempt((a) => a + 1)
  }, [])

  return (
    <div
      data-vjs-player
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {/* Stable container the <video-js> element is appended into. Always
          present so the imperative init has an attached node to mount on, and
          so the box keeps its dimensions across every load state (no shift). */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {status === 'loading' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
          }}
        >
          <Spinner size="lg" label="Loading player" />
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            background: '#000',
            color: '#fff',
            textAlign: 'center',
            padding: '1rem',
          }}
        >
          <span>The video player failed to load.</span>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
