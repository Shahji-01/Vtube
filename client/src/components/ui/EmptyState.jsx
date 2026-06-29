import styles from './EmptyState.module.css'

/**
 * EmptyState — standardized empty / error placeholder.
 *
 * Replaces the ad-hoc `.empty-state` markup duplicated across pages. Supports
 * a `default` tone (no content yet) and an `error` tone (failed request, per
 * Req 9.5). The optional `action` slot renders a caller-supplied element such
 * as a Retry button.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.icon]       Decorative icon/glyph.
 * @param {string} props.title                 Primary message.
 * @param {string} [props.subtitle]            Secondary explanatory text.
 * @param {React.ReactNode} [props.action]     Optional action element (e.g. Retry button).
 * @param {'default'|'error'} [props.tone='default']  Visual tone.
 */
export default function EmptyState({ icon, title, subtitle, action, tone = 'default' }) {
  const toneClass = tone === 'error' ? styles.error : styles.default
  const className = `${styles.root} ${toneClass}`

  return (
    <div className={className} role="status">
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      )}
      <p className={styles.title}>{title}</p>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
