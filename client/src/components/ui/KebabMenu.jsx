import { useEffect, useRef, useState } from 'react'
import IconButton from './IconButton'
import styles from './KebabMenu.module.css'

const KebabIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
)

/**
 * KebabMenu — a compact "more options" control for VideoCard `menu` slots.
 *
 * Renders an icon-only trigger (three dots) that toggles a small dropdown of
 * actions. Used by Library and PlaylistView to expose item-removal actions
 * (Req 14.8). Closes on outside click, Escape, or after an item is chosen.
 *
 * @param {object} props
 * @param {{ label: string, onSelect: () => void, tone?: 'default'|'danger', icon?: React.ReactNode }[]} props.items
 * @param {string} [props.label='More options']  Accessible name for the trigger.
 */
export default function KebabMenu({ items = [], label = 'More options' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (items.length === 0) return null

  const handleSelect = (item) => {
    setOpen(false)
    item.onSelect?.()
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <IconButton
        label={label}
        size="sm"
        active={open}
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <KebabIcon />
      </IconButton>

      {open && (
        <div className={styles.menu} role="menu">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={
                item.tone === 'danger'
                  ? `${styles.item} ${styles.danger}`
                  : styles.item
              }
              onClick={() => handleSelect(item)}
            >
              {item.icon && (
                <span className={styles.itemIcon} aria-hidden="true">
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
