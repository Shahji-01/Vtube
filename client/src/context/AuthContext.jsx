import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api, { setToken, getToken } from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch current user on mount if token exists
  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/users/current-user')
      setUser(data?.data || null)
    } catch {
      setUser(null)
      setToken(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (getToken()) {
      fetchMe()
    } else {
      setLoading(false)
    }
  }, [fetchMe])

  const login = async (credentials) => {
    const { data } = await api.post('/users/login', credentials)
    const { accessToken, user: userData } = data?.data || {}
    setToken(accessToken)
    setUser(userData)
    return userData
  }

  const register = async (formData) => {
    const { data } = await api.post('/users/register', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  }

  const logout = async () => {
    try { await api.post('/users/logout') } catch {}
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  const refreshUser = () => fetchMe()

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
