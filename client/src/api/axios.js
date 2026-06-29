import axios from 'axios'

// Base URL for the API.
// - Split deploy (Vercel + Render): set VITE_API_URL to the backend's public
//   API URL, e.g. https://vtube-api.onrender.com/api/v1
// - Same-origin deploy (backend serves the SPA) or local dev via Vite proxy:
//   falls back to the relative "/api/v1".
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
})

// ── Token storage (in-memory for security, fallback to localStorage) ──
let _accessToken = null

export const setToken = (token) => {
  _accessToken = token
  if (token) localStorage.setItem('vtube_at', token)
  else localStorage.removeItem('vtube_at')
}

export const getToken = () => {
  if (_accessToken) return _accessToken
  return localStorage.getItem('vtube_at')
}

// ── Request interceptor: attach Bearer token ──
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: silent token refresh on 401 ──
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token)
  )
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }
      original._retry = true
      isRefreshing = true
      try {
        const { data } = await axios.post(`${API_BASE}/users/refresh-token`, {}, { withCredentials: true })
        const newToken = data?.data?.accessToken
        setToken(newToken)
        processQueue(null, newToken)
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch (refreshErr) {
        processQueue(refreshErr)
        setToken(null)
        window.location.href = '/login'
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api
