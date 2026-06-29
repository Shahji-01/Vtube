import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useAnnouncer } from '../context/AnnouncerContext'
import { getErrorMessage } from '../utils/formatters'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import styles from './Auth.module.css'

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)
const UploadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

function FileDropZone({ label, required, accept, onChange, file, error }) {
  const errorId = error ? `${label.replace(/\s+/g, '-').toLowerCase()}-error` : undefined
  return (
    <div className={styles.uploadGroup}>
      <span className={styles.label}>
        {label}
        {required && <span className={styles.required} aria-hidden="true"> *</span>}
      </span>
      <div className={`${styles.uploadZone} ${file ? styles.hasFile : ''}`}>
        <input
          className={styles.uploadInput}
          type="file"
          accept={accept}
          onChange={onChange}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
        <div className={styles.uploadIcon}>{file ? <CheckIcon /> : <UploadIcon />}</div>
        <p className={styles.uploadName}>{file ? file.name : 'Click or drag to upload'}</p>
        <p className={styles.uploadHint}>
          {file
            ? `${(file.size / 1024).toFixed(1)} KB`
            : accept.replace(/image\/\*/, 'Images').replace(/video\/\*/, 'Videos')}
        </p>
      </div>
      {error && <span id={errorId} className={styles.error}>{error}</span>}
    </div>
  )
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { announce } = useAnnouncer()

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
    if (Object.keys(errs).length) {
      setErrors(errs)
      announce('Please correct the highlighted fields and try again.')
      return
    }

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
      const message = getErrorMessage(err)
      toast({ message, type: 'error' })
      announce(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${styles.page} ${styles.pageScroll}`}>
      <div className={styles.bg}>
        <div className={styles.glow} />
      </div>

      <div className={`${styles.card} ${styles.cardWide}`}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}><PlayIcon /></div>
          <h1 className={styles.title}>Join VTube</h1>
          <p className={styles.sub}>Start sharing your videos with the world</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.row}>
            <Input
              id="reg-fullname"
              label="Full Name"
              required
              placeholder="John Doe"
              value={form.fullName}
              onChange={(e) => handleChange('fullName', e.target.value)}
              error={errors.fullName}
            />
            <Input
              id="reg-username"
              label="Username"
              required
              placeholder="johndoe"
              value={form.username}
              onChange={(e) => handleChange('username', e.target.value)}
              error={errors.username}
            />
          </div>

          <Input
            id="reg-email"
            label="Email address"
            required
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
            error={errors.email}
          />

          <Input
            id="reg-password"
            label="Password"
            required
            type="password"
            placeholder="Min 6 characters"
            value={form.password}
            onChange={(e) => handleChange('password', e.target.value)}
            error={errors.password}
          />

          <div className={styles.row}>
            <FileDropZone
              label="Avatar Image"
              required
              accept="image/*"
              file={avatar}
              error={errors.avatar}
              onChange={(e) => {
                setAvatar(e.target.files[0] || null)
                if (errors.avatar) setErrors(prev => { const er = { ...prev }; delete er.avatar; return er })
              }}
            />
            <FileDropZone
              label="Cover Image"
              accept="image/*"
              file={coverImage}
              onChange={(e) => setCoverImage(e.target.files[0] || null)}
            />
          </div>

          <Button
            id="reg-submit"
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            className={styles.submit}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </Button>
        </form>

        <div className={styles.footer}>
          Already have an account?{' '}
          <Link to="/login" className={styles.link}>Sign In</Link>
        </div>
      </div>
    </div>
  )
}
