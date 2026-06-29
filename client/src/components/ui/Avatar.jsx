import { useState } from 'react'
import { secureUrl } from '../../utils/formatters'
import styles from './Avatar.module.css'

/**
 * Avatar — user avatar with a safe, state-driven image fallback.
 *
 * Renders the user's image when a usable `src` is provided. On a missing,
 * empty, or failed image it falls back gracefully:
 *   - with a `name`: up to two uppercase initials from the first and last words
 *   - without a `name`: a neutral generic user glyph
 * It never renders a broken-image glyph and never throws.
 *
 * @param {object} props
 * @param {string} [props.src]        Image URL. Absent/empty renders the fallback.
 * @param {string} [props.name]       Used for initials fallback + alt text.
 * @param {number} [props.size=36]    Rendered diameter in px (runtime-computed).
 * @param {boolean} [props.ring=false] Brand ring (e.g. live/active emphasis).
 *
 * Requirement 10.1: missing/failed image with a name → up to 2 uppercase initials.
 * Requirement 10.2: missing/failed image without a name → neutral user glyph.
 * Requirement 10.4: never show a broken-image glyph or throw; error handled in state.
 * Requirement 13.5: an absent/empty src never passes through media helpers.
 */
export default function Avatar({ src, name, size = 36, ring = false }) {
  const [errored, setErrored] = useState(false)

  // A new src means a fresh chance to load. Reset error state during render
  // (React's recommended pattern for adjusting state on a prop change) so the
  // image is attempted again rather than being stuck on the fallback.
  const [prevSrc, setPrevSrc] = useState(src)
  if (src !== prevSrc) {
    setPrevSrc(src)
    setErrored(false)
  }

  // Req 13.5: only treat a non-empty string as a usable source. An absent,
  // null, or empty `src` must never be passed through `secureUrl` / rendered.
  const hasSrc = typeof src === 'string' && src.trim() !== ''
  const showImg = hasSrc && !errored

  const classes = [styles.avatar, ring ? styles.ring : ''].filter(Boolean).join(' ')

  // Runtime-computed size is the only permitted inline style (Req: no static
  // presentational inline styles). Font size scales with the avatar diameter.
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) }

  const initials = getAvatarInitials(name)

  return (
    <div className={classes} style={style}>
      {showImg ? (
        <img
          className={styles.img}
          src={secureUrl(src)}
          alt={name || 'avatar'}
          // Req 10.4: a load failure flips state to the fallback rather than
          // leaving a broken-image glyph behind (no fragile DOM nextSibling hack).
          onError={() => setErrored(true)}
        />
      ) : initials ? (
        // Req 10.1: initials fallback when a name is available.
        <span className={styles.initials} aria-hidden="true">
          {initials}
        </span>
      ) : (
        // Req 10.2: neutral generic user glyph when there is no usable name.
        <span className={styles.glyph} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="60%" height="60%">
            <circle cx="12" cy="8" r="4" fill="currentColor" />
            <path
              d="M4 20c0-4.418 3.582-7 8-7s8 2.582 8 7"
              fill="currentColor"
            />
          </svg>
        </span>
      )}
    </div>
  )
}

/**
 * Derive up to two uppercase initials from the first and last words of a name.
 * Returns an empty string when no usable name is present (caller renders the glyph).
 *
 * Examples: "John Doe" → "JD", "John Michael Doe" → "JD", "Madonna" → "M".
 */
function getAvatarInitials(name) {
  if (typeof name !== 'string') return ''
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}
