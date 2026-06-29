import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useToast } from '../context/ToastContext'
import { getErrorMessage } from '../utils/formatters'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import styles from './Upload.module.css'

/* Decorative inline SVG icons. Sizing comes from CSS classes (no inline
   presentational styles); color is inherited from the parent via
   `stroke="currentColor"`. */
const FilmIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
  </svg>
)
const ImageIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
)
const CheckIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const UploadCloudIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
)

/**
 * DropZone — custom file-selection target styled via the Upload CSS Module.
 *
 * A full-bleed transparent file input overlays the zone so the entire surface
 * is clickable. When a file is chosen the zone shows a check icon + the file
 * name and size; an optional `preview` image (thumbnails) fills the zone.
 */
function DropZone({ id, label, accept, file, onChange, description, icon: Icon, required, preview, error }) {
  const hasFile = Boolean(file)
  const zoneClasses = [
    styles.dropZone,
    hasFile ? styles.hasFile : '',
    preview ? styles.hasPreview : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.field}>
      <label className={styles.dropLabel} htmlFor={id}>
        <Icon className={styles.labelIcon} />
        {label}
        {required && <span className={styles.required} aria-hidden="true"> *</span>}
      </label>
      <div className={zoneClasses}>
        <input id={id} className={styles.fileInput} type="file" accept={accept} onChange={onChange} />
        {preview ? (
          <img className={styles.preview} src={preview} alt={`${label} preview`} />
        ) : (
          <>
            {hasFile
              ? <CheckIcon className={styles.dropIcon} />
              : <Icon className={styles.dropIcon} />}
            <h4 className={styles.dropTitle}>
              {hasFile ? file.name : `Click or drag ${label.toLowerCase()}`}
            </h4>
            <p className={styles.dropDesc}>
              {hasFile ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : description}
            </p>
          </>
        )}
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}

export default function Upload() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [form, setForm] = useState({ title: '', description: '' })
  const [videoFile, setVideoFile]   = useState(null)
  const [thumbnail, setThumbnail]   = useState(null)
  const [thumbPreview, setThumbPrev] = useState(null)
  const [errors, setErrors]         = useState({})
  const [loading, setLoading]       = useState(false)
  const [progress, setProgress]     = useState(0)

  const validate = () => {
    const e = {}
    if (!form.title.trim())   e.title       = 'Title is required'
    if (!form.description.trim()) e.description = 'Description is required'
    if (!videoFile)           e.videoFile   = 'Please select a video file'
    if (!thumbnail)           e.thumbnail   = 'Please select a thumbnail'
    return e
  }

  const handleChange = (key, val) => {
    setForm(p => ({ ...p, [key]: val }))
    if (errors[key]) setErrors(p => { const e = { ...p }; delete e[key]; return e })
  }

  const handleThumbnail = (e) => {
    const f = e.target.files[0]
    setThumbnail(f)
    if (f) setThumbPrev(URL.createObjectURL(f))
    if (errors.thumbnail) setErrors(p => { const e = { ...p }; delete e.thumbnail; return e })
  }

  const handleVideo = (e) => {
    setVideoFile(e.target.files[0] || null)
    if (errors.videoFile) setErrors(p => { const e = { ...p }; delete e.videoFile; return e })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    setProgress(0)

    try {
      const fd = new FormData()
      fd.append('title', form.title.trim())
      fd.append('description', form.description.trim())
      fd.append('videoFile', videoFile)
      fd.append('thumbnail', thumbnail)

      const { data } = await api.post('/videos', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          setProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      toast({ message: 'Video published successfully! 🎉', type: 'success' })
      navigate(`/watch/${data?.data?._id}`)
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Upload Video</h1>
          <p className={styles.sub}>Share your creative work with the world</p>
        </div>
      </div>

      <div className={styles.page}>
        <form className={styles.card} onSubmit={handleSubmit} noValidate>

          {/* File Uploads */}
          <div className={styles.grid}>
            <DropZone
              id="upload-video-file"
              label="Video File"
              accept="video/*"
              file={videoFile}
              icon={FilmIcon}
              description="MP4, WebM, MOV"
              required
              onChange={handleVideo}
              error={errors.videoFile}
            />

            <DropZone
              id="upload-thumbnail"
              label="Thumbnail"
              accept="image/*"
              file={thumbnail}
              icon={ImageIcon}
              description="JPG, PNG, WebP"
              required
              preview={thumbPreview}
              onChange={handleThumbnail}
              error={errors.thumbnail}
            />
          </div>

          <div className={styles.separator} />

          {/* Details */}
          <div className={styles.details}>
            <Input
              id="upload-title"
              label="Title"
              required
              placeholder="Give your video a catchy title…"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              error={errors.title}
            />

            <div className={styles.field}>
              <label className={styles.label} htmlFor="upload-description">
                Description
                <span className={styles.required} aria-hidden="true"> *</span>
              </label>
              <textarea
                id="upload-description"
                className={`${styles.textarea} ${errors.description ? styles.textareaError : ''}`}
                placeholder="Tell viewers what your video is about…"
                value={form.description}
                aria-invalid={errors.description ? true : undefined}
                onChange={(e) => handleChange('description', e.target.value)}
              />
              {errors.description && <span className={styles.error}>{errors.description}</span>}
            </div>
          </div>

          {/* Progress Bar */}
          {loading && progress > 0 && (
            <div className={styles.progress}>
              <div className={styles.progressHead}>
                <span>Uploading…</span><span>{progress}%</span>
              </div>
              <div className={styles.progressTrack}>
                <div className={styles.progressBar} style={{ '--upload-progress': `${progress}%` }} />
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <Button
              id="upload-submit"
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={loading}
              iconLeft={<UploadCloudIcon className={styles.btnIcon} />}
            >
              {loading
                ? `Uploading…${progress > 0 ? ` ${progress}%` : ''}`
                : 'Publish Video'}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
