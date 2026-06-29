// ── formatViews: 1500 → 1.5K  |  1200000 → 1.2M ──
export function formatViews(n) {
  if (!n && n !== 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ── formatDuration: 125 → "2:05" ──
export function formatDuration(secs) {
  if (!secs) return '0:00'
  const s = Math.floor(secs)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ── formatTimeAgo: ISO date → "3 hours ago" ──
export function formatTimeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)     return 'just now'
  if (s < 3600)   return `${Math.floor(s / 60)} min ago`
  if (s < 86400)  return `${Math.floor(s / 3600)} hr ago`
  if (s < 604800) return `${Math.floor(s / 86400)} days ago`
  if (s < 2592000) return `${Math.floor(s / 604800)} weeks ago`
  if (s < 31536000) return `${Math.floor(s / 2592000)} months ago`
  return `${Math.floor(s / 31536000)} years ago`
}

// ── initials: "John Doe" → "JD" ──
export function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

// ── Extract error message from Axios error ──
export function getErrorMessage(err) {
  return err?.response?.data?.message || err?.message || 'Something went wrong'
}

// ── secureUrl: "http://..." → "https://..." ──
export function secureUrl(url) {
  if (!url) return ''
  return url.replace(/^http:\/\//i, 'https://')
}

// ── secureVideoUrl: forces mp4 for browser compatibility ──
export function secureVideoUrl(url) {
  if (!url) return ''
  let secure = url.replace(/^http:\/\//i, 'https://')
  if (secure.includes('/video/upload/')) {
    secure = secure.replace('/video/upload/', '/video/upload/f_mp4/')
  }
  return secure
}

// ── Image_Context → target rendered width (CSS px) ──
export const IMAGE_WIDTHS = { 'grid-card': 360, 'list-thumb': 240, 'avatar': 88 }

const CLOUDINARY_HOST = 'res.cloudinary.com'

// ── imageUrl: responsive Cloudinary URL builder (built on secureUrl) ──
//  - falsy / whitespace-only url            → ''
//  - non-Cloudinary host                    → secureUrl(url)  (passthrough)
//  - Cloudinary url + unknown context       → secureUrl(url)  (no width)
//  - Cloudinary url + known context         → secureUrl(url) with
//    `w_<width>,q_auto,f_auto/` inserted immediately after `/upload/`
export function imageUrl(url, context) {
  // 1. falsy or whitespace-only → ''
  if (!url || typeof url !== 'string' || url.trim() === '') return ''

  // 2. always build on secureUrl so the result is https (or '')
  const secure = secureUrl(url)

  // 3. host must be Cloudinary, otherwise passthrough
  let host
  try {
    host = new URL(secure).host
  } catch {
    return secure
  }
  if (host !== CLOUDINARY_HOST) return secure

  // 4. unknown context → no width transform. Guard with hasOwn so inherited
  //    Object.prototype names (e.g. 'valueOf', 'toString') are NOT treated as
  //    known contexts (R2.6).
  if (!Object.prototype.hasOwnProperty.call(IMAGE_WIDTHS, context)) return secure
  const width = IMAGE_WIDTHS[context]

  // 5. insert transform segment immediately after `/upload/`
  const marker = '/upload/'
  const idx = secure.indexOf(marker)
  if (idx === -1) return secure
  const insertAt = idx + marker.length
  const transform = `w_${width},q_auto,f_auto/`
  return secure.slice(0, insertAt) + transform + secure.slice(insertAt)
}
