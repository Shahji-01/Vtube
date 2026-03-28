import { Link, useNavigate } from 'react-router-dom'
import { formatDuration, formatTimeAgo, formatViews, secureUrl } from '../utils/formatters'
import Avatar from './Avatar'

export default function VideoCard({ video, hideAvatar = false }) {
  const navigate = useNavigate()

  const handleChannelClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/channel/${video?.owner?.username}`)
  }

  return (
    <Link to={`/watch/${video._id}`} className="video-card">
      <div className="video-thumb-wrap">
        <img
          className="video-thumb"
          src={secureUrl(video.thumbnail)}
          alt={video.title}
          loading="lazy"
        />
        <span className="video-duration">{formatDuration(video.duration)}</span>
      </div>

      <div className="video-info">
        {!hideAvatar && (
          <div
            className="channel-avatar"
            onClick={handleChannelClick}
            style={{ cursor: 'pointer' }}
          >
            <Avatar src={video?.owner?.avatar} name={video?.owner?.fullName || video?.owner?.username} size={36} />
          </div>
        )}
        <div className="video-meta">
          <div className="video-title">{video.title}</div>
          {video?.owner && (
            <div
              className="video-channel"
              onClick={handleChannelClick}
            >
              {video.owner.fullName || video.owner.username}
            </div>
          )}
          <div className="video-stats">
            {formatViews(video.views)} views • {formatTimeAgo(video.createdAt)}
          </div>
        </div>
      </div>
    </Link>
  )
}

export function VideoCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-thumb" />
      <div className="video-info">
        <div className="skeleton skeleton-avatar" />
        <div className="video-meta" style={{ flex: 1 }}>
          <div className="skeleton skeleton-line" style={{ width: '90%', marginBottom: 6 }} />
          <div className="skeleton skeleton-line short" />
        </div>
      </div>
    </div>
  )
}
