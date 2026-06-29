import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatViews, formatTimeAgo, getErrorMessage, secureUrl, secureVideoUrl } from '../utils/formatters'
import Avatar from '../components/ui/Avatar'
import VideoCard from '../components/ui/VideoCard'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import { WatchSkeleton } from '../components/ui/Skeleton'
import VideoPlayer from '../components/VideoPlayer'
import UnmuteButton from '../components/ui/UnmuteButton'
import WatchLaterButton from '../components/ui/WatchLaterButton'
import useWatchProgress from '../hooks/useWatchProgress'
import styles from './Watch.module.css'

/* ── Icons (sizing via width/height attrs; color inherits via currentColor) ── */
const ThumbUpIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" className={`${styles.icon} ${filled ? styles.iconFilled : ''}`}>
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
)
const ThumbDownIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" className={`${styles.icon} ${filled ? styles.iconFilled : ''}`}>
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
    <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
  </svg>
)
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" className={styles.icon}>
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
)
const SaveIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" className={styles.icon}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
)
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" className={styles.icon}>
    <polyline points="3 6 5 6 21 6" /><path d="M19 6L17.5 20.5A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20.5L5 6m3-3h8" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)
const MsgIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" className={styles.icon}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)
const ChevronUpIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" className={styles.icon}><polyline points="18 15 12 9 6 15" /></svg>
)
const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" className={styles.icon}><polyline points="6 9 12 15 18 9" /></svg>
)
const PinIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" className={`${styles.icon} ${filled ? styles.iconFilled : ''}`}>
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M9 2h6l-1 7 3 3v2H7v-2l3-3z" />
  </svg>
)
const FlagIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" className={styles.icon}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
)

/* Report reasons (mirror server REPORT_REASONS enum). */
const REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam or misleading' },
  { value: 'HARASSMENT', label: 'Harassment or bullying' },
  { value: 'HATE', label: 'Hate speech' },
  { value: 'SEXUAL', label: 'Sexual content' },
  { value: 'VIOLENCE', label: 'Violent or dangerous content' },
  { value: 'MISINFORMATION', label: 'Misinformation' },
  { value: 'OTHER', label: 'Other' },
]

