import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'
import Skeleton from '../components/ui/Skeleton'
import KebabMenu from '../components/ui/KebabMenu'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import styles from './PlaylistView.module.css'

const ListIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
)

const RemoveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

export default function PlaylistView() {
  const { playlistId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [playlist, setPlaylist] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data } = await api.get(`/playlist/${playlistId}`)
        setPlaylist(data?.data || null)
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load playlist')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [playlistId])

  // Remove a video from this playlist (PATCH /playlist/remove/:videoId/:playlistId).
  const handleRemoveFromPlaylist = async (videoId) => {
    try {
      await api.patch(`/playlist/remove/${videoId}/${playlistId}`)
      setPlaylist((prev) =>
        prev
          ? { ...prev, videos: prev.videos.filter((v) => v._id !== videoId) }
          : prev
      )
      toast({ message: 'Removed from playlist', type: 'success' })
    } catch {
      toast({ message: 'Failed to remove from playlist', type: 'error' })
    }
  }

  if (loading) {
    return (
      <div>
        <Skeleton width="40%" height={32} className={styles.skelHead} />
        <div className={styles.list}>
          {Array.from({ length: 6 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error || !playlist) {
    return (
      <EmptyState
        tone="error"
        title="Playlist unavailable"
        subtitle={error || 'This playlist might be private or deleted.'}
        action={
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        }
      />
    )
  }

  const videos = playlist.videos || []
  const isOwner = Boolean(user) && String(playlist.owner) === String(user._id)

  return (
    <>
      <div className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.badge} aria-hidden="true">
            <ListIcon />
          </span>
          <div>
            <h1 className={styles.title}>{playlist.playlist || playlist.name}</h1>
            {playlist.description && (
              <p className={styles.description}>{playlist.description}</p>
            )}
          </div>
        </div>
        <div className={styles.count}>{videos.length} videos</div>
      </div>

      {videos.length > 0 ? (
        <div className={styles.list}>
          {videos.map((v) => (
            <VideoCard
              key={v._id}
              video={v}
              layout="list"
              menu={
                isOwner ? (
                  <KebabMenu
                    items={[
                      {
                        label: 'Remove from playlist',
                        tone: 'danger',
                        icon: <RemoveIcon />,
                        onSelect: () => handleRemoveFromPlaylist(v._id),
                      },
                    ]}
                  />
                ) : null
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="This playlist is empty"
          subtitle="Videos added to this playlist will appear here."
        />
      )}
    </>
  )
}
