import { useId, useRef } from 'react'
import styles from './Tabs.module.css'

/**
 * Tabs — accessible tablist with keyboard navigation and per-item counts.
 *
 * Replaces the legacy ad-hoc `.tab-btn` markup used by Channel and Library
 * with a single, keyboard-operable WAI-ARIA tablist. Selection follows focus:
 * arrow keys both move focus and change the active selection (a "roving
 * tabindex" pattern where only the active tab is in the tab sequence).
 *
 * Controlled component: the caller owns `active` and updates it via `onChange`.
 *
 * @param {Object} props
 * @param {{ key: string, label: string, count?: number }[]} props.items
 *        Tab descriptors. `key` is the stable identifier compared against
 *        `active`; `label` is the visible text; `count` (optional) renders a
 *        per-item count badge (e.g. Channel page tab counts, Req 14.4).
 * @param {string} props.active            The `key` of the currently active tab.
 * @param {(key: string) => void} props.onChange  Selection change handler.
 * @param {string} [props.label='Tabs']    Accessible name for the tablist.
 * @param {string} [props.className]        Extra class names to merge.
 *
 * Requirement 6.1:  provided as a reusable Design Primitive.
 * Requirement 11.8: Right/Down moves selection to the next tab (wrap last→first).
 * Requirement 11.9: Left/Up moves selection to the previous tab (wrap first→last).
 * Requirement 14.4: displays the item count for each tab.
 */
export default function Tabs({ items = [], active, onChange, label = 'Tabs', className }) {
  // Stable id base so each tab/panel pairing can be wired via aria-controls /
  // aria-labelledby without colliding across multiple Tabs instances.
  const baseId = useId()
  // Refs to each tab button so arrow-key navigation can move DOM focus to the
  // newly-selected tab (roving tabindex).
  const tabRefs = useRef([])

  // Resolve the active index; fall back to the first tab when `active` does not
  // match any item so the control always has a single selected tab.
  const activeIndex = (() => {
    const i = items.findIndex((item) => item.key === active)
    return i === -1 ? 0 : i
  })()

  const tabId = (key) => `${baseId}-tab-${key}`
  const panelId = (key) => `${baseId}-panel-${key}`

  // Select a tab by index: notify the caller and move focus to that tab.
  const selectIndex = (index) => {
    const item = items[index]
    if (!item) return
    if (item.key !== active) {
      onChange?.(item.key)
    }
    const node = tabRefs.current[index]
    if (node) node.focus()
  }

  const handleKeyDown = (event) => {
    const count = items.length
    if (count === 0) return

    switch (event.key) {
      // Req 11.8: next tab, wrapping from the last tab to the first.
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        selectIndex((activeIndex + 1) % count)
        break
      // Req 11.9: previous tab, wrapping from the first tab to the last.
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        selectIndex((activeIndex - 1 + count) % count)
        break
      // Convenience: Home/End jump to the first/last tab.
      case 'Home':
        event.preventDefault()
        selectIndex(0)
        break
      case 'End':
        event.preventDefault()
        selectIndex(count - 1)
        break
      default:
        break
    }
  }

  const classes = [styles.tablist, className].filter(Boolean).join(' ')

  return (
    <div
      role="tablist"
      aria-label={label}
      className={classes}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => {
        const selected = index === activeIndex
        const showCount = typeof item.count === 'number' && Number.isFinite(item.count)
        return (
          <button
            key={item.key}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            type="button"
            role="tab"
            id={tabId(item.key)}
            aria-selected={selected}
            aria-controls={panelId(item.key)}
            // Roving tabindex: only the active tab is reachable via Tab; arrow
            // keys move focus between tabs (Req 11.8 / 11.9).
            tabIndex={selected ? 0 : -1}
            className={selected ? `${styles.tab} ${styles.selected}` : styles.tab}
            onClick={() => selectIndex(index)}
          >
            <span className={styles.label}>{item.label}</span>
            {showCount && (
              // Req 14.4: per-item count badge. Decorative — kept out of the
              // accessible name so the tab name stays the label text.
              <span className={styles.count} aria-hidden="true">
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
