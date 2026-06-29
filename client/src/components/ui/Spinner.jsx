import { resolveSpinnerSize } from './spinnerSize'
import styles from './Spinner.module.css'

/**
 * Spinner — an accessible loading indicator.
 *
 * @param {object} props
 * @param {number|'sm'|'md'|'lg'} [props.size='md'] integer px (8–128) or keyword
 * @param {string} [props.label='Loading'] sr-only accessible label
 * @param {string} [props.className] optional extra class for positioning
 */
export default function Spinner({ size = 'md', label = 'Loading', className }) {
  const diameter = resolveSpinnerSize(size)
  // Diameter and proportional stroke are runtime-computed values, so they are
  // applied via inline style (permitted for non-static, computed values).
  const dimensionStyle = {
    width: diameter,
    height: diameter,
    borderWidth: Math.max(2, Math.round(diameter / 10)),
  }

  return (
    <span
      className={className ? `${styles.spinner} ${className}` : styles.spinner}
      role="status"
    >
      <span className={styles.ring} style={dimensionStyle} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}
