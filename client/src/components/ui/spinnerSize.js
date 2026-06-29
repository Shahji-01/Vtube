/**
 * Spinner size resolution — kept separate from the component module so the
 * component file only exports components (react-refresh friendly) and so the
 * pure resolver can be unit-tested in isolation.
 */

/** Keyword → pixel diameter mapping for the Spinner. */
export const KEYWORD_SIZES = { sm: 16, md: 20, lg: 32 }

export const MIN_PX = 8
export const MAX_PX = 128
const FALLBACK = KEYWORD_SIZES.md

/**
 * Resolve a Spinner `size` prop to a pixel diameter.
 *
 * Accepts an integer pixel value between 8 and 128 inclusive, or one of the
 * keywords `sm` / `md` / `lg`. Any other value (non-integer, out-of-range,
 * unknown string, null, etc.) falls back to the `md` keyword size.
 *
 * @param {number|'sm'|'md'|'lg'} size
 * @returns {number} pixel diameter
 */
export function resolveSpinnerSize(size) {
  if (typeof size === 'string' && size in KEYWORD_SIZES) {
    return KEYWORD_SIZES[size]
  }
  if (
    typeof size === 'number' &&
    Number.isInteger(size) &&
    size >= MIN_PX &&
    size <= MAX_PX
  ) {
    return size
  }
  return FALLBACK
}
