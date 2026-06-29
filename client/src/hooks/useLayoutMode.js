import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * The viewport width (px) at or above which the sidebar docks and pushes content.
 * Matches the `--bp-lg` design token.
 */
export const DOCKED_QUERY = '(min-width: 1280px)'

/**
 * Derives the responsive layout mode from the viewport width and manages the
 * sidebar open state.
 *
 * Behavior (see design.md `useLayoutMode()` spec):
 * - `mode === 'docked'` iff the viewport width is >= 1280px, else `'overlay'`,
 *   derived from `matchMedia('(min-width: 1280px)')`.
 * - On an `overlay` -> `docked` transition, `sidebarOpen` is forced `true`
 *   (docked default visible).
 * - On a `docked` -> `overlay` transition, `sidebarOpen` is forced `false`
 *   (drawer starts closed).
 * - `toggleSidebar` flips `sidebarOpen`; `closeSidebar` sets it `false`.
 * - The media-query listener is added once on mount and removed on unmount.
 *
 * @returns {{
 *   mode: 'docked' | 'overlay',
 *   sidebarOpen: boolean,
 *   toggleSidebar: () => void,
 *   closeSidebar: () => void,
 * }}
 */
export default function useLayoutMode() {
  // Resolve the initial match synchronously so the first render reflects the
  // real viewport (guards against non-browser/SSR environments).
  const getInitialDocked = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(DOCKED_QUERY).matches
      : true

  const [mode, setMode] = useState(() =>
    getInitialDocked() ? 'docked' : 'overlay'
  )
  // Docked default visible; overlay drawer starts closed.
  const [sidebarOpen, setSidebarOpen] = useState(getInitialDocked)

  // Track the previous mode so transitions can force the sidebar state without
  // re-running the effect (the listener is registered exactly once).
  const prevModeRef = useRef(mode)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const mql = window.matchMedia(DOCKED_QUERY)

    const applyMatch = matches => {
      const nextMode = matches ? 'docked' : 'overlay'
      const prevMode = prevModeRef.current
      if (nextMode === prevMode) return

      setMode(nextMode)
      if (prevMode === 'overlay' && nextMode === 'docked') {
        setSidebarOpen(true)
      } else if (prevMode === 'docked' && nextMode === 'overlay') {
        setSidebarOpen(false)
      }
      prevModeRef.current = nextMode
    }

    const handleChange = event => applyMatch(event.matches)

    // Sync in case the viewport changed between initial render and mount.
    applyMatch(mql.matches)

    // Prefer the modern EventTarget API; fall back to the deprecated
    // addListener/removeListener for older Safari.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleChange)
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(handleChange)
    }

    return () => {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', handleChange)
      } else if (typeof mql.removeListener === 'function') {
        mql.removeListener(handleChange)
      }
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  return { mode, sidebarOpen, toggleSidebar, closeSidebar }
}
