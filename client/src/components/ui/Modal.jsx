import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import useFocusTrap from '../../hooks/useFocusTrap'
import styles from './Modal.module.css'

/**
 * Modal — accessible, reusable dialog rendered in a portal.
 *
 * Replaces the inline `<style>{...}</style>` dialog embedded in `Watch.jsx`
 * (the "Save to Playlist" modal) with a single accessible primitive.
 *
 * Responsibilities (Requirements 7.1, 7.5, 7.6, 7.8, 7.9, 11.10):
 * - Renders via `createPortal` to `document.body` at the `--z-modal` tier.
 * - Exposes `role="dialog"` + `aria-modal="true"` and an accessible name that
 *   references the rendered title via `aria-labelledby`, or falls back to a
 *   caller-supplied `ariaLabel` when there is no title (Req 7.1).
 * - Closes on outside (scrim) click (Req 7.5) and on Escape (Req 7.6, 11.10).
 * - Traps focus within the dialog and restores focus to the triggering element
 *   on close — both handled by `useFocusTrap` (Req 7.2-7.4, 7.7).
 * - Locks body scroll while open and restores the prior scroll behavior and
 *   scroll position on close (Req 7.8, 7.9).
 *
 * @param {object} props
 * @param {boolean} props.open                       Whether the dialog is shown.
 * @param {() => void} props.onClose                 Invoked on Escape / outside-click / close control.
 * @param {string} [props.title]                     Visible dialog title; provides the accessible name.
 * @param {React.ReactNode} props.children           Dialog body content.
 * @param {React.ReactNode} [props.footer]           Optional footer slot (e.g. action buttons).
 * @param {string} [props.ariaLabel]                 Accessible name used when no `title` is supplied.
 * @param {string} [props.labelledBy]                Id of an external element labelling the dialog
 *                                                   (takes precedence over the internal title id).
 * @param {string} [props.className]                 Extra class names merged onto the dialog surface.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  ariaLabel,
  labelledBy,
  className,
}) {
  const dialogRef = useRef(null)
  const titleId = useId()

  // Escape handling is wired through the focus trap so it lives alongside the
  // Tab-cycle handling and is registered/cleaned up with the same lifecycle.
  useFocusTrap(dialogRef, open, () => {
    if (onClose) onClose()
  })

  // Lock body scroll while open; restore the prior overflow and the scroll
  // position on close (Req 7.8, 7.9).
  useEffect(() => {
    if (!open) return undefined

    const { body, documentElement } = document
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const previousOverflow = body.style.overflow
    const previousScrollBehavior = documentElement.style.scrollBehavior

    // Disable smooth scrolling so the restore below is instant, then lock.
    documentElement.style.scrollBehavior = 'auto'
    body.style.overflow = 'hidden'

    return () => {
      body.style.overflow = previousOverflow
      documentElement.style.scrollBehavior = previousScrollBehavior
      // Restore the exact scroll position the user was at before opening.
      window.scrollTo(scrollX, scrollY)
    }
  }, [open])

  if (!open) return null

  // Determine the accessible name: an external labelledBy id wins, then the
  // internal title element, otherwise the caller-supplied ariaLabel (Req 7.1).
  const resolvedLabelledBy = labelledBy || (title ? titleId : undefined)
  const ariaLabelProps = resolvedLabelledBy
    ? { 'aria-labelledby': resolvedLabelledBy }
    : { 'aria-label': ariaLabel }

  const surfaceClass = [styles.dialog, className].filter(Boolean).join(' ')

  // Clicking the scrim (the element itself, not bubbled children) closes the
  // dialog (Req 7.5).
  const handleScrimMouseDown = (event) => {
    if (event.target === event.currentTarget && onClose) {
      onClose()
    }
  }

  return createPortal(
    <div className={styles.scrim} onMouseDown={handleScrimMouseDown}>
      <div
        ref={dialogRef}
        className={surfaceClass}
        role="dialog"
        aria-modal="true"
        {...ariaLabelProps}
      >
        {title && (
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}
