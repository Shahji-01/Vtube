import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Sidebar from './Sidebar'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="app-shell">
      <Navbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
      />
      <div className="app-body">
        <Sidebar open={sidebarOpen} />
        <main className="main-content">
          <div className="content-inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
