import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatViews, formatTimeAgo, getErrorMessage } from '../utils/formatters'
import Avatar from '../components/Avatar'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
    <polyline points="3 6 5 6 21 6"/><path d="M19 6L17.5 20.5A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20.5L5 6m3-3h8"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
  </svg>
)

function TweetsFeed({ userId, isOwner }) {
  const [tweets, setTweets] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTweet, setNewTweet] = useState('')
  const [posting, setPosting] = useState(false)
  const toast = useToast()

  useEffect(() => {
    setLoading(true)
    api.get(`/tweets/user/${userId}`)
      .then(({data}) => setTweets(data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId])

  const handlePost = async (e) => {
    e.preventDefault()
    if (!newTweet.trim()) return
    setPosting(true)
    try {
      const { data } = await api.post('/tweets', { content: newTweet })
      setTweets(prev => [data.data, ...prev])
      setNewTweet('')
      toast({ message: 'Tweet posted', type: 'success' })
    } catch (err) {
      toast({ message: 'Failed to post tweet', type: 'error' })
    } finally {
      setPosting(false)
    }
  }

  const handleDeleteTweet = async (tweetId) => {
    if(!window.confirm('Delete this tweet?')) return
    try {
      await api.delete(`/tweets/${tweetId}`)
      setTweets(prev => prev.filter(t => t._id !== tweetId))
      toast({ message: 'Tweet deleted', type: 'success' })
    } catch {
      toast({ message: 'Failed to delete tweet', type: 'error' })
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Loading tweets...</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isOwner && (
        <form onSubmit={handlePost} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <input 
            className="input" 
            placeholder="Write a tweet..." 
            value={newTweet} 
            onChange={e => setNewTweet(e.target.value)} 
            style={{ flex: 1 }}
            disabled={posting}
          />
          <button type="submit" className="btn btn-primary" disabled={posting || !newTweet.trim()}>
            {posting ? 'Posting...' : 'Post'}
          </button>
        </form>
      )}
      {tweets.length === 0 ? (
        <div className="empty-state"><p className="empty-sub">No tweets yet.</p></div>
      ) : (
        tweets.map(t => (
          <div key={t._id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.6, flex: 1 }}>{t.content}</p>
              {isOwner && (
                <button onClick={() => handleDeleteTweet(t._id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, marginLeft: 12 }} title="Delete">
                  <TrashIcon />
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{formatTimeAgo(t.createdAt)}</div>
          </div>
        ))
      )}
    </div>
  )
}

function PlaylistsFeed({ userId }) {
  const [playlists, setPlaylists] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    api.get(`/playlist/user/${userId}`)
      .then(({data}) => setPlaylists(data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) return <div style={{ padding: 20 }}>Loading playlists...</div>

  if (playlists.length === 0) {
    return <div className="empty-state"><p className="empty-sub">No playlists created.</p></div>
  }

  return (
    <div className="video-grid">
      {playlists.map(p => (
        <div key={p._id} onClick={() => navigate(`/playlist/${p._id}`)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}>
          <div style={{ aspectRatio: '16/9', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Playlist</span>
          </div>
          <div style={{ padding: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Channel() {
  const { username } = useParams()
  const { user }     = useAuth()
  const toast        = useToast()
  const navigate     = useNavigate()

  const [profile, setProfile]   = useState(null)
  const [videos, setVideos]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [vLoading, setVLoading] = useState(false)
  const [subscribed, setSub]    = useState(false)
  const [activeTab, setTab]     = useState('videos')

  useEffect(() => {
    setLoading(true)
    api.get(`/users/c/${username}`)
      .then(async ({ data }) => {
        const prof = data?.data
        setProfile(prof)
        setSub(prof?.isSubscribed || false)
        setVLoading(true)
        const vRes = await api.get(`/videos?userId=${prof._id}&limit=20`)
        setVideos(vRes.data?.data?.docs || vRes.data?.data || [])
      })
      .catch(() => toast({ message: 'Channel not found', type: 'error' }))
      .finally(() => { setLoading(false); setVLoading(false) })
  }, [username])

  const handleSubscribe = async () => {
    if (!user) { toast({ message: 'Sign in to subscribe', type: 'error' }); return }
    try {
      await api.post(`/subscriptions/toggle/c/${profile._id}`)
      setSub(p => !p)
      toast({ message: subscribed ? 'Unsubscribed' : 'Subscribed!', type: 'success' })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    }
  }

  if (loading) {
    return (
      <>
        <div className="skeleton" style={{ height: 200, borderRadius: 20, marginBottom: 0 }} />
        <div style={{ display: 'flex', gap: 20, marginTop: 16, padding: '0 4px' }}>
          <div className="skeleton" style={{ width: 96, height: 96, borderRadius: '50%', marginTop: -40 }} />
          <div style={{ flex: 1, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="skeleton skeleton-line" style={{ width: 200, height: 22 }} />
            <div className="skeleton skeleton-line" style={{ width: 140, height: 14 }} />
          </div>
        </div>
      </>
    )
  }

  if (!profile) {
    return (
      <div className="empty-state">
        <h2 className="empty-title">Channel Not Found</h2>
      </div>
    )
  }

  const isOwner = user?.username === profile.username

  return (
    <>
      {/* Cover */}
      <div className="channel-cover">
        {profile.coverImage
          ? <img src={profile.coverImage} alt="cover" />
          : <div className="channel-cover-placeholder" />
        }
      </div>

      {/* Header row */}
      <div className="channel-header">
        <div className="channel-avatar-lg">
          <Avatar src={profile.avatar} name={profile.fullName} size={92} />
        </div>

        <div className="channel-info">
          <h1 className="channel-name">{profile.fullName}</h1>
          <div className="channel-handle">@{profile.username}</div>
          <div className="channel-stats-row">
            <span>{formatViews(profile.subscribersCount)} subscribers</span>
            <span>•</span>
            <span>{profile.channelsSubscribedToCount} subscriptions</span>
          </div>
        </div>

        <div style={{ paddingTop: 54 }}>
          {isOwner ? (
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/settings')}
            >
              Customize Channel
            </button>
          ) : (
            <button
              className={`btn btn-subscribe ${subscribed ? 'subscribed' : ''}`}
              onClick={handleSubscribe}
            >
              {subscribed ? 'Subscribed ✓' : 'Subscribe'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-nav">
        {['videos', 'playlists', 'tweets'].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'videos' && (
          vLoading ? (
            <div className="video-grid">
              {Array.from({ length: 8 }).map((_, i) => <VideoCardSkeleton key={i} />)}
            </div>
          ) : videos.length === 0 ? (
            <div className="empty-state">
              <h2 className="empty-title">No videos yet</h2>
              <p className="empty-sub">This channel hasn't uploaded any videos.</p>
            </div>
          ) : (
            <div className="video-grid">
              {videos.map(v => <VideoCard key={v._id} video={v} hideAvatar />)}
            </div>
          )
        )}
        {activeTab === 'playlists' && (
          <PlaylistsFeed userId={profile._id} />
        )}
        {activeTab === 'tweets' && (
          <TweetsFeed userId={profile._id} isOwner={isOwner} />
        )}
      </div>
    </>
  )
}
