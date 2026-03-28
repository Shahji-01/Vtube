import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'
import Spinner from '../components/Spinner'

export default function Search() {
  const [params] = useSearchParams()
  const q = params.get('q') || ''

  const [videos,  setVideos]  = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortType, setSortType] = useState('desc')

  const observer = useRef()
  const lastElementRef = useCallback(node => {
    if (loading || fetchingMore) return
    if (observer.current) observer.current.disconnect()
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prev => prev + 1)
      }
    }, { rootMargin: '200px' })
    if (node) observer.current.observe(node)
  }, [loading, fetchingMore, hasMore])

  useEffect(() => {
    setPage(1)
    setVideos([])
    setHasMore(true)
  }, [q, sortBy, sortType])

  useEffect(() => {
    if (!q.trim()) { setVideos([]); return }

    const fetchResults = async () => {
      if (page === 1) setLoading(true)
      else setFetchingMore(true)

      try {
        const { data } = await api.get(`/videos?query=${encodeURIComponent(q)}&limit=12&page=${page}&sortBy=${sortBy}&sortType=${sortType}`)
        const docs = data?.data?.docs || data?.data || []

        setVideos(prev => {
           if (page === 1) return docs
           const existingIds = new Set(prev.map(v => v._id))
           return [...prev, ...docs.filter(v => !existingIds.has(v._id))]
        })
        setHasMore(data?.data?.hasNextPage ?? docs.length === 12)
      } catch {
        setError('Search failed. Please try again.')
      } finally {
        setLoading(false)
        setFetchingMore(false)
      }
    }

    fetchResults()
  }, [q, page, sortBy, sortType])

  return (
    <>
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">
            {q ? `Results for "${q}"` : 'Search'}
          </h1>
          {!loading && videos.length > 0 && (
            <p className="page-sub">{videos.length} videos found</p>
          )}
        </div>
        
        {q.trim() && (
          <div style={{ display: 'flex', gap: 10 }}>
            <select 
               className="input" 
               style={{ width: 140, height: 34, fontSize: 13, padding: '0 8px' }}
               value={`${sortBy}-${sortType}`}
               onChange={(e) => {
                  const [by, type] = e.target.value.split('-')
                  setSortBy(by)
                  setSortType(type)
               }}
            >
               <option value="createdAt-desc">Newest</option>
               <option value="createdAt-asc">Oldest</option>
               <option value="views-desc">Most Views</option>
               <option value="duration-desc">Duration</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="video-grid">
          {Array.from({ length: 12 }).map((_, i) => <VideoCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="empty-state">
          <h2 className="empty-title">Search Error</h2>
          <p className="empty-sub">{error}</p>
        </div>
      ) : !q.trim() ? (
        <div className="empty-state">
          <h2 className="empty-title">Start searching</h2>
          <p className="empty-sub">Type something in the search bar above.</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-title">No results for "{q}"</h2>
          <p className="empty-sub">Try different keywords or check your spelling.</p>
        </div>
      ) : (
        <>
          <div className="video-grid">
            {videos.map((v, i) => {
               if(videos.length === i + 1) return <div ref={lastElementRef} key={v._id}><VideoCard video={v} /></div>
               return <VideoCard key={v._id} video={v} />
            })}
          </div>
          {fetchingMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0' }}>
              <Spinner />
            </div>
          )}
        </>
      )}
    </>
  )
}
