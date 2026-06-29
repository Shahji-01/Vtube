import { useRef } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import useLayoutMode from '../hooks/useLayoutMode'
import styles from './Layout.module.css'

/**
 * Layout shell.
 *
 * Owns the responsive layout state via `useLayoutMode()` and provides the
 * application's accessibility landmarks (Req 11.1):
 *   - a skip-to-content link as the first focusable element (Req 11.2, 11.3)
 *   - <header role="banner"> wrapping the Navbar
 *   - <nav aria-label="Primary"> wrapping the Sidebar
 *   - <main id="main-content"> containing the routed <Outlet />
 *
 * Content-push behavior (Req 5.1, 5.2):
 *   - docked + open  -> main is offset by the --sidebar-w layout token so the
 *     docked sidebar and the content never overlap.
 *   - overlay        -> main spans the full viewport width with no offset
 *     (the Sidebar renders as a drawer + scrim above the content).
 *
 * Per the shared layout contract, the Sidebar owns its own positioning, the
 * overlay scrim, and the `aria-current` active-route logic; the Layout only
 * wires the hook, renders landmarks, and applies the content push.
 */
export default function Layout() {
  const { mode, sidebarOpen, toggleSidebar, closeSidebar } = useLayoutMode()
  const mainRef = useRef(null)

  // Move keyboard focus to the main region when the skip link is activated
  // (Req 11.3). `main` carries tabIndex={-1} so it can receive programmatic
  // focus without joining the normal tab order.
  const handleSkip = (event) => {
    event.preventDefault()
    const main = mainRef.current
    if (main) {
      main.focus()
      main.scrollIntoView()
    }
  }

  const pushContent = mode === 'docked' && sidebarOpen

  return (
    <div className={styles.shell}>
      {/* First focusable element: visually hidden until focused (Req 11.2). */}
      <a
        href="#main-content"
        className={`sr-only sr-only-focusable ${styles.skipLink}`}
        onClick={handleSkip}
      >
        Skip to content
      </a>

      <header role="banner" className={styles.header}>
        <Navbar sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
      </header>

      <div className={styles.body}>
        <nav aria-label="Primary" className={styles.nav}>
          <Sidebar mode={mode} open={sidebarOpen} onClose={closeSidebar} />
        </nav>

        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className={`${styles.main} ${pushContent ? styles.pushed : ''}`}
        >
          <div className={styles.content}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
