import Spinner from './Spinner'
import styles from './Button.module.css'

/** Spinner keyword size to pair with each Button size. */
const SPINNER_SIZE = { sm: 'sm', md: 'sm', lg: 'md' }

/**
 * Button — the primary interactive control primitive.
 *
 * Encodes variants, sizes, an icon-left/right slot, an `active` state, and a
 * `loading` state. While loading the button shows a Spinner, rejects all click
 * and keyboard activation, and exposes `aria-busy="true"`. All presentation is
 * driven by the sibling CSS Module + semantic tokens (no inline styles).
 *
 * @param {object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'|'subscribe'} [props.variant='secondary']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.loading=false] shows Spinner, blocks activation, sets aria-busy
 * @param {boolean} [props.fullWidth=false]
 * @param {React.ReactNode} [props.iconLeft]
 * @param {React.ReactNode} [props.iconRight]
 * @param {boolean} [props.active=false] e.g. subscribed/toggled state
 * @param {boolean} [props.disabled=false]
 * @param {'button'|'submit'|'reset'} [props.type='button']
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children]
 */
export default function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  fullWidth = false,
  iconLeft,
  iconRight,
  active = false,
  disabled = false,
  type = 'button',
  className,
  children,
  onClick,
  onKeyDown,
  ...rest
}) {
  const variantClass = styles[variant] || styles.secondary
  const sizeClass = styles[`size-${size}`] || styles['size-md']

  const classes = [
    styles.button,
    variantClass,
    sizeClass,
    fullWidth ? styles.fullWidth : '',
    active ? styles.active : '',
    loading ? styles.loading : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleClick = (event) => {
    if (loading) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onClick?.(event)
  }

  const handleKeyDown = (event) => {
    // Reject keyboard activation (Enter / Space) while loading.
    if (loading && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onKeyDown?.(event)
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-variant={variant}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {loading && (
        <Spinner size={SPINNER_SIZE[size] || 'sm'} className={styles.spinner} />
      )}
      {!loading && iconLeft != null && (
        <span className={styles.icon} aria-hidden="true">
          {iconLeft}
        </span>
      )}
      {children != null && <span className={styles.label}>{children}</span>}
      {!loading && iconRight != null && (
        <span className={styles.icon} aria-hidden="true">
          {iconRight}
        </span>
      )}
    </button>
  )
}
