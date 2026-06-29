import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'
import Spinner from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import styles from './Search.module.css'

/* Inline-style-free icons for the empty/error states (decorative, token-colored
   via the EmptyState module). */
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const ErrorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

/**
 * Search Page_View.
 *
 * Renders results as VideoCard `list` layout at >= 768px viewport width and
 * `grid` layout below 768px (Req 14.5). The entered query text is preserved in
 * every render state — header, loading, empty, and error (Req 14.6, 14.7).
 *
 * Render-state exclusivity (Req 9.1): exactly one of skeleton / content / empty
 * / error shows at any time. A failed initial request shows an error EmptyState
 * with a Retry control (Req 9.5); activating Retry returns to the skeleton state
 * and refetches the initial data (Req 9.6).
 *
 * The sort select behavior and the existing API call shape
 * (GET /videos?query=…) plus infinite-scroll pagination are preserved unchanged.
 */
export default function Search() {
  const [params] = useSearchParams()
  const q = params.get('q') || ''

  const [videos,  setVideos]  = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)

  // Discovery filters (all additive; passed through to GET /api/v1/videos only
  // when set). `sortBy` defaults to 'relevance' when a query is present; the
  // date-range and duration-bucket filters are empty by default, so a search
  // with no filters issues the same request as before (Req 2.4, 2.5, 2.6).
  const [sortBy, setSortBy] = useState('relevance')
  const [uploadDateFrom, setUploadDateFrom] = useState('')
  const [uploadDateTo, setUploadDateTo] = useState('')
  const [durationBucket, setDurationBucket] = useState('')

  // Bumped by Retry to force the initial request to run again even when the
  // query/sort inputs are unchanged (Req 9.6).
  const [reloadKey, setReloadKey] = useState(0)

  // Responsive layout: list at >= 768px, grid below (Req 14.5). Tracked via a
  // matchMedia listener so the layout prop and container styling stay in sync.
  const [isWide, setIsWide] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia('(min-width: 768px)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handleChange = (e) => setIsWide(e.matches)
    setIsWide(mq.matches)
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  const layout = isWide ? 'list' : 'grid'

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

  // Reset paging/results whenever the query or any filter changes.
  useEffect(() => {
    setPage(1)
    setVideos([])
    setHasMore(true)
    setError(null)
  }, [q, sortBy, uploadDateFrom, uploadDateTo, durationBucket])

  useEffect(() => {
    if (!q.trim()) { setVideos([]); setLoading(false); return }

    const fetchResults = async () => {
      if (page === 1) {
        // Returning to the skeleton state for the initial request (incl. Retry).
        setLoading(true)
        setError(null)
      } else {
        setFetchingMore(true)
      }

      try {
        // Build the request with the existing query/pagination plus any active
        // filters. Only params with a value are included so an unfiltered search
        // issues the same request shape as before.
        const sp = new URLSearchParams()
        sp.set('query', q)
        sp.set('limit', '12')
        sp.set('page', String(page))
        if (sortBy) sp.set('sortBy', sortBy)
        if (uploadDateFrom) sp.set('uploadDateFrom', uploadDateFrom)
        if (uploadDateTo) sp.set('uploadDateTo', uploadDateTo)
        if (durationBucket) sp.set('durationBucket', durationBucket)

        const { data } = await api.get(`/videos?${sp.toString()}`)
        const docs = data?.data?.docs || data?.data || []

        setVideos(prev => {
           if (page === 1) return docs
           const existingIds = new Set(prev.map(v => v._id))
           return [...prev, ...docs.filter(v => !existingIds.has(v._id))]
        })
        setHasMore(data?.data?.hasNextPage ?? docs.length === 12)
      } catch (err) {
        // A failed initial request drops any partial content and surfaces the
        // error state; a failed pagination request keeps existing items. An
        // invalid-filter rejection (400) gets a friendlier, filter-specific hint.
        if (page === 1) {
          setVideos([])
          setError(
            err?.response?.status === 400
              ? 'Some of your filters look invalid. Adjust the date range, duration, or sort and try again.'
              : 'We couldn\u2019t complete your search. Please try again.'
          )
        }
      } finally {
        setLoading(false)
        setFetchingMore(false)
      }
    }

    fetchResults()
  }, [q, page, sortBy, uploadDateFrom, uploadDateTo, durationBucket, reloadKey])

  // Retry: clear the error and re-run the initial request, which flips the page
  // back to the skeleton state before refetching (Req 9.6).
  const handleRetry = () => {
    setError(null)
    setVideos([])
    setHasMore(true)
    setLoading(true)
    if (page !== 1) setPage(1)
    setReloadKey(k => k + 1)
  }

  const resultsClass = `${styles.results} ${isWide ? styles.listLayout : styles.gridLayout}`

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {q ? `Results for "${q}"` : 'Search'}
          </h1>
          {!loading && !error && videos.length > 0 && (
            <p className={styles.sub}>{videos.length} videos found</p>
          )}
        </div>

        {q.trim() && (
          <div className={styles.controls}>
            <label className={styles.filter}>
               <span className={styles.filterLabel}>From</span>
               <input
                  type="date"
                  className={styles.dateInput}
                  value={uploadDateFrom}
                  max={uploadDateTo || undefined}
                  aria-label="Uploaded from date"
                  onChange={(e) => setUploadDateFrom(e.target.value)}
               />
            </label>

            <label className={styles.filter}>
               <span className={styles.filterLabel}>To</span>
               <input
                  type="date"
                  className={styles.dateInput}
                  value={uploadDateTo}
                  min={uploadDateFrom || undefined}
                  aria-label="Uploaded to date"
                  onChange={(e) => setUploadDateTo(e.target.value)}
               />
            </label>

            <select
               className={styles.sortSelect}
               value={durationBucket}
               aria-label="Filter by duration"
               onChange={(e) => setDurationBucket(e.target.value)}
            >
               <option value="">Any length</option>
               <option value="short">Short (under 4 min)</option>
               <option value="medium">Medium (4–20 min)</option>
               <option value="long">Long (over 20 min)</option>
            </select>

            <select
               className={styles.sortSelect}
               value={sortBy}
               aria-label="Sort results"
               onChange={(e) => setSortBy(e.target.value)}
            >
               <option value="relevance">Relevance</option>
               <option value="date">Date</option>
               <option value="views">Views</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className={`${styles.results} ${styles.gridLayout}`}>
          {Array.from({ length: 12 }).map((_, i) => <VideoCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={<ErrorIcon />}
          title="Search failed"
          subtitle={`${error}${q.trim() ? ` Your search for "${q}" was not completed.` : ''}`}
          action={
            <Button variant="primary" onClick={handleRetry}>
              Retry
            </Button>
          }
        />
      ) : !q.trim() ? (
        <EmptyState
          icon={<SearchIcon />}
          title="Start searching"
          subtitle="Type something in the search bar above to find videos."
        />
      ) : videos.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title={`No results for "${q}"`}
          subtitle="Try different keywords or check your spelling."
        />
      ) : (
        <>
          <div className={resultsClass}>
            {videos.map((v, i) => {
               if (videos.length === i + 1) {
                  return (
                    <div ref={lastElementRef} key={v._id}>
                      <VideoCard video={v} layout={layout} />
                    </div>
                  )
               }
               return <VideoCard key={v._id} video={v} layout={layout} />
            })}
          </div>
          {fetchingMore && (
            <div className={styles.loadingMore}>
              <Spinner />
            </div>
          )}
          {!hasMore && videos.length > 0 && (
            <p className={styles.end}>You&rsquo;ve reached the end of the results.</p>
          )}
        </>
      )}
    </>
  )
}
