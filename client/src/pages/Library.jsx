import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import VideoCard, { VideoCardSkeleton } from '../components/VideoCard'

export default function Library() {
  const { user } = useAuth()
  const toast = useToast()
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
    if (activeTab === 'tweets')  endpoint = `/tweets/user/${user._id}`

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
      toast({ message: 'Watch history cleared', type: 'success' })
    } catch (err) {
      toast({ message: 'Failed to clear history', type: 'error' })
    } finally {
      setClearing(false)
    }
  }

  const handleRemoveFromHistory = async (videoId) => {
    try {
      await api.delete(`/users/history/${videoId}`)
      setData(prev => prev.filter(v => v._id !== videoId))
      toast({ message: 'Removed from history', type: 'success' })
    } catch {
      toast({ message: 'Failed to remove from history', type: 'error' })
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
          {data.map(v => (
            <div key={v._id} style={{ position: 'relative' }} className="history-card-wrapper">
              <VideoCard video={v} />
              {activeTab === 'history' && (
                <button 
                  className="remove-history-btn" 
                  onClick={() => handleRemoveFromHistory(v._id)}
                  title="Remove from history"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .history-card-wrapper .remove-history-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          border: none;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: all 0.2s ease;
          z-index: 10;
        }
        .history-card-wrapper:hover .remove-history-btn {
          opacity: 1;
        }
        .remove-history-btn:hover {
          background: var(--red);
          transform: scale(1.1);
        }
      `}</style>
    </>
  )
}
