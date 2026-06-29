import { useCallback, useEffect, useRef, useState } from 'react'
import api, { getToken } from '../api/axios'

// ── Resume tuning constants (R3.9–R3.12) ──
export const RESUME_MINIMUM = 10 // lower bound (seconds) below which we never resume
export const RESUME_END_MARGIN = 15 // trailing window (seconds before duration) we never resume into
export const RESUME_TOLERANCE = 2 // ± window (seconds) the resumed position must land within
export const SAVE_INTERVAL_MS = 5000 // at most one throttled save per this interval during play

/**
 * computeResumeTarget(p, d) — pure resume-decision function.
 *
 * Returns the stored position `p` when it falls inside the resumable band
 * (`RESUME_MINIMUM <= p < d - RESUME_END_MARGIN`); otherwise returns `0`.
 * Guards against non-finite `p`/`d` by returning `0`.
 *
 * @param {number} p stored positionSeconds
 * @param {number} d video duration in seconds
 * @returns {number} resume target in seconds
 */
export function computeResumeTarget(p, d) {
  if (!Number.isFinite(p) || !Number.isFinite(d)) return 0
  if (p >= RESUME_MINIMUM && p < d - RESUME_END_MARGIN) return p
  return 0
}

/**
 * Build the absolute watch-progress URL for a video, derived from the axios
 * client's baseURL so beacon/keepalive writes hit the same backend path the
 * normal requests use.
 */
function buildProgressUrl(videoId) {
  const base = api.defaults.baseURL || '/api/v1'
  const path = `${base}/watch-progress/${videoId}`
  // baseURL is relative ('/api/v1'); resolve against the current origin so
  // sendBeacon/fetch get an absolute URL.
  if (/^https?:\/\//i.test(path)) return path
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}${path}`
  }
  return path
}

/**
 * Best-effort flush of the final position during unload, using sendBeacon when
 * available and falling back to a keepalive fetch. Failures are ignored — this
 * runs while the page is going away.
 */
function flushOnUnload(videoId, positionSeconds) {
  if (!Number.isFinite(positionSeconds)) return
  const url = buildProgressUrl(videoId)
  const payload = JSON.stringify({ positionSeconds })

  // sendBeacon cannot set an Authorization header; it relies on the
  // credentialed cookie session. Use it when there is no bearer token, or as
  // the primary best-effort path, then fall back to keepalive fetch.
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon(url, blob)) return
    }
  } catch {
    // fall through to fetch
  }

  try {
    const token = getToken()
    fetch(url, {
      method: 'PUT',
      keepalive: true,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: payload,
    }).catch(() => {})
  } catch {
    // best-effort — ignore
  }
}

/**
 * useWatchProgress — resume + throttled-save playback progress hook.
 *
 * @param {object} args
 * @param {string} args.videoId   target video id
 * @param {number} args.duration  video duration in seconds
 * @param {object|null} args.player video.js player instance (may be null until ready)
 * @param {boolean} args.enabled  true when the viewer is authenticated
 * @returns {{ resumeTo: number, startOver: () => void }}
 */
export default function useWatchProgress({ videoId, duration, player, enabled }) {
  const [resumeTo, setResumeTo] = useState(0)

  // Mutable refs so event handlers always read fresh values without
  // re-registering listeners on every render.
  const lastSaveAtRef = useRef(0)
  const lastPositionRef = useRef(0)
  const enabledRef = useRef(enabled)
  const videoIdRef = useRef(videoId)

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])
  useEffect(() => {
    videoIdRef.current = videoId
  }, [videoId])

  // Read the player's current time defensively (player may be disposed).
  const readCurrentTime = useCallback(() => {
    if (!player || typeof player.currentTime !== 'function') return null
    try {
      const t = player.currentTime()
      return Number.isFinite(t) ? t : null
    } catch {
      return null
    }
  }, [player])

  // Persist a position via the normal axios client.
  const savePosition = useCallback((positionSeconds) => {
    if (!enabledRef.current) return
    if (!Number.isFinite(positionSeconds)) return
    const id = videoIdRef.current
    if (!id) return
    api
      .put(`/watch-progress/${id}`, { positionSeconds })
      .catch(() => {
        // Non-fatal; progress saves are best-effort.
      })
  }, [])

  // ── Fetch stored progress + compute resume target (authenticated only) ──
  useEffect(() => {
    if (!enabled || !videoId) {
      setResumeTo(0)
      return
    }

    let cancelled = false
    setResumeTo(0)

    api
      .get(`/watch-progress/${videoId}`)
      .then((res) => {
        if (cancelled) return
        const stored = res?.data?.data ?? {}
        const target = computeResumeTarget(stored.positionSeconds, duration)
        setResumeTo(target)
      })
      .catch(() => {
        if (!cancelled) setResumeTo(0)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, videoId, duration])

  // ── Player event listeners: throttled save (timeupdate) + pause flush ──
  useEffect(() => {
    if (!enabled || !player || typeof player.on !== 'function') return

    lastSaveAtRef.current = 0

    const handleTimeUpdate = () => {
      const t = readCurrentTime()
      if (t == null) return
      lastPositionRef.current = t
      const now = Date.now()
      if (now - lastSaveAtRef.current < SAVE_INTERVAL_MS) return
      lastSaveAtRef.current = now
      savePosition(t)
    }

    const handlePause = () => {
      const t = readCurrentTime()
      if (t == null) return
      lastPositionRef.current = t
      lastSaveAtRef.current = Date.now()
      savePosition(t)
    }

    player.on('timeupdate', handleTimeUpdate)
    player.on('pause', handlePause)

    return () => {
      // Player may already be disposed during teardown.
      if (typeof player.off === 'function') {
        try {
          player.off('timeupdate', handleTimeUpdate)
          player.off('pause', handlePause)
        } catch {
          // ignore — player disposed
        }
      }
    }
  }, [enabled, player, readCurrentTime, savePosition])

  // ── Window unload listeners: best-effort final flush ──
  useEffect(() => {
    if (!enabled || !videoId || typeof window === 'undefined') return

    const flush = () => {
      const t = readCurrentTime()
      const position = t != null ? t : lastPositionRef.current
      flushOnUnload(videoId, position)
    }

    const handlePageHide = () => flush()
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled, videoId, readCurrentTime])

  // ── Start Over: seek to 0 and persist position 0 ──
  const startOver = useCallback(() => {
    if (player && typeof player.currentTime === 'function') {
      try {
        player.currentTime(0)
      } catch {
        // ignore — player not ready/disposed
      }
    }
    lastPositionRef.current = 0
    lastSaveAtRef.current = Date.now()
    savePosition(0)
  }, [player, savePosition])

  return { resumeTo, startOver }
}
