import styles from './Chip.module.css'

/**
 * Chip — presentational filter/category chip.
 *
 * Pure presentational control wired to existing sort params by the caller
 * (e.g. Home feed "All / Recent / Popular"). It renders as a real <button>
 * so it is keyboard- and focus-accessible by default, and exposes its
 * selected state via `aria-pressed` for assistive technology.
 *
 * @param {object} props
 * @param {string} props.label              Visible chip text.
 * @param {boolean} [props.selected=false]  Whether the chip is the active selection.
 * @param {() => void} [props.onClick]      Selection handler.
 */
export default function Chip({ label, selected = false, onClick }) {
  const className = selected ? `${styles.chip} ${styles.selected}` : styles.chip

  return (
    <button
      type="button"
      className={className}
      aria-pressed={selected}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
