import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getErrorMessage } from '../utils/formatters'
import Spinner from '../components/Spinner'

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: 'white' }}>
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
)
const UploadIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 28, height: 28, stroke: 'currentColor', fill: 'none', strokeWidth: 1.5 }}>
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 28, height: 28, stroke: 'var(--red)', fill: 'none', strokeWidth: 2 }}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

function FileDropZone({ label, required, accept, onChange, file }) {
  return (
    <div className="input-group">
      <label className="input-label">{label}{required && <span style={{ color: 'var(--red)' }}> *</span>}</label>
      <div className={`upload-zone ${file ? 'has-file' : ''}`}>
        <input type="file" accept={accept} onChange={onChange} />
        <div className="upload-icon">{file ? <CheckIcon /> : <UploadIcon />}</div>
        <h4>{file ? file.name : 'Click or drag to upload'}</h4>
        <p>{file ? `${(file.size / 1024).toFixed(1)} KB` : accept.replace(/image\/\*/,'Images').replace(/video\/\*/,'Videos')}</p>
      </div>
    </div>
  )
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState({ username: '', fullName: '', email: '', password: '' })
  const [avatar, setAvatar] = useState(null)
  const [coverImage, setCoverImage] = useState(null)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const e = {}
    if (!form.username || form.username.length < 3) e.username = 'Min 3 characters'
    if (!form.fullName || form.fullName.length < 2) e.fullName = 'Full name required'
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required'
    if (!form.password || form.password.length < 6) e.password = 'Min 6 characters'
    if (!avatar) e.avatar = 'Avatar image is required'
    return e
  }

  const handleChange = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }))
    if (errors[key]) setErrors(prev => { const e = { ...prev }; delete e[key]; return e })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('username', form.username.toLowerCase().trim())
      fd.append('fullName', form.fullName.trim())
      fd.append('email', form.email.toLowerCase().trim())
      fd.append('password', form.password)
      fd.append('avatar', avatar)
      if (coverImage) fd.append('coverImage', coverImage)

      await register(fd)
      toast({ message: 'Account created! Please sign in.', type: 'success' })
      navigate('/login')
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page" style={{ padding: '32px 24px' }}>
      <div className="auth-bg">
        <div className="auth-bg-glow" />
      </div>

      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-logo">
          <div className="auth-logo-icon"><PlayIcon /></div>
          <h1 className="auth-title">Join VTube</h1>
          <p className="auth-sub">Start sharing your videos with the world</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">Full Name<span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                id="reg-fullname"
                className={`input ${errors.fullName ? 'error' : ''}`}
                placeholder="John Doe"
                value={form.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
              />
              {errors.fullName && <span className="input-error">{errors.fullName}</span>}
            </div>
            <div className="input-group">
              <label className="input-label">Username<span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                id="reg-username"
                className={`input ${errors.username ? 'error' : ''}`}
                placeholder="johndoe"
                value={form.username}
                onChange={(e) => handleChange('username', e.target.value)}
              />
              {errors.username && <span className="input-error">{errors.username}</span>}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Email address<span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              id="reg-email"
              className={`input ${errors.email ? 'error' : ''}`}
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
            {errors.email && <span className="input-error">{errors.email}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Password<span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              id="reg-password"
              className={`input ${errors.password ? 'error' : ''}`}
              type="password"
              placeholder="Min 6 characters"
              value={form.password}
              onChange={(e) => handleChange('password', e.target.value)}
            />
            {errors.password && <span className="input-error">{errors.password}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <FileDropZone
                label="Avatar Image"
                required
                accept="image/*"
                file={avatar}
                onChange={(e) => {
                  setAvatar(e.target.files[0] || null)
                  if (errors.avatar) setErrors(prev => { const e = { ...prev }; delete e.avatar; return e })
                }}
              />
              {errors.avatar && <span className="input-error">{errors.avatar}</span>}
            </div>
            <FileDropZone
              label="Cover Image"
              accept="image/*"
              file={coverImage}
              onChange={(e) => setCoverImage(e.target.files[0] || null)}
            />
          </div>

          <button
            id="reg-submit"
            type="submit"
            className="btn btn-primary btn-lg w-full"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? <><Spinner /> Creating account…</> : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">Sign In</Link>
        </div>
      </div>
    </div>
  )
}
