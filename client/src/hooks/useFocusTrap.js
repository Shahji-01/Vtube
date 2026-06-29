import { useEffect, useRef } from 'react'

/**
 * Selector matching natively focusable / tabbable elements. We intentionally
 * exclude elements with a negative tabindex and disabled form controls. We do
 * NOT filter on computed visibility (offsetWidth/getClientRects) so the hook
 * behaves consistently in layout-less environments such as jsdom.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Returns the ordered list of focusable descendants of `container`.
 * @param {HTMLElement | null} container
 * @returns {HTMLElement[]}
 */
function getFocusable(container) {
  if (!container) return []
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-hidden') !== 'true'
  )
}

/**
 * Traps Tab focus within `ref` while `active`; restores focus to the element
 * that was focused before activation when it deactivates; invokes `onEscape`
 * once per Escape key press.
 *
 * Postconditions (Requirements 7.2, 7.3, 7.4, 7.7, 7.10):
 * - While active, Tab/Shift+Tab cycle only through focusable descendants of
 *   `ref` with wraparound (last -> first on Tab, first -> last on Shift+Tab).
 * - On activation, focus moves to the first focusable descendant, or to the
 *   container element itself when there are none.
 * - Escape invokes `onEscape` exactly once per press.
 * - On deactivate/unmount, focus returns to the element captured at activation
 *   time when it is still in the document, and the key listener is removed.
 *
 * @param {React.RefObject<HTMLElement>} ref Container holding the trapped focus.
 * @param {boolean} active Whether the trap is currently engaged.
 * @param {(event: KeyboardEvent) => void} [onEscape] Escape-press handler.
 */
export default function useFocusTrap(ref, active, onEscape) {
  const previouslyFocused = useRef(null)
  const onEscapeRef = useRef(onEscape)

  // Keep the latest onEscape reference without re-running the activation effect.
  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!active) return undefined

    const container = ref.current
    if (!container) return undefined

    // Capture the element focused immediately before activation so we can
    // restore it on deactivate (Requirement 7.7).
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Move focus to the first focusable descendant, or the container itself
    // when none exist (Requirements 7.3, 7.4).
    const focusable = getFocusable(container)
    if (focusable.length > 0) {
      focusable[0].focus()
    } else {
      if (!container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1')
      }
      container.focus()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        // Invoke onEscape once per Escape press (Requirement 7 escape handling).
        if (onEscapeRef.current) onEscapeRef.current(event)
        return
      }

      if (event.key !== 'Tab') return

      const items = getFocusable(container)
      if (items.length === 0) {
        // Nothing to cycle through; keep focus pinned to the container.
        event.preventDefault()
        container.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement

      if (event.shiftKey) {
        // Shift+Tab from the first element wraps to the last (Requirement 7.2).
        if (current === first || !container.contains(current)) {
          event.preventDefault()
          last.focus()
        }
      } else {
        // Tab from the last element wraps to the first (Requirement 7.2).
        if (current === last || !container.contains(current)) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    // Listeners added on activate are removed on deactivate/unmount, and focus
    // is restored to the previously focused element if it is still in the
    // document (Requirements 7.7, 7.10).
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      const previous = previouslyFocused.current
      if (
        previous &&
        typeof previous.focus === 'function' &&
        document.contains(previous)
      ) {
        previous.focus()
      }
    }
  }, [active, ref])
}
