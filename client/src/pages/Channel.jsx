import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatViews, formatTimeAgo, getErrorMessage } from '../utils/formatters'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import Tabs from '../components/ui/Tabs'
import EmptyState from '../components/ui/EmptyState'
import VideoCard from '../components/ui/VideoCard'
import Skeleton, { VideoCardSkeleton, ChannelHeaderSkeleton } from '../components/ui/Skeleton'
import styles from './Channel.module.css'

/* ── Small inline icon glyphs (presentation via attributes + currentColor) ── */
const TrashIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6L17.5 20.5A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20.5L5 6m3-3h8" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

const EditIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const VideoGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
)

/* ── Tweets tab ──────────────────────────────────────────────────────── */
function TweetsFeed({ userId, isOwner, onCount }) {
  const [tweets, setTweets] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTweet, setNewTweet] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingTweetId, setEditingTweetId] = useState(null)
  const [editTweetText, setEditTweetText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const toast = useToast()

  const setTweetsAndCount = useCallback((updater) => {
    setTweets((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      onCount?.(next.length)
      return next
    })
  }, [onCount])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data } = await api.get(`/tweets/user/${userId}`)
        setTweetsAndCount(data?.data || [])
      } catch {
        // Non-fatal: tweets simply render their empty state.
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId, setTweetsAndCount])

  const handlePost = async (e) => {
    e.preventDefault()
    if (!newTweet.trim()) return
    setPosting(true)
    try {
      const { data } = await api.post('/tweets', { content: newTweet })
      setTweetsAndCount((prev) => [data.data, ...prev])
      setNewTweet('')
      toast({ message: 'Tweet posted', type: 'success' })
    } catch {
      toast({ message: 'Failed to post tweet', type: 'error' })
    } finally {
      setPosting(false)
    }
  }

  const handleDeleteTweet = async (tweetId) => {
    if (!window.confirm('Delete this tweet?')) return
    try {
      await api.delete(`/tweets/${tweetId}`)
      setTweetsAndCount((prev) => prev.filter((t) => t._id !== tweetId))
      toast({ message: 'Tweet deleted', type: 'success' })
    } catch {
      toast({ message: 'Failed to delete tweet', type: 'error' })
    }
  }

  const openEditTweet = (tweet) => {
    setEditingTweetId(tweet._id)
    setEditTweetText(tweet.content)
  }

  const handleSaveEdit = async (tweetId) => {
    if (!editTweetText.trim()) return
    setSavingEdit(true)
    try {
      const { data } = await api.patch(`/tweets/${tweetId}`, { tweet: editTweetText })
      setTweets((prev) => prev.map((t) => (t._id === tweetId ? { ...t, content: data.data?.content || editTweetText } : t)))
      setEditingTweetId(null)
      toast({ message: 'Tweet updated', type: 'success' })
    } catch {
      toast({ message: 'Failed to update tweet', type: 'error' })
    } finally {
      setSavingEdit(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.tweets}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div className={styles.tweetCard} key={i}>
            <Skeleton width="90%" height={14} />
            <Skeleton width="60%" height={14} />
            <Skeleton width={80} height={11} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.tweets}>
      {isOwner && (
        <form onSubmit={handlePost} className={styles.composer}>
          <input
            className={styles.input}
            placeholder="Write a tweet..."
            value={newTweet}
            onChange={(e) => setNewTweet(e.target.value)}
            disabled={posting}
            aria-label="Write a tweet"
          />
          <Button type="submit" variant="primary" loading={posting} disabled={!newTweet.trim()}>
            Post
          </Button>
        </form>
      )}

      {tweets.length === 0 ? (
        <EmptyState
          title="No tweets yet"
          subtitle={isOwner ? 'Share your first thought with your audience.' : "This channel hasn't posted any tweets."}
        />
      ) : (
        tweets.map((t) => (
          <div key={t._id} className={styles.tweetCard}>
            {editingTweetId === t._id ? (
              <div className={styles.tweetEdit}>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={editTweetText}
                  onChange={(e) => setEditTweetText(e.target.value)}
                  aria-label="Edit tweet"
                  autoFocus
                />
                <div className={styles.editActions}>
                  <Button variant="ghost" size="sm" onClick={() => setEditingTweetId(null)} disabled={savingEdit}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" loading={savingEdit} disabled={!editTweetText.trim()} onClick={() => handleSaveEdit(t._id)}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className={styles.tweetRow}>
                <p className={styles.tweetText}>{t.content}</p>
                {isOwner && (
                  <div className={styles.tweetActions}>
                    <IconButton label="Edit tweet" size="sm" onClick={() => openEditTweet(t)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton label="Delete tweet" size="sm" onClick={() => handleDeleteTweet(t._id)}>
                      <TrashIcon />
                    </IconButton>
                  </div>
                )}
              </div>
            )}
            <div className={styles.tweetTime}>{formatTimeAgo(t.createdAt)}</div>
          </div>
        ))
      )}
    </div>
  )
}

