import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useToast } from '../context/ToastContext'
import { getErrorMessage } from '../utils/formatters'
import Spinner from '../components/Spinner'

const FilmIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 32, height: 32, stroke: 'currentColor', fill: 'none', strokeWidth: 1.5 }}>
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
    <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
  </svg>
)
const ImageIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 32, height: 32, stroke: 'currentColor', fill: 'none', strokeWidth: 1.5 }}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 32, height: 32, stroke: 'var(--red)', fill: 'none', strokeWidth: 2.5 }}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const UploadCloudIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
)

function DropZone({ label, accept, file, onChange, description, icon: Icon, required }) {
  return (
    <div className="input-group">
      <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon style={undefined} />
        {label}
        {required && <span style={{ color: 'var(--red)' }}>*</span>}
      </label>
      <div className={`upload-zone ${file ? 'has-file' : ''}`} style={{ minHeight: 140 }}>
        <input type="file" accept={accept} onChange={onChange} />
        <div className="upload-icon">{file ? <CheckIcon /> : <Icon />}</div>
        <h4 style={{ marginTop: 6 }}>{file ? file.name : `Click or drag ${label.toLowerCase()}`}</h4>
        <p>{file
              ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
              : description
           }</p>
      </div>
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Upload Video</h1>
          <p className="page-sub">Share your creative work with the world</p>
        </div>
      </div>

      <div className="upload-page">
        <form className="upload-card" onSubmit={handleSubmit} noValidate>

          {/* File Uploads */}
          <div className="upload-grid">
            <div>
              <DropZone
                label="Video File"
                accept="video/*"
                file={videoFile}
                icon={FilmIcon}
                description="MP4, WebM, MOV"
                required
                onChange={(e) => {
                  setVideoFile(e.target.files[0] || null)
                  if (errors.videoFile) setErrors(p => { const e = { ...p }; delete e.videoFile; return e })
                }}
              />
              {errors.videoFile && <span className="input-error">{errors.videoFile}</span>}
            </div>

            <div>
              <div className="input-group">
                <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ImageIcon style={undefined} /> Thumbnail <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <div
                  className={`upload-zone ${thumbnail ? 'has-file' : ''}`}
                  style={{ minHeight: 140, padding: thumbPreview ? 0 : undefined, overflow: 'hidden' }}
                >
                  <input type="file" accept="image/*" onChange={handleThumbnail} />
                  {thumbPreview ? (
                    <img src={thumbPreview} alt="Thumbnail preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <>
                      <div className="upload-icon"><ImageIcon /></div>
                      <h4 style={{ marginTop: 6 }}>Click or drag thumbnail</h4>
                      <p>JPG, PNG, WebP</p>
                    </>
                  )}
                </div>
                {errors.thumbnail && <span className="input-error">{errors.thumbnail}</span>}
              </div>
            </div>
          </div>

          <div className="upload-sep" />

          {/* Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="input-group">
              <label className="input-label">Title <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                id="upload-title"
                className={`input ${errors.title ? 'error' : ''}`}
                placeholder="Give your video a catchy title…"
                style={{ height: 50, fontSize: 16 }}
                value={form.title}
                onChange={(e) => handleChange('title', e.target.value)}
              />
              {errors.title && <span className="input-error">{errors.title}</span>}
            </div>

            <div className="input-group">
              <label className="input-label">Description <span style={{ color: 'var(--red)' }}>*</span></label>
              <textarea
                id="upload-description"
                className={`textarea ${errors.description ? 'error' : ''}`}
                placeholder="Tell viewers what your video is about…"
                style={{ minHeight: 160 }}
                value={form.description}
                onChange={(e) => handleChange('description', e.target.value)}
              />
              {errors.description && <span className="input-error">{errors.description}</span>}
            </div>
          </div>

          {/* Progress Bar */}
          {loading && progress > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
                <span>Uploading…</span><span>{progress}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'var(--red)', borderRadius: 4, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              id="upload-submit"
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ gap: 10 }}
            >
              {loading ? <><Spinner /> Uploading… {progress > 0 && `${progress}%`}</> : <><UploadCloudIcon /> Publish Video</>}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
