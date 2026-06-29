import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/axios'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'
import Chip from '../components/ui/Chip'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { getPageState, PAGE_STATE } from '../utils/pageState'
import styles from './Home.module.css'

const PAGE_SIZE = 12

/**
 * Feed filter chips. Each chip maps to the existing `sortBy`/`sortType` query
 * params only — no new categories or recommendation logic (design assumption).
 * Selecting a chip resets paging to page 1 and refetches the feed.
 */
const FILTERS = [
  { id: 'recent', label: 'Recent', sortBy: 'createdAt', sortType: 'desc' },
  { id: 'popular', label: 'Popular', sortBy: 'views', sortType: 'desc' },
  { id: 'oldest', label: 'Oldest', sortBy: 'createdAt', sortType: 'asc' },
]

/** Decorative glyphs for the empty / error placeholders. */
const VideoGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
)

const ErrorGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

export default function Home() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)

  // Active feed filter (chip selection). Drives sortBy/sortType in the query.
  const [filterId, setFilterId] = useState(FILTERS[0].id)
  // Bumped to force a refetch of the current page (used by the error retry).
  const [reloadKey, setReloadKey] = useState(0)

  const activeFilter = FILTERS.find((f) => f.id === filterId) || FILTERS[0]

  // ── Infinite scroll: observe the last card and advance the page ─────────
  const observer = useRef()
  const lastElementRef = useCallback(
    (node) => {
      if (loading || fetchingMore) return
      if (observer.current) observer.current.disconnect()
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore && !moreError) {
            setPage((prev) => prev + 1)
          }
        },
        { rootMargin: '200px' }
      )
      if (node) observer.current.observe(node)
    },
    [loading, fetchingMore, hasMore, moreError]
  )

  useEffect(() => {
    let cancelled = false
    const { sortBy, sortType } = activeFilter

    const fetchVideos = async () => {
      if (page === 1) {
        setLoading(true)
        setError(null)
      } else {
        setFetchingMore(true)
        setMoreError(false)
      }

      try {
        const { data } = await api.get(
          `/videos?limit=${PAGE_SIZE}&page=${page}&sortBy=${sortBy}&sortType=${sortType}`
        )
        if (cancelled) return

        const fetchedDocs = data?.data?.docs || data?.data || []

        setVideos((prev) => {
          if (page === 1) return fetchedDocs
          // De-duplicate to avoid overlapping React keys across pages.
          const existingIds = new Set(prev.map((v) => v._id))
          const newDocs = fetchedDocs.filter((v) => !existingIds.has(v._id))
          return [...prev, ...newDocs]
        })

        // Fall back to predicting "more" from the page size when the backend
        // does not provide hasNextPage.
        setHasMore(data?.data?.hasNextPage ?? fetchedDocs.length === PAGE_SIZE)
      } catch {
        if (cancelled) return
        // Page 1 failure surfaces as a full error state; later pages keep the
        // existing items and show an inline retry under the grid.
        if (page === 1) setError('Failed to load videos')
        else setMoreError(true)
      } finally {
        if (!cancelled) {
          setLoading(false)
          setFetchingMore(false)
        }
      }
    }

    fetchVideos()
    return () => {
      cancelled = true
    }
    // activeFilter is derived from filterId; depending on filterId keeps the
    // effect stable while still refetching when the selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterId, reloadKey])

  /** Select a filter chip: reset to page 1 and refetch with the new sort. */
  const selectFilter = (id) => {
    if (id === filterId) return
    setFilterId(id)
    setVideos([])
    setHasMore(true)
    setMoreError(false)
    setPage(1)
  }

  /** Retry the initial feed load (page 1) after an error. */
  const retryInitial = () => {
    setVideos([])
    setHasMore(true)
    setPage(1)
    setReloadKey((k) => k + 1)
  }

  /** Retry the failed pagination request for the current page. */
  const retryMore = () => {
    setMoreError(false)
    setReloadKey((k) => k + 1)
  }

  const state = getPageState({ loading, error, items: videos })

  const filterBar = (
    <div className={styles.filterBar}>
      <div className={styles.chips} role="group" aria-label="Filter videos">
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            label={f.label}
            selected={f.id === filterId}
            onClick={() => selectFilter(f.id)}
          />
        ))}
      </div>
    </div>
  )

  return (
    <div className={styles.home}>
      {filterBar}

      {state === PAGE_STATE.SKELETON && (
        <div className={styles.grid}>
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      )}

      {state === PAGE_STATE.ERROR && (
        <EmptyState
          tone="error"
          icon={<ErrorGlyph />}
          title="Failed to load"
          subtitle={`${error}. Please try again.`}
          action={
            <Button variant="primary" onClick={retryInitial}>
              Retry
            </Button>
          }
        />
      )}

      {state === PAGE_STATE.EMPTY && (
        <EmptyState
          icon={<VideoGlyph />}
          title="It's quiet here…"
          subtitle="No videos published yet. Be the first to upload!"
        />
      )}

      {state === PAGE_STATE.CONTENT && (
        <>
          <div className={styles.grid}>
            {videos.map((v, index) =>
              index === videos.length - 1 ? (
                <div ref={lastElementRef} key={v._id}>
                  <VideoCard video={v} />
                </div>
              ) : (
                <VideoCard key={v._id} video={v} />
              )
            )}
          </div>

          {fetchingMore && (
            <div className={styles.more}>
              <Spinner />
            </div>
          )}

          {moreError && (
            <div className={styles.more}>
              <Button variant="secondary" onClick={retryMore}>
                Couldn't load more — Retry
              </Button>
            </div>
          )}

          {!hasMore && !moreError && (
            <div className={styles.end}>You've reached the end!</div>
          )}
        </>
      )}
    </div>
  )
}
