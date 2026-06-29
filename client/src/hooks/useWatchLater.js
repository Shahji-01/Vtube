import { useCallback, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

// ── useWatchLater: membership state + add/remove calls for a video ──
//
// Manages the Watch Later membership of a single video for the current viewer:
//
//  - `saved` reflects current membership (seeded `false`; the WatchLaterButton
//    control may separately seed from an `initialSaved` prop).
//  - `loading` reflects an in-flight toggle request.
//  - `toggle()` flips membership with an optimistic update, calling
//    `POST /watch-later/:videoId` to add or `DELETE /watch-later/:videoId` to
//    remove (both idempotent server-side — R4.5, R4.7). On failure it reverts
//    to the exact prior membership.
//
// Anonymous viewers (`!user`) never trigger a network call — the
// WatchLaterButton control owns the sign-in prompt (R4.10); this hook simply
// no-ops so no request is fired without a signed-in user.

/**
 * Hook managing Watch Later membership for a single video.
 *
 * @param {string} videoId - The video whose membership is toggled.
 * @returns {{
 *   saved: boolean,
 *   loading: boolean,
 *   toggle: () => Promise<void>,
 * }}
 */
export default function useWatchLater(videoId) {
  const { user } = useAuth()
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(async () => {
    // No requests for anonymous viewers (R4.10) — the control prompts sign-in.
    if (!user) return

    // Capture the exact prior membership for a faithful revert on error.
    const prev = saved
    const next = !prev

    // ── Optimistic update: flip membership before the request resolves ──
    setSaved(next)
    setLoading(true)

    try {
      if (next) {
        await api.post(`/watch-later/${videoId}`)
      } else {
        await api.delete(`/watch-later/${videoId}`)
      }
    } catch (err) {
      // ── Revert on error to the exact prior membership ──
      setSaved(prev)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user, saved, videoId])

  return { saved, loading, toggle }
}
