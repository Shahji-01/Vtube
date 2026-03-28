import { useState, useEffect } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatViews, formatTimeAgo, getErrorMessage } from '../utils/formatters'
import { Link } from 'react-router-dom'
import Spinner from '../components/Spinner'

const EyeIcon   = () => <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const UsersIcon = () => <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
const LikeIcon  = () => <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
const FilmIcon  = () => <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
const TrashIcon = () => <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
const EditIcon  = () => <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>

function Toggle({ on, onChange }) {
  return (
    <button className={`toggle-switch ${on ? 'on' : ''}`} onClick={onChange} type="button">
      <div className="toggle-thumb" />
    </button>
  )
}

const STAT_CARDS = (stats) => [
  { label: 'Total Views',       value: stats?.totalVideoViews || 0,  Icon: EyeIcon,   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  { label: 'Subscribers',       value: stats?.totalSubscribers || 0, Icon: UsersIcon, color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  { label: 'Total Likes',       value: stats?.totalLikes || 0,       Icon: LikeIcon,  color: '#f472b6', bg: 'rgba(244,114,182,0.1)' },
  { label: 'Total Videos',      value: stats?.totalVideos || 0,      Icon: FilmIcon,  color: '#ff2d2d', bg: 'rgba(255,45,45,0.1)' },
]

export default function Dashboard() {
  const { user } = useAuth()
  const toast    = useToast()

  const [stats,   setStats]   = useState(null)
  const [videos,  setVideos]  = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [toggling, setToggling] = useState(null)
  const [editingVideo, setEditingVideo] = useState(null)
  
  // Edit form states
  const [editForm, setEditForm] = useState({ title: '', description: '' })
  const [editThumb, setEditThumb] = useState(null)
  const [editThumbPrev, setEditThumbPrev] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [sRes, vRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/videos'),
      ])
      setStats(sRes.data?.data)
      setVideos(vRes.data?.data || [])
    } catch {
      toast({ message: 'Failed to load dashboard', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleDelete = async (videoId) => {
    if (!confirm('Delete this video permanently?')) return
    setDeleting(videoId)
    try {
      await api.delete(`/videos/${videoId}`)
      setVideos(prev => prev.filter(v => v._id !== videoId))
      toast({ message: 'Video deleted', type: 'success' })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setDeleting(null)
    }
  }

  const handleToggle = async (video) => {
    setToggling(video._id)
    try {
      await api.patch(`/videos/toggle/publish/${video._id}`)
      setVideos(prev => prev.map(v => v._id === video._id ? { ...v, isPublished: !v.isPublished } : v))
      toast({ message: `Video is now ${video.isPublished ? 'private' : 'public'}`, type: 'success' })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setToggling(null)
    }
  }

  const openEdit = (video) => {
    setEditForm({ title: video.title, description: video.description })
    setEditThumb(null)
    setEditThumbPrev(video.thumbnail)
    setEditingVideo(video)
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editForm.title.trim() || !editForm.description.trim()) {
      return toast({ message: 'Title and description are required', type: 'error' })
    }
    setSavingEdit(true)
    try {
      const fd = new FormData()
      fd.append('title', editForm.title)
      fd.append('description', editForm.description)
      if (editThumb) fd.append('thumbnail', editThumb)
      
      const { data } = await api.patch(`/videos/v/${editingVideo._id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      const updatedVideo = data?.data || data
      setVideos(prev => prev.map(v => v._id === updatedVideo._id ? updatedVideo : v))
      toast({ message: 'Video updated successfully!', type: 'success' })
      setEditingVideo(null)
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setSavingEdit(false)
    }
  }

  const statCards = STAT_CARDS(stats)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Channel Dashboard</h1>
          <p className="page-sub">Manage your content and track performance</p>
        </div>
        <Link to="/upload">
          <button className="btn btn-primary">+ Upload Video</button>
        </Link>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="stat-card">
                <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 10 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="skeleton skeleton-line" style={{ width: 80, height: 32 }} />
                  <div className="skeleton skeleton-line" style={{ width: 120, height: 13 }} />
                </div>
              </div>
            ))
          : statCards.map(({ label, value, Icon, color, bg }) => (
              <div key={label} className="stat-card">
                <div className="stat-icon" style={{ background: bg, color }}>
                  <Icon />
                </div>
                <div>
                  <div className="stat-value" style={{ color }}>{formatViews(value)}</div>
                  <div className="stat-label">{label}</div>
                </div>
              </div>
            ))
        }
      </div>

      {/* Videos Table */}
      <div className="table-wrapper">
        <div className="table-head">
          <h2>Your Content</h2>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{videos.length} videos</span>
        </div>
        {loading ? (
          <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8 }} />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px 20px' }}>
            <h2 className="empty-title">No videos yet</h2>
            <p className="empty-sub">Upload your first video to get started!</p>
            <Link to="/upload"><button className="btn btn-primary" style={{ marginTop: 16 }}>Upload Video</button></Link>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Video</th>
                  <th>Visibility</th>
                  <th>Date</th>
                  <th>Views</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {videos.map(video => (
                  <tr key={video._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <img className="table-thumb" src={video.thumbnail} alt={video.title} />
                        <div>
                          <div className="table-video-title">{video.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {video.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Toggle
                          on={video.isPublished}
                          onChange={() => !toggling && handleToggle(video)}
                        />
                        <span className={`badge ${video.isPublished ? 'badge-green' : 'badge-gray'}`}>
                          {video.isPublished ? 'Public' : 'Private'}
                        </span>
                      </div>
                    </td>
                    <td>{formatTimeAgo(video.createdAt)}</td>
                    <td>{formatViews(video.views)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button 
                          className="btn btn-ghost btn-icon" 
                          title="Edit"
                          onClick={() => openEdit(video)}
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="btn btn-danger btn-icon"
                          title="Delete"
                          onClick={() => handleDelete(video._id)}
                          disabled={deleting === video._id}
                        >
                          {deleting === video._id ? <Spinner /> : <TrashIcon />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingVideo && (
        <div className="modal-overlay" onClick={(e) => { if(e.target === e.currentTarget && !savingEdit) setEditingVideo(null) }}>
          <div className="modal-content" style={{ maxWidth: 500, width: '90%' }}>
            <h2 style={{ marginBottom: 16 }}>Edit Video</h2>
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Title</label>
                <input 
                  className="input" 
                  value={editForm.title} 
                  onChange={e => setEditForm(f => ({...f, title: e.target.value}))} 
                />
              </div>
              <div className="input-group">
                <label className="input-label">Description</label>
                <textarea 
                  className="textarea" 
                  rows={4} 
                  value={editForm.description} 
                  onChange={e => setEditForm(f => ({...f, description: e.target.value}))} 
                />
              </div>
              <div className="input-group">
                <label className="input-label">Thumbnail</label>
                <div 
                  className="upload-zone" 
                  style={{ minHeight: 120, position: 'relative', overflow: 'hidden', padding: editThumbPrev ? 0 : 20 }}
                >
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={e => {
                      const file = e.target.files[0]
                      if(file) {
                        setEditThumb(file)
                        setEditThumbPrev(URL.createObjectURL(file))
                      }
                    }} 
                  />
                  {editThumbPrev ? (
                    <img src={editThumbPrev} alt="preview" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                  ) : (
                    <p style={{ marginTop: 20 }}>Click to change thumbnail</p>
                  )}
                  {editThumbPrev && (
                     <div style={{position: 'absolute', background: 'rgba(0,0,0,0.6)', color: 'white', bottom: 0, left: 0, right: 0, padding: '6px', textAlign: 'center', fontSize: 13, pointerEvents: 'none'}}>
                        Click to change image
                     </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingVideo(null)} disabled={savingEdit}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                  {savingEdit ? <Spinner /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.6); z-index: 9999;
          display: flex; align-items: center; justifyContent: center;
        }
        .modal-content {
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 16px; padding: 24px; margin: auto;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }
      `}</style>
    </>
  )
}
