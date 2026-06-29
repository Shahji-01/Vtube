import { useCallback, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { toggleLike } from '../utils/toggleLike'
import useOptimisticAction from './useOptimisticAction'

// ── useLikeAction: optimistic like/dislike for a video ──
//
// Composes the generic `useOptimisticAction` orchestrator with the pure
// `toggleLike` reducer and `useAuth` to give pages a ready-to-wire like/dislike
// controller that satisfies the optimistic-action contract:
//
//  - `like()` / `dislike()` apply `toggleLike` optimistically and render within
//    100ms, before the toggle request resolves (Req 8.6).
//  - On failure or a 10s timeout the state rolls back to the exact prior value
//    and an error toast is shown for >= 5s (Req 8.7).
//  - When signed out, a sign-in prompt toast is shown for >= 5s and NO request
//    is sent (Req 8.8).
//
// The network request reuses the existing endpoint
// `POST /likes/toggle/v/:videoId?isDislike=<bool>` — no backend changes.

/**
 * @typedef {import('../utils/toggleLike').LikeState} LikeState
 */

/**
 * Hook managing optimistic like/dislike state for a single video.
 *
 * @param {Object} options
 * @param {string} options.videoId - The video whose like/dislike is toggled.
 * @param {LikeState} [options.initial] - Initial like state.
 * @param {import('axios').AxiosInstance} options.api
 *   The Axios instance used to send the toggle request (injected so the hook
 *   stays decoupled from a specific module and is easy to test).
 * @returns {{
 *   state: LikeState,
 *   setState: (next: LikeState) => void,
 *   like: () => Promise<import('./useOptimisticAction').OptimisticActionResult>,
 *   dislike: () => Promise<import('./useOptimisticAction').OptimisticActionResult>,
 *   isSignedIn: boolean,
 * }}
 */
export default function useLikeAction({
  videoId,
  initial = { liked: false, disliked: false, likes: 0, dislikes: 0 },
  api,
}) {
  const { user } = useAuth()
  const run = useOptimisticAction()
  const [state, setState] = useState(initial)

  const dispatch = useCallback(
    action =>
      run({
        authed: !!user,
        current: state,
        setState,
        optimistic: prev => toggleLike(prev, action),
        request: () =>
          api.post(
            `/likes/toggle/v/${videoId}?isDislike=${action === 'dislike'}`
          ),
        signInMessage:
          action === 'dislike'
            ? 'Sign in to dislike videos'
            : 'Sign in to like videos',
      }),
    [run, user, state, videoId, api]
  )

  const like = useCallback(() => dispatch('like'), [dispatch])
  const dislike = useCallback(() => dispatch('dislike'), [dispatch])

  return { state, setState, like, dislike, isSignedIn: !!user }
}