/* ── Playlists tab ───────────────────────────────────────────────────── */
function PlaylistsFeed({ userId, onCount }) {
  const [playlists, setPlaylists] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data } = await api.get(`/playlist/user/${userId}`)
        const list = data?.data || []
        setPlaylists(list)
        onCount?.(list.length)
      } catch {
        // Non-fatal: playlists simply render their empty state.
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId, onCount])

  if (loading) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (playlists.length === 0) {
    return <EmptyState title="No playlists" subtitle="This channel hasn't created any playlists." />
  }

  return (
    <div className={styles.grid}>
      {playlists.map((p) => (
        <Link key={p._id} to={`/playlist/${p._id}`} className={styles.playlistCard}>
          <div className={styles.playlistThumb}>Playlist</div>
          <div className={styles.playlistBody}>
            <h3 className={styles.playlistName}>{p.name}</h3>
            {p.description && <p className={styles.playlistDesc}>{p.description}</p>}
          </div>
        </Link>
      ))}
    </div>
  )
}

/* ── Channel page ────────────────────────────────────────────────────── */
export default function Channel() {
  const { username } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [vLoading, setVLoading] = useState(false)
  const [subscribed, setSub] = useState(false)
  const [subBusy, setSubBusy] = useState(false)
  const [activeTab, setTab] = useState('videos')

  const [playlistCount, setPlaylistCount] = useState(null)
  const [tweetCount, setTweetCount] = useState(null)

  const loadChannel = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const { data } = await api.get(`/users/c/${username}`)
      const prof = data?.data
      setProfile(prof)
      setSub(prof?.isSubscribed || false)
      setVLoading(true)
      try {
        const vRes = await api.get(`/videos?userId=${prof._id}&limit=20`)
        setVideos(vRes.data?.data?.docs || vRes.data?.data || [])
      } finally {
        setVLoading(false)
      }
    } catch {
      setError(true)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => {
    // Reset per-tab counts when switching channels.
    setPlaylistCount(null)
    setTweetCount(null)
    loadChannel()
  }, [loadChannel])

  const handleSubscribe = async () => {
    if (!user) {
      toast({ message: 'Sign in to subscribe', type: 'error' })
      return
    }
    setSubBusy(true)
    try {
      await api.post(`/subscriptions/toggle/c/${profile._id}`)
      setSub((p) => !p)
      toast({ message: subscribed ? 'Unsubscribed' : 'Subscribed!', type: 'success' })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setSubBusy(false)
    }
  }

  // ── Skeleton state (Req 9.2) ──
  if (loading) {
    return <ChannelHeaderSkeleton />
  }

  // ── Error state ──
  if (error || !profile) {
    return (
      <EmptyState
        tone="error"
        title="Channel not found"
        subtitle="We couldn't load this channel. It may not exist or the request failed."
        action={
          <Button variant="primary" onClick={loadChannel}>
            Retry
          </Button>
        }
      />
    )
  }

  const isOwner = user?.username === profile.username

  // Per-tab counts (Req 14.4). `null`/undefined ⇒ Tabs renders no badge yet.
  const tabItems = [
    { key: 'videos', label: 'Videos', count: vLoading ? undefined : videos.length },
    { key: 'playlists', label: 'Playlists', count: playlistCount ?? undefined },
    { key: 'tweets', label: 'Tweets', count: tweetCount ?? undefined },
  ]

  return (
    <>
      {/* Cover */}
      <div className={styles.cover}>
        {profile.coverImage ? (
          <img className={styles.coverImg} src={profile.coverImage} alt="" />
        ) : (
          <div className={styles.coverPlaceholder} />
        )}
      </div>

      {/* Header */}
      <div className={styles.header}>
        <span className={styles.avatar}>
          <Avatar src={profile.avatar} name={profile.fullName} size={92} />
        </span>

        <div className={styles.info}>
          <h1 className={styles.name}>{profile.fullName}</h1>
          <div className={styles.handle}>@{profile.username}</div>
          <div className={styles.statsRow}>
            <span>{formatViews(profile.subscribersCount)} subscribers</span>
            <span className={styles.dot}>•</span>
            <span>{profile.channelsSubscribedToCount} subscriptions</span>
          </div>
        </div>

        <div className={styles.actions}>
          {isOwner ? (
            <Button variant="secondary" onClick={() => navigate('/settings')}>
              Customize Channel
            </Button>
          ) : (
            <Button variant="subscribe" active={subscribed} loading={subBusy} onClick={handleSubscribe}>
              {subscribed ? 'Subscribed' : 'Subscribe'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        className={styles.tabs}
        label="Channel sections"
        items={tabItems}
        active={activeTab}
        onChange={setTab}
      />

      {/* Tab content */}
      <div className={styles.tabContent} role="tabpanel">
        {activeTab === 'videos' && (
          vLoading ? (
            <div className={styles.grid}>
              {Array.from({ length: 8 }).map((_, i) => (
                <VideoCardSkeleton key={i} />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <EmptyState
              icon={<VideoGlyph />}
              title="No videos yet"
              subtitle="This channel hasn't uploaded any videos."
            />
          ) : (
            <div className={styles.grid}>
              {videos.map((v) => (
                <VideoCard key={v._id} video={v} hideAvatar />
              ))}
            </div>
          )
        )}

        {activeTab === 'playlists' && (
          <PlaylistsFeed userId={profile._id} onCount={setPlaylistCount} />
        )}

        {activeTab === 'tweets' && (
          <TweetsFeed userId={profile._id} isOwner={isOwner} onCount={setTweetCount} />
        )}
      </div>
    </>
  )
}
