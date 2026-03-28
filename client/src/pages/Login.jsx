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
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)
const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

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
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    try {
      await login({ email: form.email, password: form.password })
      toast({ message: 'Welcome back!', type: 'success' })
      navigate('/')
    } catch (err) {
      toast({ message: getErrorMessage(err), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-bg-glow" />
      </div>

      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><PlayIcon /></div>
          <h1 className="auth-title">Sign in to VTube</h1>
          <p className="auth-sub">Welcome back to your creator journey</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="input-group">
            <label className="input-label">Email address</label>
            <input
              id="login-email"
              className={`input ${errors.email ? 'error' : ''}`}
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              autoComplete="email"
            />
            {errors.email && <span className="input-error">{errors.email}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                className={`input ${errors.password ? 'error' : ''}`}
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                autoComplete="current-password"
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
              >
                {showPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.password && <span className="input-error">{errors.password}</span>}
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-lg w-full"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? <><Spinner /> Signing in…</> : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          New to VTube?{' '}
          <Link to="/register" className="auth-link">Create an account</Link>
        </div>
      </div>
    </div>
  )
}
