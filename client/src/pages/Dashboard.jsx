import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useToast } from '../context/ToastContext'
import {
  formatViews,
  formatTimeAgo,
  getErrorMessage,
  secureUrl,
} from '../utils/formatters'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import styles from './Dashboard.module.css'

/* ── Decorative icons (token-colored + sized via the consuming module) ── */
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const LikeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
)
const FilmIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="17" x2="22" y2="17" />
    <line x1="17" y1="7" x2="22" y2="7" />
  </svg>
)
const MsgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)
const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)
const VideoGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <polygon points="10 9 15 12 10 15 10 9" fill="currentColor" stroke="none" />
  </svg>
)

/* StatCard — composed from primitives/tokens (icon + value + label). */
function StatCard({ label, value, icon, tone }) {
  return (
    <div className={`${styles.statCard} ${styles[tone]}`}>
      <span className={styles.statIcon}>{icon}</span>
      <div className={styles.statBody}>
        <span className={styles.statValue}>{formatViews(value)}</span>
        <span className={styles.statLabel}>{label}</span>
      </div>
    </div>
  )
}

/* Token-driven publish toggle (presentation via module classes only). */
function Toggle({ on, disabled, onChange, label }) {
  return (
    <button
      type="button"
      className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-label={label}
    >
      <span className={styles.toggleThumb} />
    </button>
  )
}

const buildStatCards = (stats) => [
  { label: 'Total Views', value: stats?.totalVideoViews || 0, icon: <EyeIcon />, tone: 'toneInfo' },
  { label: 'Subscribers', value: stats?.totalSubscribers || 0, icon: <UsersIcon />, tone: 'toneSuccess' },
  { label: 'Total Likes', value: stats?.totalLikes || 0, icon: <LikeIcon />, tone: 'toneDanger' },
  { label: 'Total Videos', value: stats?.totalVideos || 0, icon: <FilmIcon />, tone: 'toneBrand' },
  { label: 'Total Comments', value: stats?.totalComments || 0, icon: <MsgIcon />, tone: 'toneWarning' },
]

export default function Dashboard() {
  const toast = useToast()
  const navigate = useNavigate()

  const [stats, setStats] = useState(null)
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(null)

  // Delete confirmation flow (Modal-gated): the target video + in-flight flag.
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Edit flow
  const [editingVideo, setEditingVideo] = useState(null)
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

  useEffect(() => {
    fetchData()
    // Runs once on mount. `fetchData` is a per-render closure intended only for
    // this initial load, so it is deliberately excluded from the dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Delete only proceeds after the user confirms inside the Modal (Req 14.10).
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/videos/${deleteTarget._id}`)
      setVideos((prev) => prev.filter((v) => v._id !== deleteTarget._id))
      toast({ message: 'Video deleted', type: 'success' })
      setDeleteTarget(null)
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const handleToggle = async (video) => {
    setToggling(video._id)
    try {
      await api.patch(`/videos/toggle/publish/${video._id}`)
      setVideos((prev) =>
        prev.map((v) => (v._id === video._id ? { ...v, isPublished: !v.isPublished } : v))
      )
      toast({
        message: `Video is now ${video.isPublished ? 'private' : 'public'}`,
        type: 'success',
      })
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setToggling(null)
    }
  }

  const openEdit = (video) => {
    setEditForm({ title: video.title, description: video.description })
    setEditThumb(null)
    setEditThumbPrev(secureUrl(video.thumbnail))
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

      const { data } = await api.patch(`/videos/${editingVideo._id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      const updatedVideo = data?.data || data
      setVideos((prev) => prev.map((v) => (v._id === updatedVideo._id ? updatedVideo : v)))
      toast({ message: 'Video updated successfully!', type: 'success' })
      setEditingVideo(null)
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setSavingEdit(false)
    }
  }

  const statCards = buildStatCards(stats)

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Channel Dashboard</h1>
          <p className={styles.subtitle}>Manage your content and track performance</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/upload')}>
          + Upload Video
        </Button>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.statCard}>
                <Skeleton width={44} height={44} radius="var(--radius-md)" />
                <div className={styles.statBody}>
                  <Skeleton width={72} height={22} />
                  <Skeleton width={96} height={12} />
                </div>
              </div>
            ))
          : statCards.map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      {/* Channel videos */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Your Content</h2>
          {!loading && <span className={styles.panelCount}>{videos.length} videos</span>}
        </div>

        {loading ? (
          <div className={styles.skeletonList}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={68} radius="var(--radius-md)" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <EmptyState
            icon={<VideoGlyph />}
            title="No videos yet"
            subtitle="Upload your first video to get started."
            action={
              <Button variant="primary" onClick={() => navigate('/upload')}>
                Upload Video
              </Button>
            }
          />
        ) : (
          <div className={styles.list}>
            {videos.map((video) => (
              <div key={video._id} className={styles.row}>
                <div className={styles.rowMain}>
                  <img
                    className={styles.thumb}
                    src={secureUrl(video.thumbnail)}
                    alt=""
                    loading="lazy"
                  />
                  <div className={styles.rowInfo}>
                    <span className={styles.videoTitle}>{video.title}</span>
                    <span className={styles.videoDesc}>{video.description}</span>
                    <div className={styles.metaRow}>
                      <span
                        className={`${styles.badge} ${
                          video.isPublished ? styles.badgePublic : styles.badgePrivate
                        }`}
                      >
                        {video.isPublished ? 'Public' : 'Private'}
                      </span>
                      <span className={styles.metaItem}>{formatViews(video.views)} views</span>
                      <span className={styles.dot}>•</span>
                      <span className={styles.metaItem}>{formatTimeAgo(video.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.actions}>
                  <Toggle
                    on={video.isPublished}
                    disabled={toggling === video._id}
                    onChange={() => toggling !== video._id && handleToggle(video)}
                    label={`Toggle visibility for ${video.title}`}
                  />
                  <IconButton
                    size="sm"
                    label={`Edit ${video.title}`}
                    onClick={() => openEdit(video)}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={`Delete ${video.title}`}
                    onClick={() => setDeleteTarget(video)}
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Delete confirmation Modal (removes only after confirm — Req 14.10) */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete video"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>
          Permanently delete{' '}
          <span className={styles.confirmTitle}>{deleteTarget?.title}</span>? This action cannot be
          undone.
        </p>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={Boolean(editingVideo)}
        onClose={() => !savingEdit && setEditingVideo(null)}
        title="Edit Video"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingVideo(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button variant="primary" loading={savingEdit} onClick={handleEditSubmit}>
              Save Changes
            </Button>
          </>
        }
      >
        <form id="dashboard-edit-form" className={styles.editForm} onSubmit={handleEditSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="edit-title">
              Title
            </label>
            <input
              id="edit-title"
              className={styles.input}
              value={editForm.title}
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="edit-desc">
              Description
            </label>
            <textarea
              id="edit-desc"
              className={styles.textarea}
              rows={4}
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Thumbnail</span>
            <label className={styles.thumbZone}>
              <input
                className={styles.thumbInput}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) {
                    setEditThumb(file)
                    setEditThumbPrev(URL.createObjectURL(file))
                  }
                }}
              />
              {editThumbPrev ? (
                <>
                  <img className={styles.thumbPreview} src={editThumbPrev} alt="Thumbnail preview" />
                  <span className={styles.thumbCaption}>Click to change image</span>
                </>
              ) : (
                <span className={styles.thumbHint}>Click to upload a thumbnail</span>
              )}
            </label>
          </div>
        </form>
      </Modal>
    </>
  )
}
