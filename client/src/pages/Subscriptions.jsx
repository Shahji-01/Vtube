import { useState, useEffect } from 'react'
import api from '../api/axios'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'

export default function Subscriptions() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    
    api.get('/subscriptions/videos')
      .then(({ data }) => setVideos(data?.data || []))
      .catch(() => setError('Failed to load subscriptions feed'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Subscriptions</h1>
        <p className="page-sub">Latest videos from your favorite channels</p>
      </div>

      {loading ? (
        <div className="video-grid">
          {Array.from({ length: 12 }).map((_, i) => <VideoCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="empty-state">
          <h2 className="empty-title">Feed unavailable</h2>
          <p className="empty-sub">{error}</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-title">You haven't subscribed to anyone yet</h2>
          <p className="empty-sub">Find channels you love and their latest videos will show up here.</p>
        </div>
      ) : (
        <div className="video-grid" style={{ marginTop: 24 }}>
          {videos.map(v => <VideoCard key={v._id} video={v} />)}
        </div>
      )}
    </>
  )
}
