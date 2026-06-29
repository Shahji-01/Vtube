import { useCallback, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import api from '../../api/axios'
import styles from './WatchLaterButton.module.css'

// ── Clock icon (Watch Later) — inline svg, consistent with sibling ui components. ──
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <polyline
      points="12 7 12 12 16 14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * WatchLaterButton — toggles a single video's Watch Later membership.
 *
 * Renders a real, pointer- and keyboard-operable `<button>` whose `aria-pressed`
 * reflects the saved state and whose accessible name describes the action
 * (`Save to Watch Later` / `Remove from Watch Later`).
 *
 * Behaviour:
 *  - Authenticated viewer: activating toggles add/remove with an optimistic UI
 *    update; the request is reverted and an error toast is shown on failure.
 *    `onChange(saved)` fires whenever membership changes (R4.9).
 *  - Anonymous viewer (`!user`): activating shows a sign-in toast and sends NO
 *    request (R4.10).
 *
 * State is seeded from `initialSaved` so callers (e.g. Library) can render the
 * control already reflecting known membership.
 *
 * @param {object} props
 * @param {string} props.videoId               The video whose membership is toggled.
 * @param {boolean} [props.initialSaved=false]  Initial membership seed.
 * @param {(saved: boolean) => void} [props.onChange]  Called when membership changes.
 *
 * Validates: Requirements 4.9, 4.10
 */
export default function WatchLaterButton({ videoId, initialSaved = false, onChange }) {
  const { user } = useAuth()
  const toast = useToast()
  const [saved, setSaved] = useState(Boolean(initialSaved))
  const [loading, setLoading] = useState(false)

  const handleToggle = useCallback(async () => {
    // ── Anonymous viewer: prompt sign-in, send no request (R4.10) ──
    if (!user) {
      toast({ message: 'Sign in to save videos', type: 'error' })
      return
    }

    if (loading) return

    // Capture the exact prior membership for a faithful revert on error.
    const prev = saved
    const next = !prev

    // ── Optimistic update: flip membership before the request resolves ──
    setSaved(next)
    setLoading(true)
    onChange?.(next)

    try {
      if (next) {
        await api.post(`/watch-later/${videoId}`)
      } else {
        await api.delete(`/watch-later/${videoId}`)
      }
    } catch {
      // ── Revert to the exact prior membership and surface the failure ──
      setSaved(prev)
      onChange?.(prev)
      toast({ message: 'Could not update Watch Later. Please try again.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [user, loading, saved, videoId, onChange, toast])

  const accessibleName = saved ? 'Remove from Watch Later' : 'Save to Watch Later'

  const classes = [styles.button, saved ? styles.active : ''].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={classes}
      aria-label={accessibleName}
      title={accessibleName}
      aria-pressed={saved}
      disabled={loading}
      onClick={handleToggle}
    >
      <span className={styles.icon} aria-hidden="true">
        <ClockIcon />
      </span>
    </button>
  )
}
