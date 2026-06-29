import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import Avatar from './Avatar'
import Spinner from './Spinner'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import {
  connectNotificationSocket,
  getSocket,
  onNotification,
  onUnreadCount,
} from '../api/socket'

const BellIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
)

const LikeIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: '#ff2d2d' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
)

const CommentIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: '#3ea6ff' }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
)

const SubIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: '#f5f5f5' }}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
)

export default function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const dropRef = useRef(null)
  // Mirror of the committed notifications list, used for socket-push dedupe
  // decisions without putting side effects inside a state updater.
  const notificationsRef = useRef([])
  const { user } = useAuth()

  useEffect(() => {
    notificationsRef.current = notifications
  }, [notifications])

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const { data } = await api.get('/notifications')
        const list = data?.data || []
        setNotifications(list)
        setUnreadCount(list.filter(n => !n.isRead).length)
      } catch (err) {
        console.error("Failed to fetch notifications", err)
      }
    }

    fetchNotifications()
    // Poll every 60s for new ones in enterprise mode (Realtime_Fallback)
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

  // Realtime updates: subscribe to socket pushes when authenticated.
  // Falls back silently to the REST fetch/poll above when no socket is available.
  useEffect(() => {
    if (!user) return

    // Ensure a socket connection exists (rely on app-boot connection if present).
    if (!getSocket()) connectNotificationSocket()

    // onNotification/onUnreadCount no-op (return () => {}) when no socket is live,
    // so this stays safe even if the connection failed.
    const offNotification = onNotification((payload) => {
      if (!payload) return
      // Dedupe by _id: a pushed item could also arrive via the REST refetch/poll.
      if (payload._id && notificationsRef.current.some(n => n._id === payload._id)) return
      setNotifications(prev =>
        (payload._id && prev.some(n => n._id === payload._id)) ? prev : [payload, ...prev]
      )
      if (!payload.isRead) setUnreadCount(c => c + 1)
    })

    const offUnreadCount = onUnreadCount(({ unreadCount } = {}) => {
      if (typeof unreadCount === 'number') setUnreadCount(unreadCount)
    })

    return () => {
      offNotification()
      offUnreadCount()
    }
  }, [user])

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleMarkAsRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error(err)
    }
  }

  const handleClear = async () => {
    try {
      await api.delete('/notifications/clear')
      setNotifications([])
      setUnreadCount(0)
    } catch (err) {
      console.error(err)
    }
  }

  const getNotificationText = (n) => {
    switch (n.type) {
      case 'LIKE': return 'liked your video'
      case 'COMMENT': return 'commented on your video'
      case 'SUBSCRIBE': return 'subscribed to your channel'
      case 'TWEET': return 'liked your tweet'
      default: return 'interacted with your content'
    }
  }

  const getIcon = (type) => {
    switch (type) {
      case 'LIKE': return <LikeIcon />
      case 'COMMENT': return <CommentIcon />
      case 'SUBSCRIBE': return <SubIcon />
      default: return <BellIcon />
    }
  }

  return (
    <div className="dropdown" ref={dropRef}>
      <button 
        className="icon-btn" 
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
        style={{ position: 'relative' }}
      >
        <BellIcon />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="dropdown-menu notifications-menu">
          <div className="dropdown-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>Notifications</span>
            {notifications.length > 0 && (
              <button className="text-btn" onClick={handleClear} style={{ fontSize: 12 }}>Clear all</button>
            )}
          </div>

          <div className="notification-list">
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center' }}><Spinner /></div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">
                <BellIcon />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div 
                  key={n._id} 
                  className={`notification-item ${!n.isRead ? 'unread' : ''}`}
                  onClick={() => !n.isRead && handleMarkAsRead(n._id)}
                >
                  <Avatar src={n.sender?.avatar} name={n.sender?.username} size={36} />
                  <div className="notification-content">
                    <p className="notification-text">
                      <span className="notification-user">@{n.sender?.username}</span> {getNotificationText(n)}
                      {n.video?.title && <span className="notification-target"> "{n.video.title}"</span>}
                    </p>
                    <span className="notification-time">
                       {getIcon(n.type)} {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {!n.isRead && <div className="unread-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
