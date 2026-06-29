import { useEffect, useState } from 'react'
import Spinner from './ui/Spinner'
import styles from './RouteFallback.module.css'

/** Default load-timeout window for a lazy route chunk (Req 8.6). */
const LOAD_TIMEOUT_MS = 30000

/**
 * RouteFallback — the Suspense fallback shown while a lazy route chunk loads.
 *
 * Renders the shared `Spinner` primitive centered in a simple container so the
 * fallback is always visible and non-empty (Req 8.2). Styling is token-driven
 * via the sibling CSS Module (no inline presentational styles, no raw hex).
 *
 * It also provides the 30s load-timeout affordance (Req 8.6): while suspended
 * it arms a timer, and if the chunk has not finished loading within
 * `timeoutMs`, it throws so the surrounding `ChunkErrorBoundary` can render its
 * error state. Because this fallback unmounts as soon as the chunk resolves,
 * the timer is cleared on success and never produces a false timeout.
 *
 * @param {object} props
 * @param {number} [props.timeoutMs=30000] load-timeout window in milliseconds.
 */
export default function RouteFallback({ timeoutMs = LOAD_TIMEOUT_MS }) {
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (timeoutMs == null || timeoutMs <= 0) return undefined
    const timer = setTimeout(() => setTimedOut(true), timeoutMs)
    return () => clearTimeout(timer)
  }, [timeoutMs])

  if (timedOut) {
    // Surfaced to ChunkErrorBoundary, which renders the error UI (Req 8.6).
    throw new Error('Route chunk failed to load within the timeout window')
  }

  return (
    <div className={styles.root}>
      <Spinner size="lg" label="Loading page" />
    </div>
  )
}
