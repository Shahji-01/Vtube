import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import { AnnouncerProvider } from './context/AnnouncerContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import ChunkErrorBoundary from './components/ChunkErrorBoundary'
import RouteFallback from './components/RouteFallback'

const Home          = lazy(() => import('./pages/Home'))
const Login         = lazy(() => import('./pages/Login'))
const Register      = lazy(() => import('./pages/Register'))
const Watch         = lazy(() => import('./pages/Watch'))
const Channel       = lazy(() => import('./pages/Channel'))
const Dashboard     = lazy(() => import('./pages/Dashboard'))
const Upload        = lazy(() => import('./pages/Upload'))
const Search        = lazy(() => import('./pages/Search'))
const Library       = lazy(() => import('./pages/Library'))
const NotFound      = lazy(() => import('./pages/NotFound'))
const Settings      = lazy(() => import('./pages/Settings'))
const Subscriptions = lazy(() => import('./pages/Subscriptions'))
const PlaylistView  = lazy(() => import('./pages/PlaylistView'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <AnnouncerProvider>
            <ChunkErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
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
              </Suspense>
            </ChunkErrorBoundary>
            </AnnouncerProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
