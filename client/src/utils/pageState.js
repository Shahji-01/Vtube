/**
 * pageState — pure render-state derivation for data-driven pages.
 *
 * A Page_View must display EXACTLY ONE of {skeleton, content, empty, error}
 * at any single point in time (Requirement 9.1, design Property 8). This module
 * centralizes that decision as a pure function so every page derives its state
 * the same way and so the exclusivity property is straightforward to test
 * (task 9.2).
 *
 * Precedence (highest first):
 *   1. error    — an error is set (truthy `error`)
 *   2. skeleton — still loading initial data
 *   3. empty    — finished loading, no items
 *   4. content  — finished loading, has items
 *
 * The function is total: every combination of inputs maps to exactly one state.
 */

/** @typedef {'skeleton' | 'content' | 'empty' | 'error'} PageState */

export const PAGE_STATE = Object.freeze({
  SKELETON: 'skeleton',
  CONTENT: 'content',
  EMPTY: 'empty',
  ERROR: 'error',
})

/**
 * Derive the single render state for a page from its data-fetching inputs.
 *
 * @param {object} [input]
 * @param {boolean} [input.loading]  True while the initial data request is in flight.
 * @param {*} [input.error]          Any truthy value (Error, message string, etc.) when the request failed.
 * @param {Array|null|undefined} [input.items]  The fetched collection; treated as empty when absent or not an array.
 * @returns {PageState} Exactly one of 'skeleton' | 'content' | 'empty' | 'error'.
 */
export function getPageState({ loading = false, error = null, items = [] } = {}) {
  // 1. Error wins regardless of loading/items, so a failed refetch surfaces
  //    the problem instead of silently showing a skeleton or stale-empty view.
  if (error) return PAGE_STATE.ERROR

  // 2. Still fetching initial data -> skeleton.
  if (loading) return PAGE_STATE.SKELETON

  // 3. Resolved with nothing -> empty.
  const count = Array.isArray(items) ? items.length : 0
  if (count === 0) return PAGE_STATE.EMPTY

  // 4. Resolved with data -> content.
  return PAGE_STATE.CONTENT
}

export default getPageState
