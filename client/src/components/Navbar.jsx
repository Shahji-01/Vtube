import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import Avatar from './Avatar'
import NotificationsDropdown from './NotificationsDropdown'

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'white' }}>
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
)

const MenuIcon = () => (
  <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
)

const SearchIcon = () => (
  <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
)

const UploadIcon = () => (
  <svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
)

const BellIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
)

const UserIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
)

const DashIcon = () => (
  <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
)

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
)

const SunIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
)

export default function Navbar({ sidebarOpen, onToggleSidebar }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [searchQ, setSearchQ] = useState('')
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQ.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQ.trim())}`)
    }
  }

  const handleLogout = () => {
    setDropOpen(false)
    logout()
  }

  return (
    <nav className="navbar">
      {/* Left */}
      <div className="navbar-left">
        <button className="menu-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <MenuIcon />
        </button>
        <Link to="/" className="logo">
          <div className="logo-icon"><PlayIcon /></div>
          <span className="logo-text">VTube</span>
        </Link>
      </div>

      {/* Center: Search */}
      <form className="search-form" onSubmit={handleSearch}>
        <div className="search-input-wrap">
          <input
            className="search-input"
            type="search"
            placeholder="Search videos..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            aria-label="Search"
          />
        </div>
        <button type="submit" className="search-btn" aria-label="Submit search">
          <SearchIcon />
        </button>
      </form>

      {/* Right */}
      <div className="navbar-right">
        {user ? (
          <>
            <Link to="/upload">
              <button className="icon-btn" title="Upload">
                <UploadIcon />
              </button>
            </Link>
            <NotificationsDropdown />
            <button className="icon-btn" title="Toggle Theme" onClick={toggleTheme}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <div className="dropdown" ref={dropRef}>
              <button
                className="user-avatar-btn"
                onClick={() => setDropOpen(prev => !prev)}
                aria-label="User menu"
              >
                <Avatar src={user.avatar} name={user.fullName} size={34} />
              </button>
              {dropOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <div className="dropdown-name">{user.fullName}</div>
                    <div className="dropdown-username">@{user.username}</div>
                  </div>
                  <Link to={`/channel/${user.username}`} onClick={() => setDropOpen(false)}>
                    <button className="dropdown-item">
                      <UserIcon /> Your Channel
                    </button>
                  </Link>
                  <Link to="/dashboard" onClick={() => setDropOpen(false)}>
                    <button className="dropdown-item">
                      <DashIcon /> Dashboard
                    </button>
                  </Link>
                  <div className="dropdown-sep" />
                  <button className="dropdown-item danger" onClick={handleLogout}>
                    <LogoutIcon /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <button className="icon-btn" title="Toggle Theme" onClick={toggleTheme} style={{ marginRight: 4 }}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <Link to="/login">
              <button className="btn-signin">
                <UserIcon /> Sign In
              </button>
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}
