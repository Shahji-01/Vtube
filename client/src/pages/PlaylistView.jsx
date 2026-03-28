import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'

const ListIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
)

export default function PlaylistView() {
  const { playlistId } = useParams()
  const navigate = useNavigate()
  
  const [playlist, setPlaylist] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    api.get(`/playlist/${playlistId}`)
      .then(({ data }) => setPlaylist(data?.data || null))
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load playlist'))
      .finally(() => setLoading(false))
  }, [playlistId])

  if (loading) {
    return (
      <div style={{ padding: '20px 0' }}>
        <div className="skeleton skeleton-line" style={{ width: '40%', height: 32, marginBottom: 20 }} />
        <div className="video-grid">
           {Array.from({ length: 8 }).map((_, i) => <VideoCardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (error || !playlist) {
    return (
      <div className="empty-state">
        <h2 className="empty-title">Playlist Unavailable</h2>
        <p className="empty-sub">{error || 'This playlist might be private or deleted.'}</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>Go Back</button>
      </div>
    )
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'var(--red)', padding: 12, borderRadius: 12, color: 'white' }}><ListIcon /></div>
          <div>
            <h1 className="page-title">{playlist.playlist || playlist.name}</h1>
            <p className="page-sub" style={{ marginTop: 4 }}>{playlist.description}</p>
          </div>
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {playlist.videos?.length || 0} videos
        </div>
      </div>

      {playlist.videos?.length > 0 ? (
        <div className="video-grid" style={{ marginTop: 24 }}>
          {playlist.videos.map(v => (
            <VideoCard key={v._id} video={v} />
          ))}
        </div>
      ) : (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <h2 className="empty-title">This playlist is empty</h2>
          <p className="empty-sub">Videos added to this playlist will appear here.</p>
        </div>
      )}
    </>
  )
}
