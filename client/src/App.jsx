import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Home      from './pages/Home'
import Login     from './pages/Login'
import Register  from './pages/Register'
import Watch     from './pages/Watch'
import Channel   from './pages/Channel'
import Dashboard from './pages/Dashboard'
import Upload    from './pages/Upload'
import Search    from './pages/Search'
import Library   from './pages/Library'
import NotFound  from './pages/NotFound'
import Settings  from './pages/Settings'
import Subscriptions from './pages/Subscriptions'
import PlaylistView  from './pages/PlaylistView'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              {/* Auth pages (no layout) */}
              <Route path="/login"    element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Main layout */}
              <Route element={<Layout />}>
                <Route path="/"                  element={<Home />} />
                <Route path="/watch/:videoId"    element={<Watch />} />
                <Route path="/channel/:username" element={<Channel />} />
                <Route path="/search"            element={<Search />} />
                <Route path="/library"           element={<Library />} />
                <Route path="/playlist/:playlistId" element={<PlaylistView />} />

                {/* Protected routes */}
                <Route path="/upload"        element={<ProtectedRoute><Upload /></ProtectedRoute>} />
                <Route path="/dashboard"     element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/settings"      element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />

                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
