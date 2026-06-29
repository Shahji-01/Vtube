import { useRef } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useFocusTrap from '../hooks/useFocusTrap'
import { resolveCurrentTo } from '../utils/sidebarNav'
import styles from './Sidebar.module.css'

const HomeIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
)
const ExploreIcon = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
)
const LibraryIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
)
const HistoryIcon = () => (
  <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.91-7.61"/></svg>
)
const LikeIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
)
const DashIcon = () => (
  <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
)
const UploadIcon = () => (
  <svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
)
const TweetIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
)
const SubIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M3 3h18"/></svg>
)

/**
 * Primary navigation sidebar.
 *
 * Rendered by the Layout shell as `<Sidebar mode open onClose />` inside a
 * `<nav aria-label="Primary">` landmark; the Layout owns the docked content
 * push. This component owns: the nav-item model, active-route marking, and the
 * overlay drawer behavior (scrim + focus management + close affordances).
 *
 * @param {{ mode?: 'docked'|'overlay', open?: boolean, onClose?: () => void }} props
 */
export default function Sidebar({ mode = 'docked', open = false, onClose = () => {} }) {
  const location = useLocation()
  const { user } = useAuth()
  const drawerRef = useRef(null)

  const isOverlay = mode === 'overlay'
  const overlayActive = isOverlay && open

  // Overlay drawer focus management: trap Tab within the drawer, close on
  // Escape, and restore focus to the control that opened it on close (Req 5.4).
  useFocusTrap(drawerRef, overlayActive, onClose)

  const mainNav = [
    { icon: HomeIcon,    label: 'Home',          to: '/' },
    { icon: SubIcon,     label: 'Subscriptions', to: '/subscriptions' },
    { icon: ExploreIcon, label: 'Explore',       to: '/search?q=' },
    { icon: LibraryIcon, label: 'Library',       to: '/library' },
  ]

  const userNav = user ? [
    { icon: HistoryIcon, label: 'History',       to: '/library?tab=history' },
    { icon: LikeIcon,    label: 'Liked Videos',  to: '/library?tab=liked' },
    { icon: TweetIcon,   label: 'Tweets',        to: '/library?tab=tweets' },
    { icon: DashIcon,    label: 'Dashboard',     to: '/dashboard' },
    { icon: UploadIcon,  label: 'Upload',        to: '/upload' },
  ] : []

  const currentTo = resolveCurrentTo(
    [...mainNav, ...userNav],
    location.pathname,
    location.search,
  )

  // In overlay mode, selecting any nav item closes the sidebar (Req 5.5).
  const handleNavClick = () => {
    if (isOverlay) onClose()
  }

  const asideClass = [
    styles.sidebar,
    isOverlay ? styles.overlay : styles.docked,
    isOverlay
      ? (open ? styles.open : '')
      : (open ? '' : styles.collapsed),
  ].filter(Boolean).join(' ')

  const renderItem = (item) => {
    // Uppercase local matches the lint varsIgnorePattern; JSX-only usage is
    // not detected as "used" by the project's lint config otherwise.
    const Icon = item.icon
    const { label, to } = item
    const isCurrent = currentTo === to
    return (
      <Link
        key={label}
        to={to}
        className={`${styles.navItem} ${isCurrent ? styles.active : ''}`}
        aria-current={isCurrent ? 'page' : undefined}
        onClick={handleNavClick}
      >
        <span className={styles.icon}><Icon /></span>
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <>
      {overlayActive && (
        <button
          type="button"
          className={styles.scrim}
          aria-label="Close navigation menu"
          onClick={onClose}
        />
      )}
      <aside
        ref={drawerRef}
        className={asideClass}
        aria-hidden={isOverlay && !open ? 'true' : undefined}
      >
        <div className={styles.sectionLabel}>Main</div>
        {mainNav.map(renderItem)}

        {userNav.length > 0 && (
          <>
            <div className={styles.sep} />
            <div className={styles.sectionLabel}>You</div>
            {userNav.map(renderItem)}
          </>
        )}
      </aside>
    </>
  )
}