const CommentItem = ({ comment, onDelete, videoId, isVideoOwner, onPin, onReport }) => {
  const { user } = useAuth()
  const toast = useToast()
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replies, setReplies] = useState([])
  const [showReplies, setShowReplies] = useState(false)
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [replying, setReplying] = useState(false)

  // Like/Dislike state for comment
  const [liked, setLiked] = useState(comment.isLiked || false)
  const [disliked, setDisliked] = useState(comment.isDisliked || false)
  const [likesCount, setLikesCount] = useState(comment.likesCount || 0)
  const [dislikesCount, setDislikesCount] = useState(comment.dislikesCount || 0)
  const [submittingLike, setSubmittingLike] = useState(false)
  const [pinning, setPinning] = useState(false)

  const handlePin = async () => {
    if (pinning) return
    setPinning(true)
    try {
      await onPin(comment._id, comment.pinned)
    } finally {
      setPinning(false)
    }
  }

  const loadReplies = async () => {
    if (showReplies) {
      setShowReplies(false)
      return
    }
    setLoadingReplies(true)
    try {
      const { data } = await api.get(`/comments/replies/${comment._id}`)
      setReplies(data?.data || [])
      setShowReplies(true)
    } catch {
      toast({ message: 'Failed to load replies', type: 'error' })
    } finally {
      setLoadingReplies(false)
    }
  }

  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim()) return
    setReplying(true)
    try {
      const { data } = await api.post(`/comments/${videoId}`, {
        commentContent: replyText,
        parentComment: comment._id,
      })

      const newReply = {
        ...data?.data,
        likesCount: 0,
        dislikesCount: 0,
        isLiked: false,
        isDisliked: false,
      }

      setReplies((prev) => [...prev, newReply])
      setReplyText('')
      setShowReplyForm(false)
      setShowReplies(true)
      toast({ message: 'Reply posted', type: 'success' })
    } catch {
      toast({ message: 'Failed to post reply', type: 'error' })
    } finally {
      setReplying(false)
    }
  }

  const handleLike = async (isDislikeAction) => {
    if (!user) { toast({ message: `Sign in to ${isDislikeAction ? 'dislike' : 'like'} comments`, type: 'error' }); return }
    if (submittingLike) return
    setSubmittingLike(true)
    try {
      await api.post(`/likes/toggle/c/${comment._id}?isDislike=${isDislikeAction}`)

      if (isDislikeAction) {
        setDisliked((prev) => {
          const next = !prev
          setDislikesCount((c) => (next ? c + 1 : c - 1))
          return next
        })
        if (liked) {
          setLiked(false)
          setLikesCount((c) => c - 1)
        }
      } else {
        setLiked((prev) => {
          const next = !prev
          setLikesCount((c) => (next ? c + 1 : c - 1))
          return next
        })
        if (disliked) {
          setDisliked(false)
          setDislikesCount((c) => c - 1)
        }
      }
    } catch {
      toast({ message: 'Failed to toggle like', type: 'error' })
    } finally {
      setSubmittingLike(false)
    }
  }

  return (
    <div className={styles.comment}>
      <Avatar src={comment.owner?.avatar} name={comment.owner?.username} size={36} />
      <div className={styles.commentContent}>
        <div className={styles.commentHeader}>
          <div className={styles.commentMetaLine}>
            {comment.pinned && (
              <span className={styles.pinnedBadge}>
                <PinIcon filled /> Pinned
              </span>
            )}
            <span className={styles.commentAuthor}>@{comment.owner?.username || 'user'}</span>
            <span className={styles.commentTime}>{formatTimeAgo(comment.createdAt)}</span>
          </div>
          {user?._id === comment.owner?._id && (
            <button type="button" className={styles.iconBtn} onClick={() => onDelete(comment._id)} aria-label="Delete comment">
              <TrashIcon />
            </button>
          )}
        </div>
        <p className={styles.commentText}>{comment.content || comment.commentContent}</p>
        <div className={styles.commentActionsRow}>
          <div className={styles.reactionGroup}>
            <button
              type="button"
              onClick={() => handleLike(false)}
              disabled={submittingLike}
              className={`${styles.reactionBtn} ${liked ? styles.reactionLiked : ''}`}
              aria-pressed={liked}
              aria-label="Like comment"
            >
              <ThumbUpIcon filled={liked} />
              <span>{likesCount}</span>
            </button>
            <button
              type="button"
              onClick={() => handleLike(true)}
              disabled={submittingLike}
              className={`${styles.reactionBtn} ${disliked ? styles.reactionDisliked : ''}`}
              aria-pressed={disliked}
              aria-label="Dislike comment"
            >
              <ThumbDownIcon filled={disliked} />
              <span>{dislikesCount}</span>
            </button>
          </div>
          <button
            type="button"
            className={styles.textBtn}
            onClick={() => { if (!user) { toast({ message: 'Sign in to reply', type: 'error' }); return } setShowReplyForm(!showReplyForm) }}
          >
            Reply
          </button>
          {isVideoOwner && (
            <button
              type="button"
              className={`${styles.textBtn} ${comment.pinned ? styles.pinActive : ''}`}
              onClick={handlePin}
              disabled={pinning}
              aria-pressed={!!comment.pinned}
            >
              <PinIcon filled={!!comment.pinned} />
              {comment.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          <button
            type="button"
            className={styles.textBtn}
            onClick={() => onReport(comment._id)}
            aria-label="Report comment"
          >
            <FlagIcon />
            Report
          </button>
        </div>

        {showReplyForm && (
          <form onSubmit={handleReply} className={styles.replyForm}>
            <Avatar src={user?.avatar} name={user?.username} size={28} />
            <div className={styles.replyFormBody}>
              <textarea
                className={`${styles.textarea} ${styles.textareaSm}`}
                rows={1}
                placeholder="Add a reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                autoFocus
              />
              <div className={styles.commentActions}>
                <Button variant="ghost" size="sm" onClick={() => setShowReplyForm(false)}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" loading={replying} disabled={!replyText.trim()}>Reply</Button>
              </div>
            </div>
          </form>
        )}

        <button type="button" className={styles.viewRepliesBtn} onClick={loadReplies}>
          {loadingReplies ? <Spinner size={14} /> : showReplies ? <ChevronUpIcon /> : <ChevronDownIcon />}
          {showReplies ? 'Hide replies' : 'View replies'}
        </button>

        {showReplies && replies.length > 0 && (
          <div className={styles.repliesWrap}>
            {replies.map((reply) => (
              <div key={reply._id} className={styles.reply}>
                <Avatar src={reply.owner?.avatar} name={reply.owner?.username} size={28} />
                <div className={styles.replyBody}>
                  <div className={styles.commentMetaLine}>
                    <span className={styles.commentAuthor}>@{reply.owner?.username || 'user'}</span>
                    <span className={styles.commentTime}>{formatTimeAgo(reply.createdAt)}</span>
                  </div>
                  <p className={`${styles.commentText} ${styles.commentTextSm}`}>{reply.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Watch() {
  const { videoId } = useParams()
  const { user } = useAuth()
  const toast = useToast()

  const [video, setVideo] = useState(null)
  const [comments, setComments] = useState([])
  const [related, setRelated] = useState([])
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [disliked, setDisliked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [dislikesCount, setDislikesCount] = useState(0)
  const [subscribed, setSub] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commenting, setCommenting] = useState(false)
  const [commentSort, setCommentSort] = useState('newest')
  const [reportTarget, setReportTarget] = useState(null) // { type: 'Video'|'Comment', id }
  const [submittingReport, setSubmittingReport] = useState(false)
  const [likeSubmitting, setLikeSubmitting] = useState(false)
  const [dislikeSubmitting, setDislikeSubmitting] = useState(false)
  const [subSubmitting, setSubSubmitting] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const commentRef = useRef(null)

  // ── Playback player + muted-autoplay state (R5) ──
  // Honour the user's reduced-motion preference: when set, do not autoplay and
  // start unmuted (the viewer presses play); otherwise muted autoplay.
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])
  const [player, setPlayer] = useState(null)
  const [muted, setMuted] = useState(!prefersReducedMotion)

  // Playlist management states
  const [showPlaylistModal, setShowPlaylistModal] = useState(false)
  const [myPlaylists, setMyPlaylists] = useState([])
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [creatingPlaylist, setCreatingPlaylist] = useState(false)

  // ── Resume / progress (R3): disabled for anonymous viewers ──
  const { resumeTo, startOver } = useWatchProgress({
    videoId,
    duration: video?.duration,
    player,
    enabled: !!user,
  })

  // Capture the player instance when video.js is ready. The hook and the
  // mute/seek effects below react to this state once it's set.
  const handlePlayerReady = useCallback((p) => {
    setPlayer(p)
  }, [])

  // ── Sync muted affordance with the player + guard explicit autoplay (R5.5) ──
  useEffect(() => {
    if (!player || typeof player.on !== 'function') return
    if (typeof player.isDisposed === 'function' && player.isDisposed()) return

    // Reflect the player's actual muted state into the affordance.
    try {
      if (typeof player.muted === 'function') setMuted(player.muted())
    } catch {
      // ignore — player not ready/disposed
    }

    const handleVolumeChange = () => {
      try {
        if (typeof player.muted === 'function') setMuted(player.muted())
      } catch {
        // ignore — player disposed
      }
    }
    player.on('volumechange', handleVolumeChange)

    // video.js handles muted autoplay via the `autoplay` option, but guard any
    // explicit play() so a blocked autoplay leaves the poster + play control
    // with no unhandled rejection (R5.5). Only attempt when autoplay is desired.
    if (!prefersReducedMotion && typeof player.play === 'function') {
      try {
        const playPromise = player.play()
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {})
        }
      } catch {
        // ignore — autoplay blocked or player not ready
      }
    }

    return () => {
      if (typeof player.off === 'function') {
        try {
          player.off('volumechange', handleVolumeChange)
        } catch {
          // ignore — player disposed
        }
      }
    }
  }, [player, prefersReducedMotion])

  // ── Apply the resume seek once both the player and a resume target exist ──
  useEffect(() => {
    if (!player || resumeTo <= 0) return
    if (typeof player.isDisposed === 'function' && player.isDisposed()) return
    if (typeof player.currentTime !== 'function') return
    try {
      player.currentTime(resumeTo)
    } catch {
      // ignore — player not ready/disposed
    }
  }, [player, resumeTo])

  // ── Toggle the player's muted state from the Unmute affordance (R5.3) ──
  const handleToggleMute = useCallback(() => {
    if (!player || typeof player.muted !== 'function') return
    try {
      const next = !player.muted()
      player.muted(next)
      setMuted(next)
    } catch {
      // ignore — player not ready/disposed
    }
  }, [player])

  useEffect(() => {
    setLoading(true)
    setVideo(null)
    setComments([])
    setRelated([])
    let isMounted = true

    // ── 1. Load the primary video ──────────────────────────────────────
    api.get(`/videos/${videoId}`)
      .then(({ data }) => {
        if (!isMounted) return
        const v = data?.data || null
        setVideo(v)
        if (v) {
          setLiked(v.isLiked || false)
          setDisliked(v.isDisliked || false)
          setLikesCount(v.likesCount || 0)
          setDislikesCount(v.dislikesCount || 0)
          setSub(v.owner?.isSubscribed || false)

          // ── 2. Load related ONLY if video exists (comments load via their own effect) ─
          api.get('/videos?limit=20&sortBy=views&sortType=desc')
            .then(({ data: resData }) => { if (isMounted) setRelated((resData?.data?.docs || resData?.data || []).filter((rv) => rv._id !== videoId).slice(0, 20)) })
            .catch(() => {})
        }
      })
      .catch((err) => {
        if (!isMounted) return
        if (err?.response?.status !== 404) {
          toast({ message: 'Could not reach the server. Is the backend running?', type: 'error' })
        }
        setVideo(null)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => { isMounted = false }
  }, [videoId, toast])

  // ── Fetch comments (server returns pinned-first ordering for the chosen sort) ──
  const fetchComments = useCallback(async (sort) => {
    const { data: resData } = await api.get(`/comments/${videoId}?limit=50&sort=${sort}`)
    setComments(resData?.data?.docs || resData?.data || [])
  }, [videoId])

  // Load comments once the video exists, and whenever the sort changes.
  useEffect(() => {
    if (!video) return undefined
    let active = true
    api.get(`/comments/${videoId}?limit=50&sort=${commentSort}`)
      .then(({ data: resData }) => { if (active) setComments(resData?.data?.docs || resData?.data || []) })
      .catch(() => {})
    return () => { active = false }
  }, [video, videoId, commentSort])

  const handleLike = async () => {
    if (!user) { toast({ message: 'Sign in to like videos', type: 'error' }); return }
    if (likeSubmitting) return
    setLikeSubmitting(true)
    try {
      await api.post(`/likes/toggle/v/${videoId}?isDislike=false`)

      setLiked((prev) => {
        const next = !prev
        setLikesCount((c) => (next ? c + 1 : c - 1))
        return next
      })

      if (disliked) {
        setDisliked(false)
        setDislikesCount((c) => c - 1)
      }

      toast({ message: liked ? 'Like removed' : 'Video liked!', type: 'success' })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setLikeSubmitting(false)
    }
  }

  const handleDislike = async () => {
    if (!user) { toast({ message: 'Sign in to dislike videos', type: 'error' }); return }
    if (dislikeSubmitting) return
    setDislikeSubmitting(true)
    try {
      await api.post(`/likes/toggle/v/${videoId}?isDislike=true`)

      setDisliked((prev) => {
        const next = !prev
        setDislikesCount((c) => (next ? c + 1 : c - 1))
        return next
      })

      if (liked) {
        setLiked(false)
        setLikesCount((c) => c - 1)
      }

      toast({ message: disliked ? 'Dislike removed' : 'Video disliked', type: 'success' })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setDislikeSubmitting(false)
    }
  }

  const handleSubscribe = async () => {
    if (!user) { toast({ message: 'Sign in to subscribe', type: 'error' }); return }
    if (!video?.owner?._id) return
    if (subSubmitting) return
    setSubSubmitting(true)
    try {
      await api.post(`/subscriptions/toggle/c/${video.owner._id}`)
      setSub((p) => !p)
      toast({ message: subscribed ? 'Unsubscribed' : 'Subscribed!', type: 'success' })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setSubSubmitting(false)
    }
  }

  const handleComment = async (e) => {
    e.preventDefault()
    if (!user) { toast({ message: 'Sign in to comment', type: 'error' }); return }
    if (!commentText.trim()) return
    setCommenting(true)
    try {
      const { data } = await api.post(`/comments/${videoId}`, { commentContent: commentText })
      setComments((prev) => [data?.data, ...prev])
      setCommentText('')
      toast({ message: 'Comment posted!', type: 'success' })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setCommenting(false)
    }
  }

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href)
    toast({ message: 'Link copied to clipboard!', type: 'success' })
  }

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return
    try {
      await api.delete(`/comments/c/${commentId}`)
      setComments((prev) => prev.filter((c) => c._id !== commentId))
      toast({ message: 'Comment deleted', type: 'success' })
    } catch {
      toast({ message: 'Failed to delete comment', type: 'error' })
    }
  }

  // ── Pin / Unpin a top-level comment (video owner only) — optimistic UI ──
  const handlePinToggle = async (commentId, currentlyPinned) => {
    // Optimistic flip of the targeted comment's pinned flag.
    setComments((prev) => prev.map((c) => (c._id === commentId ? { ...c, pinned: !currentlyPinned } : c)))
    try {
      await api.patch(`/comments/c/${commentId}/${currentlyPinned ? 'unpin' : 'pin'}`)
      // Refetch so ordering (pinned-first) reflects the server's canonical state.
      await fetchComments(commentSort)
    } catch (err) {
      // Revert the optimistic change and surface the error.
      setComments((prev) => prev.map((c) => (c._id === commentId ? { ...c, pinned: currentlyPinned } : c)))
      toast({ message: getErrorMessage(err), type: 'error' })
    }
  }

  // ── Reporting: open the reason picker (anonymous users are prompted to sign in) ──
  const openReport = (type, id) => {
    if (!user) { toast({ message: 'Sign in to report content', type: 'error' }); return }
    setReportTarget({ type, id })
  }

  const handleSubmitReport = async (reason) => {
    if (!reportTarget || submittingReport) return
    setSubmittingReport(true)
    try {
      await api.post('/reports', {
        targetType: reportTarget.type,
        targetId: reportTarget.id,
        reason,
      })
      toast({ message: 'Report submitted', type: 'success' })
      setReportTarget(null)
    } catch (err) {
      if (err?.response?.status === 409) {
        toast({ message: 'You already reported this', type: 'info' })
        setReportTarget(null)
      } else {
        toast({ message: getErrorMessage(err), type: 'error' })
      }
    } finally {
      setSubmittingReport(false)
    }
  }

  const loadPlaylistsAndShowModal = async () => {
    if (!user) { toast({ message: 'Sign in to save videos', type: 'error' }); return }
    setShowPlaylistModal(true)
    try {
      const { data } = await api.get(`/playlist/user/${user._id}`)
      setMyPlaylists(data?.data || [])
    } catch {
      // Modal still opens; the empty/error path is reflected by an empty list.
    }
  }

  const handleTogglePlaylist = async (playlistId, isInPlaylist) => {
    try {
      if (isInPlaylist) {
        await api.patch(`/playlist/remove/${videoId}/${playlistId}`)
      } else {
        await api.patch(`/playlist/add/${videoId}/${playlistId}`)
      }
      toast({ message: isInPlaylist ? 'Removed from playlist' : 'Saved to playlist', type: 'success' })
      const { data } = await api.get(`/playlist/user/${user._id}`)
      setMyPlaylists(data?.data || [])
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    }
  }

  const handleCreatePlaylist = async (e) => {
    e.preventDefault()
    if (!newPlaylistName.trim()) return
    setCreatingPlaylist(true)
    try {
      const { data } = await api.post('/playlist', { playlistName: newPlaylistName })
      const created = data?.data
      setMyPlaylists((prev) => [created, ...prev])
      setNewPlaylistName('')
      toast({ message: 'Playlist created', type: 'success' })
      await handleTogglePlaylist(created._id, false)
    } catch {
      toast({ message: 'Failed to create playlist', type: 'error' })
    } finally {
      setCreatingPlaylist(false)
    }
  }

  if (loading) {
    return <WatchSkeleton />
  }

  if (!video) {
    return (
      <EmptyState
        title="Video Not Found"
        subtitle="This video may have been removed or made private."
      />
    )
  }

  const isOwner = user?.username === video.owner?.username
  const isVideoOwner = !!user?._id && !!video.owner?._id && user._id === video.owner._id

  return (
    <div className={styles.layout}>
      {/* ── Main Column ── */}
      <div className={styles.main}>
        {/* Player */}
        <div className={styles.playerWrap}>
          <VideoPlayer
            options={{
              muted: !prefersReducedMotion,
              autoplay: !prefersReducedMotion,
              controls: true,
              responsive: true,
              sources: [{ src: secureVideoUrl(video.videoFile), type: 'video/mp4' }],
            }}
            poster={secureUrl(video.thumbnail)}
            onReady={handlePlayerReady}
          />
          <div className={styles.unmuteOverlay}>
            <UnmuteButton muted={muted} onToggle={handleToggleMute} />
          </div>
        </div>

        {/* Title */}
        <h1 className={styles.title}>{video.title}</h1>

        {/* Details Bar */}
        <div className={styles.detailBar}>
          {/* Channel */}
          <div className={styles.channelRow}>
            <Link to={`/channel/${video.owner?.username}`} className={styles.channelLink}>
              <Avatar src={video.owner?.avatar} name={video.owner?.fullName} size={44} />
            </Link>
            <div className={styles.channelInfo}>
              <Link to={`/channel/${video.owner?.username}`} className={styles.channelName}>
                {video.owner?.fullName}
              </Link>
              <span className={styles.subsCount}>{formatViews(video.views)} views</span>
            </div>
            {!isOwner && (
              <Button
                variant="subscribe"
                size="sm"
                active={subscribed}
                loading={subSubmitting}
                onClick={handleSubscribe}
              >
                {subscribed ? 'Subscribed' : 'Subscribe'}
              </Button>
            )}
          </div>

          {/* Actions */}
          <div className={styles.actionRow}>
            <div className={styles.likePill}>
              <button
                type="button"
                className={`${styles.likeHalf} ${liked ? styles.liked : ''}`}
                onClick={handleLike}
                disabled={likeSubmitting}
                aria-pressed={liked}
                aria-label="I like this"
              >
                <ThumbUpIcon filled={liked} />
                <span className={styles.likeCount}>{formatViews(likesCount)}</span>
              </button>
              <div className={styles.likeSep} />
              <button
                type="button"
                className={`${styles.likeHalf} ${disliked ? styles.disliked : ''}`}
                onClick={handleDislike}
                disabled={dislikeSubmitting}
                aria-pressed={disliked}
                aria-label="I dislike this"
              >
                <ThumbDownIcon filled={disliked} />
                <span className={styles.likeCount}>{formatViews(dislikesCount)}</span>
              </button>
            </div>
            <Button variant="secondary" size="sm" iconLeft={<ShareIcon />} onClick={handleShare}>
              Share
            </Button>
            <Button variant="secondary" size="sm" iconLeft={<SaveIcon />} onClick={loadPlaylistsAndShowModal}>
              Save
            </Button>
            <WatchLaterButton videoId={videoId} />
            <Button variant="secondary" size="sm" iconLeft={<FlagIcon />} onClick={() => openReport('Video', videoId)}>
              Report
            </Button>
            <Button variant="secondary" size="sm" onClick={startOver}>
              Start Over
            </Button>
          </div>
        </div>

        {/* Description */}
        <div className={styles.description} onClick={() => setDescExpanded((p) => !p)}>
          <div className={styles.descStats}>
            {formatViews(video.views)} views • {formatTimeAgo(video.createdAt)}
          </div>
          <p className={`${styles.descText} ${descExpanded ? '' : styles.descCollapsed}`}>{video.description}</p>
          <span className={styles.descToggle}>
            {descExpanded ? <><ChevronUpIcon /> Show less</> : <><ChevronDownIcon /> Show more</>}
          </span>
        </div>

        {/* Comments */}
        <div className={styles.commentsSection}>
          <div className={styles.commentsHeaderRow}>
            <h3 className={styles.commentsTitle}>
              <MsgIcon />
              {comments.length} Comments
            </h3>
            <div className={styles.sortToggle} role="group" aria-label="Sort comments">
              <button
                type="button"
                className={`${styles.sortBtn} ${commentSort === 'top' ? styles.sortActive : ''}`}
                onClick={() => setCommentSort('top')}
                aria-pressed={commentSort === 'top'}
              >
                Top
              </button>
              <button
                type="button"
                className={`${styles.sortBtn} ${commentSort === 'newest' ? styles.sortActive : ''}`}
                onClick={() => setCommentSort('newest')}
                aria-pressed={commentSort === 'newest'}
              >
                Newest
              </button>
            </div>
          </div>

          {user && (
            <form className={styles.commentInputRow} onSubmit={handleComment}>
              <Avatar src={user.avatar} name={user.fullName} size={38} />
              <div className={styles.commentInputArea}>
                <textarea
                  ref={commentRef}
                  className={styles.textarea}
                  rows={1}
                  placeholder="Add a comment…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onFocus={(e) => { e.target.rows = 3 }}
                  onBlur={(e) => { if (!commentText) e.target.rows = 1 }}
                />
                {commentText && (
                  <div className={styles.commentActions}>
                    <Button variant="ghost" size="sm" onClick={() => setCommentText('')}>Cancel</Button>
                    <Button type="submit" variant="primary" size="sm" loading={commenting}>Comment</Button>
                  </div>
                )}
              </div>
            </form>
          )}

          <div>
            {comments.map((c) => (
              <CommentItem
                key={c._id}
                comment={c}
                onDelete={handleDeleteComment}
                videoId={videoId}
                isVideoOwner={isVideoOwner}
                onPin={handlePinToggle}
                onReport={(commentId) => openReport('Comment', commentId)}
              />
            ))}
            {comments.length === 0 && (
              <p className={styles.emptyComments}>No comments yet. Be first!</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Up Next Sidebar ── */}
      <div className={styles.sidebar}>
        <h3 className={styles.upNextTitle}>Up Next</h3>
        {related.map((vid) => (
          <VideoCard key={vid._id} video={vid} layout="list" hideAvatar />
        ))}
      </div>

      {/* ── Save to Playlist modal ── */}
      <Modal
        open={showPlaylistModal}
        onClose={() => setShowPlaylistModal(false)}
        title="Save to Playlist"
        footer={
          <form onSubmit={handleCreatePlaylist} className={styles.createForm}>
            <input
              className={styles.createInput}
              placeholder="New playlist name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={creatingPlaylist} disabled={!newPlaylistName.trim()}>
              Create
            </Button>
          </form>
        }
      >
        <div className={styles.playlistList}>
          {myPlaylists.length === 0 ? (
            <p className={styles.playlistEmpty}>No playlists yet.</p>
          ) : (
            myPlaylists.map((p) => {
              const isInPlaylist = p.videos?.some((vid) => vid === videoId || vid._id === videoId)
              return (
                <label key={p._id} className={styles.playlistItem}>
                  <input
                    type="checkbox"
                    className={styles.playlistCheckbox}
                    checked={isInPlaylist}
                    onChange={() => handleTogglePlaylist(p._id, isInPlaylist)}
                  />
                  <span className={styles.playlistName}>{p.name || p.playlistName || p.playlist}</span>
                </label>
              )
            })
          )}
        </div>
      </Modal>

      {/* ── Report reason picker modal ── */}
      <Modal
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        title={reportTarget?.type === 'Comment' ? 'Report comment' : 'Report video'}
      >
        <p className={styles.reportIntro}>Why are you reporting this {reportTarget?.type === 'Comment' ? 'comment' : 'video'}?</p>
        <div className={styles.reportReasons}>
          {REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              className={styles.reportReason}
              onClick={() => handleSubmitReport(r.value)}
              disabled={submittingReport}
            >
              {r.label}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
