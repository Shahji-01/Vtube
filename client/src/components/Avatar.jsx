import { getInitials } from '../utils/formatters'

export default function Avatar({ src, name, size = 36 }) {
  const style = { width: size, height: size, fontSize: size * 0.36 }
  return (
    <div className="avatar" style={style}>
      {src
        ? <img src={src} alt={name || 'avatar'} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
        : null
      }
      <div
        className="avatar-fallback-inner"
        style={{ display: src ? 'none' : 'flex' }}
      >
        {getInitials(name)}
      </div>
    </div>
  )
}
