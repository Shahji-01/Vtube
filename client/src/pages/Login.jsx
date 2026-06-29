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
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { announce } = useAnnouncer()

  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const validate = () => {
    const e = {}
    if (!form.email) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 6) e.password = 'Minimum 6 characters'
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
      await login({ email: form.email, password: form.password })
      toast({ message: 'Welcome back!', type: 'success' })
      navigate('/')
    } catch (err) {
      const message = getErrorMessage(err)
      toast({ message, type: 'error' })
      announce(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg}>
        <div className={styles.glow} />
      </div>

      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}><PlayIcon /></div>
          <h1 className={styles.title}>Sign in to VTube</h1>
          <p className={styles.sub}>Welcome back to your creator journey</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <Input
            id="login-email"
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
            autoComplete="email"
            error={errors.email}
          />

          <Input
            id="login-password"
            label="Password"
            type={showPw ? 'text' : 'password'}
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => handleChange('password', e.target.value)}
            autoComplete="current-password"
            error={errors.password}
            endAdornment={
              <button
                type="button"
                className={styles.pwToggle}
                onClick={() => setShowPw(p => !p)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                aria-pressed={showPw}
              >
                {showPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            }
          />

          <Button
            id="login-submit"
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            className={styles.submit}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        <div className={styles.footer}>
          New to VTube?{' '}
          <Link to="/register" className={styles.link}>Create an account</Link>
        </div>
      </div>
    </div>
  )
}
