import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/axios'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'
import Spinner from '../components/Spinner'

const VideoIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 44, height: 44, stroke: 'currentColor', fill: 'none', strokeWidth: 1.5 }}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
)

export default function Home() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)

  const observer = useRef()
  const lastElementRef = useCallback(node => {
    if (loading || fetchingMore) return
    if (observer.current) observer.current.disconnect()
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1)
      }
    }, { rootMargin: '200px' })
    if (node) observer.current.observe(node)
  }, [loading, fetchingMore, hasMore])

  useEffect(() => {
    const fetchVideos = async () => {
      if (page === 1) setLoading(true)
      else setFetchingMore(true)

      try {
        const { data } = await api.get(`/videos?limit=12&page=${page}&sortBy=createdAt&sortType=desc`)
        const fetchedDocs = data?.data?.docs || data?.data || []
        
        setVideos(prev => {
          if (page === 1) return fetchedDocs
          // De-duplicate items automatically to prevent overlapping key warnings
          const existingIds = new Set(prev.map(v => v._id))
          const newDocs = fetchedDocs.filter(v => !existingIds.has(v._id))
          return [...prev, ...newDocs]
        })

        // If backend tells us it lacks 'hasNextPage', fallback to predicting via array length.
        setHasMore(data?.data?.hasNextPage ?? fetchedDocs.length === 12)
      } catch (err) {
        if (page === 1) setError('Failed to load videos')
      } finally {
        setLoading(false)
        setFetchingMore(false)
      }
    }

    fetchVideos()
  }, [page])

  if (loading) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-title">Recommended</h1>
            <p className="page-sub">Freshest videos for you</p>
          </div>
        </div>
        <div className="video-grid">
          {Array.from({ length: 12 }).map((_, i) => <VideoCardSkeleton key={i} />)}
        </div>
      </>
    )
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon" style={{ borderColor: 'rgba(255,45,45,0.2)' }}>
          <svg viewBox="0 0 24 24" style={{ stroke: 'var(--red)' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h2 className="empty-title">Failed to Load</h2>
        <p className="empty-sub">{error}. Please refresh the page.</p>
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <VideoIcon />
        </div>
        <h2 className="empty-title">It's quiet here…</h2>
        <p className="empty-sub">No videos published yet. Be the first to upload!</p>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Recommended</h1>
          <p className="page-sub">Endless videos curated just for you</p>
        </div>
      </div>
      <div className="video-grid">
        {videos.map((v, index) => {
          if (videos.length === index + 1) {
             return <div ref={lastElementRef} key={v._id}><VideoCard video={v} /></div>
          } else {
             return <VideoCard key={v._id} video={v} />
          }
        })}
      </div>
      {fetchingMore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0' }}>
          <Spinner />
        </div>
      )}
      {!hasMore && videos.length > 0 && (
         <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40, marginBottom: 20 }}>
            You've reached the end!
         </div>
      )}
    </>
  )
}
