/**
 * Deterministically resolve which navigation item is "current" for a given
 * location. Returns the matching item's unique `to`, or `null` when nothing
 * matches. The resolution guarantees AT MOST ONE current item (Req 5.6, 5.7),
 * which matters because several sidebar items share the `/library` pathname
 * with different `?tab=` query strings:
 *   1. Prefer an exact full-path match (pathname + search).
 *   2. Otherwise, among items sharing the current pathname, prefer the single
 *      item that carries no query string (the canonical pathname item).
 *   3. If that is still ambiguous, mark none.
 *
 * @param {{ to: string }[]} items navigation items with a unique `to` each
 * @param {string} pathname  current location pathname (no query string)
 * @param {string} [search]  current location search (including leading '?')
 * @returns {string|null} the `to` of the single current item, or null
 */
export function resolveCurrentTo(items, pathname, search) {
  const currentFull = `${pathname}${search || ''}`

  // 1. Exact match including query string.
  const exact = items.find((item) => item.to === currentFull)
  if (exact) return exact.to

  // 2. Items whose pathname matches the current pathname.
  const pathMatches = items.filter((item) => item.to.split('?')[0] === pathname)
  if (pathMatches.length === 1) return pathMatches[0].to
  if (pathMatches.length > 1) {
    const base = pathMatches.filter((item) => !item.to.includes('?'))
    if (base.length === 1) return base[0].to
    return null // 3. ambiguous -> mark none
  }

  // No pathname match at all.
  return null
}
