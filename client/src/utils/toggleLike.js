// ── toggleLike: pure optimistic like/dislike reducer ──
//
// Formalizes the like/dislike logic for videos and comments. It is a pure
// function: given the current like-state and an action, it returns a brand-new
// state object without mutating the input. The network call and rollback are
// the caller's responsibility.
//
// State shape: { liked, disliked, likes, dislikes }
// Action:      'like' | 'dislike'
//
// Guarantees (see design "Key Functions with Formal Specifications"):
//  - Mutual exclusion: `liked` and `disliked` are never both true (Req 8.1).
//  - Counts change by at most 1 per processed action and stay non-negative
//    given valid preconditions (Req 8.2).
//  - Applying `like` twice with no interleaving `dislike` returns the original
//    state — involution (Req 8.3).
//  - `like` over a disliked state switches sides: likes+1, dislikes-1 (Req 8.4).
//  - `dislike` over a liked state switches sides: dislikes+1, likes-1 (Req 8.5).

/**
 * @typedef {{ liked: boolean, disliked: boolean, likes: number, dislikes: number }} LikeState
 */

/**
 * Compute the next optimistic like/dislike state.
 *
 * Preconditions: `s.likes >= 0`, `s.dislikes >= 0`, and `liked`/`disliked` are
 * not both `true`.
 *
 * @param {LikeState} s - the current state (not mutated)
 * @param {'like'|'dislike'} action - the action to apply
 * @returns {LikeState} a new state object
 */
export function toggleLike(s, action) {
  if (action === 'like') {
    const liked = !s.liked
    return {
      liked,
      disliked: false,
      likes: s.likes + (liked ? 1 : -1),
      dislikes: s.disliked ? s.dislikes - 1 : s.dislikes,
    }
  }

  const disliked = !s.disliked
  return {
    liked: false,
    disliked,
    likes: s.liked ? s.likes - 1 : s.likes,
    dislikes: s.dislikes + (disliked ? 1 : -1),
  }
}

export default toggleLike
