import styles from './IconButton.module.css'

/**
 * IconButton — an icon-only control with an enforced accessible name.
 *
 * Replaces the legacy `.icon-btn` / `.menu-btn` / `.user-avatar-btn` patterns
 * and guarantees every icon-only control exposes a non-empty accessible name.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children  The svg icon to render.
 * @param {string} props.label              REQUIRED. Non-empty accessible name;
 *                                           exposed (trimmed) as aria-label + title.
 * @param {'sm'|'md'} [props.size='md']      Control size.
 * @param {boolean} [props.active]           Active/pressed visual state.
 * @param {number} [props.badge]             Optional notification count indicator.
 * @param {string} [props.className]         Extra class names to merge.
 * ...rest forwarded to the underlying <button> (onClick, disabled, type, aria-*).
 *
 * Requirement 6.3: a non-empty label is exposed as the accessible name (trimmed).
 * Requirement 6.4: a missing or whitespace-only label fails to render and surfaces
 *                  a development error.
 */
export default function IconButton({
  children,
  label,
  size = 'md',
  active,
  badge,
  className,
  ...rest
}) {
  // Req 6.4: enforce a non-empty accessible name. A missing or whitespace-only
  // label is a programming error — fail to render and surface a development error.
  const accessibleName = typeof label === 'string' ? label.trim() : ''
  if (!accessibleName) {
    if (import.meta.env.DEV) {
      throw new Error(
        'IconButton: a non-empty `label` prop is required to provide an accessible name.'
      )
    }
    // In production, fail to render rather than ship an unlabeled control.
    return null
  }

  const sizeClass = size === 'sm' ? styles.sm : styles.md
  const classes = [styles.iconButton, sizeClass, active ? styles.active : '', className]
    .filter(Boolean)
    .join(' ')

  // Normalize the badge to a non-negative integer; only render when meaningful.
  const showBadge = typeof badge === 'number' && Number.isFinite(badge) && badge > 0
  const badgeText = showBadge ? (badge > 99 ? '99+' : String(badge)) : null

  return (
    <button
      type="button"
      className={classes}
      // Req 6.3: accessible name equals the trimmed label.
      aria-label={accessibleName}
      title={accessibleName}
      {...(typeof active === 'boolean' ? { 'aria-pressed': active } : {})}
      {...rest}
    >
      <span className={styles.icon} aria-hidden="true">
        {children}
      </span>
      {showBadge && (
        // Decorative count indicator: kept out of the accessible name so that
        // the accessible name remains exactly the trimmed label (Req 6.3).
        <span className={styles.badge} aria-hidden="true">
          {badgeText}
        </span>
      )}
    </button>
  )
}
