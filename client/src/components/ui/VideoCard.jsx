import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDuration, formatTimeAgo, formatViews, imageUrl } from '../../utils/formatters'
import Avatar from './Avatar'
import WatchLaterButton from './WatchLaterButton'
import styles from './VideoCard.module.css'

/**
 * VideoCard — reusable video summary card (grid or horizontal list).
 *
 * Renders a thumbnail (with duration pill), title, channel, and
 * "views • timeago" meta, linking to `/watch/:id`. The same card serves the
 * Home/Channel grid and the watch-page "Up Next" / search list via `layout`.
 *
 * Safety / preservation guarantees:
 *   - Missing or failed thumbnails fall back to a placeholder block that
 *     occupies the same area as the thumbnail, so no surrounding layout
 *     shift occurs and no broken-image glyph is ever shown (Req 10.3, 10.4).
 *   - The thumbnail URL is only ever passed through `secureUrl` when it is a
 *     non-empty string; an absent/null/empty value skips the helper entirely
 *     and renders the placeholder instead (Req 13.4, 13.5).
 *   - All user-generated text (title, channel name) is rendered as escaped
 *     React text nodes — never via `dangerouslySetInnerHTML` (Req 13.6).
 *   - Counts/durations/timestamps use the existing formatters (Req 13.7).
 *
 * @param {object} props
 * @param {object} props.video                 Video shape: { _id, title, thumbnail, duration, views, createdAt, owner }
 * @param {boolean} [props.hideAvatar=false]   Hide the channel avatar (e.g. on a channel's own grid).
 * @param {'grid'|'list'} [props.layout='grid'] 'list' renders the horizontal layout; any other/missing value defaults to grid (Req 6.7-6.9).
 * @param {React.ReactNode} [props.menu]        Optional kebab menu slot (Library/Playlist/Dashboard).
 *
 * Requirement 6.7: layout='grid' → grid layout.
 * Requirement 6.8: layout='list' → horizontal list layout.
 * Requirement 6.9: missing/invalid layout → grid layout.
 * Requirement 10.3/10.4: same-size placeholder on missing/failed thumbnail, no shift, no broken glyph.
 * Requirement 13.4/13.5: secureUrl only on present media; skip on absent/empty.
 * Requirement 13.6: escaped text nodes only.
 * Requirement 13.7: formatViews/formatDuration/formatTimeAgo for meta.
 */
export default function VideoCard({ video, hideAvatar = false, layout = 'grid', menu }) {
  const navigate = useNavigate()
  const [errored, setErrored] = useState(false)

  // Req 13.4/13.5: only treat a non-empty string as a usable thumbnail.
  const rawThumb = video?.thumbnail
  const hasThumb = typeof rawThumb === 'string' && rawThumb.trim() !== ''

  // A new thumbnail means a fresh chance to load — reset error state during
  // render (React's recommended pattern) so the image is attempted again.
  const [prevThumb, setPrevThumb] = useState(rawThumb)
  if (rawThumb !== prevThumb) {
    setPrevThumb(rawThumb)
    setErrored(false)
  }

  const showThumb = hasThumb && !errored

  // Req 6.9: anything other than the explicit 'list' value renders as grid.
  const isList = layout === 'list'
  const cardClass = [styles.card, isList ? styles.list : styles.grid]
    .filter(Boolean)
    .join(' ')

  const owner = video?.owner
  const channelName = owner?.fullName || owner?.username || ''

  const goToChannel = (e) => {
    // Prevent the wrapping card link from also navigating to /watch.
    e.preventDefault()
    e.stopPropagation()
    if (owner?.username) navigate(`/channel/${owner.username}`)
  }

  return (
    <div className={styles.wrap}>
      <Link to={`/watch/${video?._id}`} className={cardClass}>
        <div className={styles.thumbWrap}>
          {showThumb ? (
            <img
              className={styles.thumb}
              src={imageUrl(rawThumb, isList ? 'list-thumb' : 'grid-card')}
              alt={video?.title || ''}
              loading="lazy"
              // Req 10.4: a load failure flips to the placeholder via state
              // rather than leaving a broken-image glyph behind.
              onError={() => setErrored(true)}
            />
          ) : (
            // Req 10.3: placeholder fills the same area as the thumbnail, so
            // no layout shift occurs whether or not the image is available.
            <div className={styles.thumbPlaceholder} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
                <path
                  d="M8 5v14l11-7z"
                  fill="currentColor"
                />
              </svg>
            </div>
          )}
          {video?.duration != null && (
            <span className={styles.duration}>{formatDuration(video.duration)}</span>
          )}
        </div>

        <div className={styles.info}>
          {!hideAvatar && (
            <span className={styles.avatar} onClick={goToChannel}>
              <Avatar src={owner?.avatar} name={channelName} size={36} />
            </span>
          )}

          <div className={styles.meta}>
            {/* Req 13.6: escaped text node, never dangerouslySetInnerHTML. */}
            <div className={styles.title}>{video?.title}</div>
            {channelName && (
              <div
                className={styles.channel}
                role="link"
                tabIndex={0}
                onClick={goToChannel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') goToChannel(e)
                }}
              >
                {channelName}
              </div>
            )}
            <div className={styles.stats}>
              {/* Req 13.7: existing formatters for counts + timestamps. */}
              {formatViews(video?.views)} views • {formatTimeAgo(video?.createdAt)}
            </div>
          </div>
        </div>
      </Link>

      {/* Card-level controls. Live outside the card link so activating them
          never triggers watch-page navigation. The Watch Later toggle is
          always available; an optional kebab menu (Library/Playlist) coexists
          beside it when supplied. */}
      <div className={styles.actions}>
        <WatchLaterButton videoId={video?._id} />
        {menu && <div className={styles.menu}>{menu}</div>}
      </div>
    </div>
  )
}
