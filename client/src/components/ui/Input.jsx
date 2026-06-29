import { useId } from 'react'
import styles from './Input.module.css'

/**
 * Input — labeled text-field primitive.
 *
 * Pairs a `<label>` with an `<input>` and an optional inline validation
 * message rendered adjacent to the field. When `error` is set the control
 * exposes `aria-invalid="true"` and links the message via `aria-describedby`
 * so assistive technology announces it on focus.
 *
 * All presentation is driven by the sibling CSS Module + semantic tokens
 * (no inline presentational styles, no raw color literals).
 *
 * @param {object} props
 * @param {string} props.label              Visible field label.
 * @param {string} [props.id]               Optional id; auto-generated when omitted.
 * @param {string} [props.type='text']
 * @param {string} [props.error]            Inline validation message (renders adjacent).
 * @param {boolean} [props.required=false]  Marks the field required (shows indicator).
 * @param {React.ReactNode} [props.endAdornment]  Trailing slot (e.g. password toggle).
 * @param {string} [props.className]        Extra class for the wrapper.
 * ...rest forwarded to the underlying <input> (value, onChange, placeholder, autoComplete, …).
 */
export default function Input({
  label,
  id,
  type = 'text',
  error,
  required = false,
  endAdornment,
  className,
  ...rest
}) {
  const autoId = useId()
  const inputId = id || `input-${autoId}`
  const errorId = `${inputId}-error`
  const hasError = Boolean(error)

  const fieldClasses = [
    styles.field,
    hasError ? styles.fieldError : '',
    endAdornment != null ? styles.hasAdornment : '',
  ]
    .filter(Boolean)
    .join(' ')

  const wrapperClasses = className ? `${styles.group} ${className}` : styles.group

  return (
    <div className={wrapperClasses}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true"> *</span>
          )}
        </label>
      )}
      <div className={styles.control}>
        <input
          id={inputId}
          type={type}
          className={fieldClasses}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          {...rest}
        />
        {endAdornment != null && (
          <span className={styles.adornment}>{endAdornment}</span>
        )}
      </div>
      {hasError && (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      )}
    </div>
  )
}
