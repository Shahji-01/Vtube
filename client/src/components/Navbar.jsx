import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import useFocusTrap from '../hooks/useFocusTrap'
import IconButton from './ui/IconButton'
import Button from './ui/Button'
import Avatar from './ui/Avatar'
import NotificationsDropdown from './NotificationsDropdown'
import styles from './Navbar.module.css'

/* ── Icons ───────────────────────────────────────────────
   Presentation comes from SVG functional attributes (fill / stroke /
   stroke-width) and the consuming CSS — never from inline `style`. */

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
)

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
)

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const DashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
)

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

export default function Navbar({ sidebarOpen, onToggleSidebar }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const [searchQ, setSearchQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)

  // Search autocomplete state (additive — submit behavior is unchanged).
  const [suggestions, setSuggestions] = useState([])
  const [suggestOpen, setSuggestOpen] = useState(false)

  const dropRef = useRef(null)
  const menuRef = useRef(null)
  const overlayInputRef = useRef(null)
  const inlineSearchRef = useRef(null)
  const overlaySearchRef = useRef(null)

  // Focus trapping + Escape-to-close for the account dropdown (Req 7.10).
  useFocusTrap(menuRef, dropOpen, () => setDropOpen(false))

  // Close the account dropdown on an outside pointer press.
  useEffect(() => {
    if (!dropOpen) return undefined
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropOpen])

  // Move focus into the mobile search overlay when it opens; Escape closes it.
  useEffect(() => {
    if (!searchOpen) return undefined
    overlayInputRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [searchOpen])

  // Debounced search autocomplete: query suggestions ~250ms after typing
  // stops. On any request failure we silently collapse to no suggestions —
  // autocomplete is a non-essential enhancement and never surfaces an error.
  useEffect(() => {
    const q = searchQ.trim()
    if (!q) {
      setSuggestions([])
      setSuggestOpen(false)
      return undefined
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/videos/search/suggestions', { params: { q } })
        if (cancelled) return
        const list = Array.isArray(data?.data?.suggestions) ? data.data.suggestions : []
        setSuggestions(list)
        setSuggestOpen(list.length > 0)
      } catch {
        if (cancelled) return
        setSuggestions([])
        setSuggestOpen(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQ])

  // Close the suggestions dropdown on an outside pointer press.
  useEffect(() => {
    if (!suggestOpen) return undefined
    const handler = (e) => {
      const inInline = inlineSearchRef.current?.contains(e.target)
      const inOverlay = overlaySearchRef.current?.contains(e.target)
      if (!inInline && !inOverlay) setSuggestOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [suggestOpen])

  const handleSearch = (e) => {
    e.preventDefault()
    const q = searchQ.trim()
    if (q) {
      setSuggestOpen(false)
      navigate(`/search?q=${encodeURIComponent(q)}`)
      setSearchOpen(false)
    }
  }

  // Clicking a suggestion fills the input and navigates to the existing
  // search route (same destination as a manual submit).
  const handleSuggestionPick = (suggestion) => {
    setSearchQ(suggestion)
    setSuggestOpen(false)
    setSearchOpen(false)
    navigate(`/search?q=${encodeURIComponent(suggestion)}`)
  }

  const renderSuggestions = (idBase) =>
    suggestOpen && suggestions.length > 0 ? (
      <ul className={styles.suggestions} role="listbox" aria-label="Search suggestions">
        {suggestions.map((s, i) => (
          <li key={`${idBase}-${i}`} role="option" aria-selected="false">
            <button
              type="button"
              className={styles.suggestionItem}
              onClick={() => handleSuggestionPick(s)}
            >
              <SearchIcon />
              <span className={styles.suggestionText}>{s}</span>
            </button>
          </li>
        ))}
      </ul>
    ) : null

  const handleLogout = () => {
    setDropOpen(false)
    logout()
  }

  const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <div className={styles.navbar}>
      {/* Left: menu toggle + logo */}
      <div className={styles.left}>
        <IconButton
          label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          onClick={onToggleSidebar}
        >
          <MenuIcon />
        </IconButton>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoIcon}>
            <PlayIcon />
          </span>
          <span className={styles.logoText}>VTube</span>
        </Link>
      </div>

      {/* Center: full inline search (>= --bp-md) */}
      <form className={styles.searchForm} onSubmit={handleSearch} role="search" ref={inlineSearchRef}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search videos..."
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onFocus={() => suggestions.length > 0 && setSuggestOpen(true)}
          aria-label="Search videos"
        />
        <button type="submit" className={styles.searchSubmit} aria-label="Submit search">
          <SearchIcon />
        </button>
        {renderSuggestions('inline')}
      </form>

      {/* Right: actions */}
      <div className={styles.right}>
        {/* Search trigger — only visible below --bp-md; opens the overlay */}
        <span className={styles.searchTrigger}>
          <IconButton label="Search" onClick={() => setSearchOpen(true)}>
            <SearchIcon />
          </IconButton>
        </span>

        {user ? (
          <>
            <IconButton label="Upload video" onClick={() => navigate('/upload')}>
              <UploadIcon />
            </IconButton>

            <NotificationsDropdown />

            <IconButton label={themeLabel} onClick={toggleTheme}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </IconButton>

            <div className={styles.dropdown} ref={dropRef}>
              <IconButton
                label="Account menu"
                className={styles.avatarTrigger}
                aria-haspopup="menu"
                aria-expanded={dropOpen}
                onClick={() => setDropOpen((prev) => !prev)}
              >
                <Avatar src={user.avatar} name={user.fullName} size={30} />
              </IconButton>

              {dropOpen && (
                <div className={styles.dropdownMenu} ref={menuRef} role="menu" aria-label="Account">
                  <div className={styles.dropdownHeader}>
                    <div className={styles.dropdownName}>{user.fullName}</div>
                    <div className={styles.dropdownUsername}>@{user.username}</div>
                  </div>
                  <Link
                    to={`/channel/${user.username}`}
                    className={styles.dropdownItem}
                    role="menuitem"
                    onClick={() => setDropOpen(false)}
                  >
                    <UserIcon /> Your Channel
                  </Link>
                  <Link
                    to="/dashboard"
                    className={styles.dropdownItem}
                    role="menuitem"
                    onClick={() => setDropOpen(false)}
                  >
                    <DashIcon /> Dashboard
                  </Link>
                  <div className={styles.dropdownSep} />
                  <button
                    type="button"
                    className={`${styles.dropdownItem} ${styles.danger}`}
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <LogoutIcon /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <IconButton label={themeLabel} onClick={toggleTheme}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </IconButton>
            <Button
              variant="primary"
              size="sm"
              iconLeft={<UserIcon />}
              onClick={() => navigate('/login')}
            >
              Sign In
            </Button>
          </>
        )}
      </div>

      {/* Mobile search overlay (icon-triggered below --bp-md) */}
      {searchOpen && (
        <div className={styles.searchOverlay}>
          <form className={styles.searchOverlayForm} onSubmit={handleSearch} role="search" ref={overlaySearchRef}>
            <input
              ref={overlayInputRef}
              className={styles.searchInput}
              type="search"
              placeholder="Search videos..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onFocus={() => suggestions.length > 0 && setSuggestOpen(true)}
              aria-label="Search videos"
            />
            <button type="submit" className={styles.searchSubmit} aria-label="Submit search">
              <SearchIcon />
            </button>
            <IconButton label="Close search" onClick={() => setSearchOpen(false)}>
              <CloseIcon />
            </IconButton>
            {renderSuggestions('overlay')}
          </form>
        </div>
      )}
    </div>
  )
}
