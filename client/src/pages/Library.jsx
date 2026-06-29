import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatTimeAgo } from '../utils/formatters'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'
import Tabs from '../components/ui/Tabs'
import KebabMenu from '../components/ui/KebabMenu'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import styles from './Library.module.css'

/* Decorative icons (token-colored via the consuming module). */
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6L17.5 20.5A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20.5L5 6m3-3h8" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

const LibraryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <polygon points="11 12 15 14 11 16 11 12" fill="currentColor" stroke="none" />
  </svg>
)

const TABS = [
  { key: 'history', label: 'Watch History' },
  { key: 'liked', label: 'Liked Videos' },
  { key: 'watch-later', label: 'Watch Later' },
  { key: 'tweets', label: 'Tweets' },
]

const EMPTY_COPY = {
  history: 'Videos you watch will appear here.',
  liked: 'Videos you like will appear here.',
  'watch-later': 'Videos you save to Watch Later will appear here.',
  tweets: 'Tweets will appear here.',
}

export default function Library() {
  const { user } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeTab = TABS.some((t) => t.key === requestedTab) ? requestedTab : 'history'

  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError(null)

    let endpoint = ''
    if (activeTab === 'history') endpoint = '/users/history'
    if (activeTab === 'liked') endpoint = '/likes/videos'
    if (activeTab === 'watch-later') endpoint = '/watch-later'
    if (activeTab === 'tweets') endpoint = `/tweets/user/${user._id}`

    api
      .get(endpoint)
      .then(({ data: d }) => {
        // Watch Later returns entries shaped { _id, user, video, createdAt }
        // with `video` populated — map to the underlying video docs for the grid.
        if (activeTab === 'watch-later') {
          setData((d?.data || []).map((entry) => entry.video).filter(Boolean))
        } else {
          setData(d?.data?.docs || d?.data || [])
        }
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [activeTab, user])

  const setTab = (tab) => setSearchParams({ tab })

  const handleClearHistory = async () => {
    if (
      !window.confirm(
        'Are you sure you want to clear your entire watch history? This cannot be undone.'
      )
    )
      return

    setClearing(true)
    try {
      await api.delete('/users/history')
      setData([])
      toast({ message: 'Watch history cleared', type: 'success' })
    } catch {
      toast({ message: 'Failed to clear history', type: 'error' })
    } finally {
      setClearing(false)
    }
  }

  // Remove a single video from watch history (DELETE /users/history/:videoId).
  const handleRemoveFromHistory = async (videoId) => {
    try {
      await api.delete(`/users/history/${videoId}`)
      setData((prev) => prev.filter((v) => v._id !== videoId))
      toast({ message: 'Removed from history', type: 'success' })
    } catch {
      toast({ message: 'Failed to remove from history', type: 'error' })
    }
  }

  // Remove a video from Liked Videos by toggling the like off
  // (POST /likes/toggle/v/:videoId).
  const handleRemoveFromLiked = async (videoId) => {
    try {
      await api.post(`/likes/toggle/v/${videoId}`)
      setData((prev) => prev.filter((v) => v._id !== videoId))
      toast({ message: 'Removed from liked videos', type: 'success' })
    } catch {
      toast({ message: 'Failed to remove video', type: 'error' })
    }
  }

  // Build the kebab menu for a video card based on the active tab. Each menu
  // exposes exactly one item-removal action backed by an existing endpoint.
  const menuFor = (video) => {
    if (activeTab === 'history') {
      return (
        <KebabMenu
          items={[
            {
              label: 'Remove from history',
              tone: 'danger',
              icon: <TrashIcon />,
              onSelect: () => handleRemoveFromHistory(video._id),
            },
          ]}
        />
      )
    }
    if (activeTab === 'liked') {
      return (
        <KebabMenu
          items={[
            {
              label: 'Remove from liked videos',
              tone: 'danger',
              icon: <TrashIcon />,
              onSelect: () => handleRemoveFromLiked(video._id),
            },
          ]}
        />
      )
    }
    return null
  }

  let content
  if (!user) {
    content = (
      <EmptyState
        icon={<LibraryIcon />}
        title="Sign in to view your library"
        subtitle="Your watch history and liked videos will appear here."
      />
    )
  } else if (loading) {
    content = (
      <div className={styles.grid}>
        {Array.from({ length: 8 }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    )
  } else if (error) {
    content = (
      <EmptyState tone="error" title="Failed to load" subtitle={error} />
    )
  } else if (data.length === 0) {
    content = (
      <EmptyState
        icon={<LibraryIcon />}
        title="Nothing here yet"
        subtitle={EMPTY_COPY[activeTab]}
      />
    )
  } else if (activeTab === 'tweets') {
    content = (
      <div className={styles.tweets}>
        {data.map((tweet) => (
          <div key={tweet._id} className={styles.tweet}>
            <p className={styles.tweetContent}>{tweet.content}</p>
            <span className={styles.tweetMeta}>
              by @{tweet.owner?.username} • {formatTimeAgo(tweet.createdAt)}
            </span>
          </div>
        ))}
      </div>
    )
  } else {
    content = (
      <div className={styles.grid}>
        {data.map((v) => (
          <VideoCard key={v._id} video={v} menu={menuFor(v)} />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Library</h1>
        {activeTab === 'history' && data.length > 0 && (
          <Button
            variant="danger"
            size="sm"
            loading={clearing}
            onClick={handleClearHistory}
          >
            {clearing ? 'Clearing…' : 'Clear Watch History'}
          </Button>
        )}
      </div>

      <Tabs
        items={TABS}
        active={activeTab}
        onChange={setTab}
        label="Library sections"
        className={styles.tabsRow}
      />

      {content}
    </>
  )
}
