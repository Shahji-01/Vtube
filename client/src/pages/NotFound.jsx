import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 120,
        fontFamily: 'var(--font-display)',
        fontWeight: 900,
        lineHeight: 1,
        background: 'linear-gradient(135deg, var(--red) 0%, rgba(255,45,45,0.2) 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        marginBottom: 16,
      }}>
        404
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', marginBottom: 8 }}>
        Page Not Found
      </h1>
      <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 28, maxWidth: 360 }}>
        This page doesn't exist or was removed. Let's get you back to something great.
      </p>
      <Link to="/">
        <button className="btn btn-primary btn-lg">← Back to Home</button>
      </Link>
    </div>
  )
}
