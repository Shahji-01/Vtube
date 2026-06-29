import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

/**
 * AnnouncerContext — app-wide assertive `aria-live` region.
 *
 * Provides a single, always-mounted, visually-hidden live region with
 * `role="alert"` / `aria-live="assertive"` / `aria-atomic="true"` so that
 * submit and network errors are announced to assistive technology within
 * 1 second of occurring (Requirement 11.11).
 *
 * Usage:
 *   const { announce } = useAnnouncer()
 *   announce('Failed to post comment. Please try again.')
 *
 * The region text is cleared and re-set on a short timer so that announcing
 * the SAME message twice in a row still triggers a fresh announcement (screen
 * readers ignore writes that do not change the node's text). The re-set delay
 * is well under the 1-second budget.
 */

const AnnouncerContext = createContext(null)

// Delay before (re)writing the message. Short enough to stay well within the
// 1-second announcement budget, long enough for AT to register a text change.
const REANNOUNCE_DELAY_MS = 60

export function AnnouncerProvider({ children }) {
  const [message, setMessage] = useState('')
  const timerRef = useRef(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /**
   * Push a message into the assertive live region.
   * @param {string} text Message to announce. Falsy values clear the region.
   */
  const announce = useCallback((text) => {
    clearTimer()
    const next = text == null ? '' : String(text)
    // Clear first so an identical consecutive message is still a text change.
    setMessage('')
    if (next === '') return
    timerRef.current = setTimeout(() => {
      setMessage(next)
      timerRef.current = null
    }, REANNOUNCE_DELAY_MS)
  }, [clearTimer])

  /** Clear any currently announced message. */
  const clear = useCallback(() => {
    clearTimer()
    setMessage('')
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  return (
    <AnnouncerContext.Provider value={{ announce, clear }}>
      {children}
      <div
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        {message}
      </div>
    </AnnouncerContext.Provider>
  )
}

/**
 * Access the app-wide announcer.
 * @returns {{ announce: (text: string) => void, clear: () => void }}
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useAnnouncer = () => {
  const ctx = useContext(AnnouncerContext)
  if (!ctx) throw new Error('useAnnouncer must be used inside an AnnouncerProvider')
  return ctx
}

export default AnnouncerContext
