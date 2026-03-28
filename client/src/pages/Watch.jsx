import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatViews, formatTimeAgo, formatDuration, getErrorMessage, secureUrl, secureVideoUrl } from '../utils/formatters'
import Avatar from '../components/Avatar'
import VideoCard from '../components/VideoCard'
import Spinner from '../components/Spinner'
import VideoPlayer from '../components/VideoPlayer'

const ThumbUpIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, stroke: 'currentColor', fill: filled ? 'currentColor' : 'none', strokeWidth: 2 }}>
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
  </svg>
)
const ThumbDownIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/>
    <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
  </svg>
)
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
)
const SaveIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
)
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
    <polyline points="3 6 5 6 21 6"/><path d="M19 6L17.5 20.5A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20.5L5 6m3-3h8"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
  </svg>
)
const MsgIcon   = () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, stroke: 'var(--red)', fill: 'none', strokeWidth: 2 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const ChevronUpIcon = () => <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><polyline points="18 15 12 9 6 15"/></svg>
const ChevronDownIcon = () => <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><polyline points="6 9 12 15 18 9"/></svg>

export default function Watch() {
  const { videoId } = useParams()
  const { user }    = useAuth()
  const toast       = useToast()
  const navigate    = useNavigate()

  const [video, setVideo]   = useState(null)
  const [comments, setComments] = useState([])
  const [related, setRelated]  = useState([])
  const [loading, setLoading]  = useState(true)
  const [liked, setLiked]      = useState(false)
  const [subscribed, setSub]   = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commenting, setCommenting]   = useState(false)
  const [likeSubmitting, setLikeSubmitting] = useState(false)
  const [subSubmitting, setSubSubmitting] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const commentRef = useRef(null)

  // Playlist management states
  const [showPlaylistModal, setShowPlaylistModal] = useState(false)
  const [myPlaylists, setMyPlaylists] = useState([])
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [creatingPlaylist, setCreatingPlaylist] = useState(false)

  useEffect(() => {
    setLoading(true)
    setVideo(null)
    setComments([])
    setRelated([])
    let isMounted = true;

    // ── 1. Load the primary video ──────────────────────────────────────
    api.get(`/videos/${videoId}`)
      .then(({ data }) => {
        if (!isMounted) return;
        setVideo(data?.data || null)
        
        // ── 2. Load comments and related ONLY if video exists ───────────
        if (data?.data) {
          api.get(`/comments/${videoId}?limit=50`)
            .then(({ data: resData }) => { if (isMounted) setComments(resData?.data?.docs || resData?.data || []) })
            .catch(() => {})
            
          api.get('/videos?limit=12&sortBy=views&sortType=desc')
            .then(({ data: resData }) => { if (isMounted) setRelated((resData?.data?.docs || resData?.data || []).filter(v => v._id !== videoId)) })
            .catch(() => {})
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err?.response?.status !== 404) {
          toast({ message: 'Could not reach the server. Is the backend running?', type: 'error' })
        }
        setVideo(null)
      })
      .finally(() => {
         if (isMounted) setLoading(false)
      })

      return () => { isMounted = false; }
  }, [videoId])

  const handleLike = async () => {
    if (!user) { toast({ message: 'Sign in to like videos', type: 'error' }); return }
    if (likeSubmitting) return;
    setLikeSubmitting(true);
    try {
      await api.post(`/likes/toggle/v/${videoId}`)
      setLiked(p => !p)
      toast({ message: liked ? 'Like removed' : 'Video liked!', type: 'success' })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setLikeSubmitting(false);
    }
  }

  const handleSubscribe = async () => {
    if (!user) { toast({ message: 'Sign in to subscribe', type: 'error' }); return }
    if (!video?.owner?._id) return
    if (subSubmitting) return;
    setSubSubmitting(true);
    try {
      await api.post(`/subscriptions/toggle/c/${video.owner._id}`)
      setSub(p => !p)
      toast({ message: subscribed ? 'Unsubscribed' : 'Subscribed!', type: 'success' })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setSubSubmitting(false);
    }
  }

  const handleComment = async (e) => {
    e.preventDefault()
    if (!user) { toast({ message: 'Sign in to comment', type: 'error' }); return }
    if (!commentText.trim()) return
    setCommenting(true)
    try {
      const { data } = await api.post(`/comments/${videoId}`, { commentContent: commentText })
      setComments(prev => [data?.data, ...prev])
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
    if(!window.confirm('Delete this comment?')) return
    try {
      await api.delete(`/comments/c/${commentId}`)
      setComments(prev => prev.filter(c => c._id !== commentId))
      toast({ message: 'Comment deleted', type: 'success' })
    } catch {
      toast({ message: 'Failed to delete comment', type: 'error' })
    }
  }

  const loadPlaylistsAndShowModal = async () => {
    if (!user) { toast({ message: 'Sign in to save videos', type: 'error' }); return }
    setShowPlaylistModal(true)
    try {
      const { data } = await api.get(`/playlist/user/${user._id}`)
      setMyPlaylists(data?.data || [])
    } catch {}
  }

  const handleTogglePlaylist = async (playlistId, isInPlaylist) => {
    try {
      if (isInPlaylist) {
        await api.patch(`/playlist/remove/${videoId}/${playlistId}`)
      } else {
        await api.patch(`/playlist/add/${videoId}/${playlistId}`)
      }
      toast({ message: isInPlaylist ? 'Removed from playlist' : 'Saved to playlist', type: 'success' })
      // Re-fetch to update checkboxes
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
      setMyPlaylists(prev => [created, ...prev])
      setNewPlaylistName('')
      toast({ message: 'Playlist created', type: 'success' })
      // Auto add to the new playlist
      await handleTogglePlaylist(created._id, false)
    } catch {
       toast({ message: 'Failed to create playlist', type: 'error' })
    } finally {
       setCreatingPlaylist(false)
    }
  }

  if (loading) {
    return (
      <div className="watch-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 14 }} />
          <div className="skeleton skeleton-line" style={{ width: '70%', height: 24 }} />
          <div className="skeleton skeleton-line" style={{ width: '45%', height: 14 }} />
        </div>
      </div>
    )
  }

  if (!video) {
    return (
      <div className="empty-state">
        <h2 className="empty-title">Video Not Found</h2>
        <p className="empty-sub">This video may have been removed or made private.</p>
      </div>
    )
  }

  const isOwner = user?.username === video.owner?.username

  return (
    <div className="watch-layout">
      {/* ── Main Column ── */}
      <div style={{ minWidth: 0 }}>
        {/* Player */}
        <div className="video-player-wrap" style={{ borderRadius: 16, overflow: 'hidden', padding: 0, backgroundColor: 'black' }}>
          <VideoPlayer 
             options={{ 
                autoplay: true, 
                controls: true, 
                responsive: true,
                sources: [{ src: secureVideoUrl(video.videoFile) }] 
             }} 
             poster={secureUrl(video.thumbnail)} 
          />
        </div>

        {/* Title */}
        <h1 className="video-detail-title">{video.title}</h1>

        {/* Details Bar */}
        <div className="video-detail-bar">
          {/* Channel */}
          <div className="video-channel-row">
            <Link to={`/channel/${video.owner?.username}`}>
              <Avatar src={video.owner?.avatar} name={video.owner?.fullName} size={44} />
            </Link>
            <div className="video-channel-info">
              <Link to={`/channel/${video.owner?.username}`}>
                <span className="video-channel-name">{video.owner?.fullName}</span>
              </Link>
              <span className="video-subs-count">{formatViews(video.views)} views</span>
            </div>
            {!isOwner && (
              <button
                className={`btn btn-sm btn-subscribe ${subscribed ? 'subscribed' : ''}`}
                onClick={handleSubscribe}
                style={{ marginLeft: 12 }}
              >
                {subscribed ? 'Subscribed' : 'Subscribe'}
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="video-action-row">
            <div className="like-pill">
              <button className={`like-half ${liked ? 'liked' : ''}`} onClick={handleLike}>
                <ThumbUpIcon filled={liked} />
                {liked ? 'Liked' : 'Like'}
              </button>
              <div className="like-sep" />
              <button className="like-half">
                <ThumbDownIcon />
              </button>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleShare}>
              <ShareIcon /> Share
            </button>
            <button className="btn btn-secondary btn-sm" onClick={loadPlaylistsAndShowModal}>
              <SaveIcon /> Save
            </button>
          </div>
        </div>

        {/* Description */}
        <div className="description-box" onClick={() => setDescExpanded(p => !p)}>
          <div className="description-stats">
            {formatViews(video.views)} views • {formatTimeAgo(video.createdAt)}
          </div>
          <p className={`description-text ${descExpanded ? '' : 'collapsed'}`}>{video.description}</p>
          <span className="description-toggle" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {descExpanded ? <><ChevronUpIcon /> Show less</> : <><ChevronDownIcon /> Show more</>}
          </span>
        </div>

        {/* Comments */}
        <div className="comments-section">
          <h3 className="comments-title">
            <MsgIcon />
            {comments.length} Comments
          </h3>

          {user && (
            <form className="comment-input-row" onSubmit={handleComment}>
              <Avatar src={user.avatar} name={user.fullName} size={38} />
              <div className="comment-input-area">
                <textarea
                  ref={commentRef}
                  className="comment-textarea"
                  rows={1}
                  placeholder="Add a comment…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onFocus={(e) => e.target.rows = 3}
                  onBlur={(e) => { if (!commentText) e.target.rows = 1 }}
                />
                {commentText && (
                  <div className="comment-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCommentText('')}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={commenting}>
                      {commenting ? <><Spinner /> Posting…</> : 'Comment'}
                    </button>
                  </div>
                )}
              </div>
            </form>
          )}

          <div>
            {comments.map(c => (
              <div key={c._id} className="comment-item">
                <Avatar src={c.owner?.avatar} name={c.owner?.username} size={36} />
                <div className="comment-content">
                  <div className="comment-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span className="comment-author">@{c.owner?.username || 'user'}</span>
                      <span className="comment-time">{formatTimeAgo(c.createdAt)}</span>
                    </div>
                    {user?._id === c.owner?._id && (
                       <button onClick={() => handleDeleteComment(c._id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Delete">
                         <TrashIcon />
                       </button>
                    )}
                  </div>
                  <p className="comment-text">{c.content || c.commentContent}</p>
                  <button className="comment-likes">
                    <ThumbUpIcon /> 0
                  </button>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>No comments yet. Be first!</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Related Sidebar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>Up Next</h3>
        {related.map(vid => (
          <Link key={vid._id} to={`/watch/${vid._id}`} className="related-item">
            <div className="related-thumb">
              <img src={vid.thumbnail} alt={vid.title} />
              <span className="related-duration">{formatDuration(vid.duration)}</span>
            </div>
            <div className="related-info">
              <div className="related-title">{vid.title}</div>
              <div className="related-channel">{vid.owner?.fullName || vid.owner?.username}</div>
              <div className="related-stats">{formatViews(vid.views)} views</div>
            </div>
          </Link>
        ))}
      </div>

      {showPlaylistModal && (
        <div className="modal-overlay" onClick={(e) => { if(e.target === e.currentTarget) setShowPlaylistModal(false) }}>
          <div className="modal-content" style={{ width: 360, maxWidth: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
               <h2 style={{ fontSize: 18, margin: 0 }}>Save to Playlist</h2>
               <button onClick={() => setShowPlaylistModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>&times;</button>
            </div>
            
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
               {myPlaylists.length === 0 ? (
                 <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No playlists yet.</p>
               ) : (
                 myPlaylists.map(p => {
                    const isInPlaylist = p.videos?.some(vid => vid === videoId || vid._id === videoId)
                    return (
                      <label key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 15 }}>
                         <input 
                           type="checkbox" 
                           checked={isInPlaylist} 
                           onChange={() => handleTogglePlaylist(p._id, isInPlaylist)} 
                           style={{ width: 16, height: 16, cursor: 'pointer' }}
                         />
                         <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || p.playlist}</span>
                      </label>
                    )
                 })
               )}
            </div>

            <form onSubmit={handleCreatePlaylist} style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', gap: 8 }}>
               <input 
                 className="input" 
                 placeholder="New playlist name..." 
                 value={newPlaylistName}
                 onChange={(e) => setNewPlaylistName(e.target.value)}
                 style={{ height: 38 }}
               />
               <button type="submit" className="btn btn-primary" disabled={!newPlaylistName.trim() || creatingPlaylist} style={{ height: 38 }}>
                 {creatingPlaylist ? '...' : 'Create'}
               </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.6); z-index: 9999;
          display: flex; align-items: center; justifyContent: center;
        }
        .modal-content {
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 12px; padding: 20px; margin: auto;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }
      `}</style>
    </div>
  )
}
