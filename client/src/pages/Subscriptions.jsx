import { useState, useEffect } from 'react'
import api from '../api/axios'
import VideoCard from '../components/ui/VideoCard'
import { VideoCardSkeleton } from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import styles from './Subscriptions.module.css'

/** Decorative glyphs for the empty / error placeholders. */
const ChannelsGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const ErrorGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

export default function Subscriptions() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Initial state already starts as loading=true / error=null, so the fetch
    // updates state only from its async callbacks (no synchronous setState in
    // the effect body). This effect runs once on mount.
    api.get('/subscriptions/videos')
      .then(({ data }) => setVideos(data?.data || []))
      .catch(() => setError('Failed to load subscriptions feed'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Subscriptions</h1>
          <p className={styles.subtitle}>Latest videos from your favorite channels</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 12 }).map((_, i) => <VideoCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={<ErrorGlyph />}
          title="Feed unavailable"
          subtitle={error}
        />
      ) : videos.length === 0 ? (
        <EmptyState
          icon={<ChannelsGlyph />}
          title="You haven't subscribed to anyone yet"
          subtitle="Find channels you love and their latest videos will show up here."
        />
      ) : (
        <div className={styles.grid}>
          {videos.map(v => <VideoCard key={v._id} video={v} />)}
        </div>
      )}
    </>
  )
}
