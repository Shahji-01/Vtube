import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'

export default function Library() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'history'

  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [clearing, setClearing] = useState(false)

  const TABS = [
    { id: 'history',  label: 'Watch History' },
    { id: 'liked',    label: 'Liked Videos'  },
    { id: 'tweets',   label: 'Tweets'        },
  ]

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError(null)

    let endpoint = ''
    if (activeTab === 'history') endpoint = '/users/history'
    if (activeTab === 'liked')   endpoint = '/likes/videos'
    if (activeTab === 'tweets')  endpoint = '/tweets/'

    api.get(endpoint)
      .then(({ data: d }) => setData(d?.data?.docs || d?.data || []))
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [activeTab, user])

  const setTab = (tab) => setSearchParams({ tab })

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear your entire watch history? This cannot be undone.')) return
    
    setClearing(true)
    try {
      await api.delete('/users/history')
      setData([])
      showToast('Watch history cleared', 'success')
    } catch (err) {
      showToast('Failed to clear history', 'error')
    } finally {
      setClearing(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Library</h1>
        {activeTab === 'history' && data.length > 0 && (
          <button 
            className="btn-outline danger" 
            style={{ padding: '6px 14px', fontSize: 13 }}
            onClick={handleClearHistory}
            disabled={clearing}
          >
            {clearing ? 'Clearing...' : 'Clear Watch History'}
          </button>
        )}
      </div>

      <div className="tabs-nav" style={{ marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${activeTab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {!user ? (
        <div className="empty-state">
          <h2 className="empty-title">Sign in to view your library</h2>
          <p className="empty-sub">Your watch history and liked videos will appear here.</p>
        </div>
      ) : loading ? (
        <div className="video-grid">
          {Array.from({ length: 8 }).map((_, i) => <VideoCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="empty-state">
          <h2 className="empty-title">Failed to Load</h2>
          <p className="empty-sub">{error}</p>
        </div>
      ) : data.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-title">Nothing here yet</h2>
          <p className="empty-sub">
            {activeTab === 'history' ? "Videos you watch will appear here."
             : activeTab === 'liked' ? "Videos you like will appear here."
             : "Tweets will appear here."}
          </p>
        </div>
      ) : activeTab === 'tweets' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.map(tweet => (
            <div key={tweet._id} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 18px'
            }}>
              <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.6 }}>{tweet.content}</p>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
                by @{tweet.owner?.username}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="video-grid">
          {data.map(v => <VideoCard key={v._id} video={v} />)}
        </div>
      )}
    </>
  )
}
