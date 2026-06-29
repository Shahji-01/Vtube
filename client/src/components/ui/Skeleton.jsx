import styles from './Skeleton.module.css'

/**
 * Skeleton — shared loading placeholder primitive.
 *
 * Renders a token-tinted block driven by the shared `shimmer` keyframe
 * (defined in styles/animations.css). All colors/backgrounds come from
 * semantic tokens via the sibling module; only the dynamic geometry
 * (width / height / radius) is applied as a runtime-computed inline style.
 *
 * @param {number|string} [width='100%']   CSS width (number -> px)
 * @param {number|string} [height=14]       CSS height (number -> px)
 * @param {number|string} [radius]          CSS border-radius (number -> px); defaults to token radius, or a full circle when `circle`
 * @param {boolean} [circle=false]          Render a circular placeholder (radius 50%); height mirrors width when only width is given
 * @param {string} [className]              Extra class names to merge
 * @param {object} [style]                  Extra inline styles (merged after geometry)
 */
export default function Skeleton({
  width = '100%',
  height = 14,
  radius,
  circle = false,
  className = '',
  style,
  ...rest
}) {
  const toCss = (v) => (typeof v === 'number' ? `${v}px` : v)

  // Geometry is dynamic, so it is computed at runtime as inline style.
  // Colors/backgrounds live in the module and consume semantic tokens.
  const geometry = {
    width: toCss(width),
    height: circle && height == null ? toCss(width) : toCss(height),
    borderRadius: circle ? '50%' : radius != null ? toCss(radius) : undefined,
    ...style,
  }

  return (
    <span
      aria-hidden="true"
      className={`${styles.skeleton} ${circle ? styles.circle : ''} ${className}`.trim()}
      style={geometry}
      {...rest}
    />
  )
}

/* ─────────────────────────────────────────────────────────────────────
   Composed skeletons — each mirrors the content shape it replaces so the
   loading state reserves the same space as the final layout (no shift).
   They are exported alongside the primitive for page/component use.
   ───────────────────────────────────────────────────────────────────── */

/** Mirrors a VideoCard in the grid: 16:9 thumb + avatar + 2 meta lines. */
export function VideoCardSkeleton() {
  return (
    <div className={styles.videoCard} aria-hidden="true">
      <Skeleton className={styles.thumb} width="100%" height={null} radius="var(--radius-lg)" />
      <div className={styles.cardInfo}>
        <Skeleton circle width={36} height={36} />
        <div className={styles.cardMeta}>
          <Skeleton width="92%" height={14} />
          <Skeleton width="55%" height={12} />
        </div>
      </div>
    </div>
  )
}

/** Mirrors a horizontal "Up Next" / search list item: side thumb + lines. */
export function RelatedItemSkeleton() {
  return (
    <div className={styles.relatedItem} aria-hidden="true">
      <Skeleton className={styles.relatedThumb} width={168} height={94} radius="var(--radius-md)" />
      <div className={styles.relatedMeta}>
        <Skeleton width="95%" height={13} />
        <Skeleton width="70%" height={13} />
        <Skeleton width="45%" height={11} />
      </div>
    </div>
  )
}

/** Mirrors the Watch page: player + title/channel/description + Up Next list. */
export function WatchSkeleton() {
  return (
    <div className={styles.watch} aria-hidden="true">
      <div className={styles.watchMain}>
        <Skeleton className={styles.player} width="100%" height={null} radius="var(--radius-lg)" />
        <Skeleton width="80%" height={22} radius="var(--radius-sm)" />
        <Skeleton width="40%" height={14} radius="var(--radius-sm)" />
        <div className={styles.watchChannel}>
          <Skeleton circle width={44} height={44} />
          <div className={styles.cardMeta}>
            <Skeleton width={160} height={15} />
            <Skeleton width={100} height={12} />
          </div>
          <Skeleton className={styles.pill} width={120} height={38} radius="var(--radius-full)" />
        </div>
        <Skeleton className={styles.description} width="100%" height={110} radius="var(--radius-md)" />
      </div>
      <div className={styles.watchSidebar}>
        {Array.from({ length: 6 }).map((_, i) => (
          <RelatedItemSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

/** Mirrors the Channel header: cover banner + overlapping avatar + stats + tabs. */
export function ChannelHeaderSkeleton() {
  return (
    <div className={styles.channel} aria-hidden="true">
      <Skeleton className={styles.cover} width="100%" height={180} radius="var(--radius-lg)" />
      <div className={styles.channelRow}>
        <Skeleton className={styles.channelAvatar} circle width={96} height={96} />
        <div className={styles.channelMeta}>
          <Skeleton width={220} height={22} />
          <Skeleton width={140} height={14} />
          <Skeleton width={180} height={12} />
        </div>
        <Skeleton className={styles.pill} width={130} height={40} radius="var(--radius-full)" />
      </div>
      <div className={styles.channelTabs}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width={84} height={16} radius="var(--radius-sm)" />
        ))}
      </div>
    </div>
  )
}

/** Mirrors a single comment: avatar + author line + content lines. */
export function CommentSkeleton() {
  return (
    <div className={styles.comment} aria-hidden="true">
      <Skeleton circle width={40} height={40} />
      <div className={styles.commentBody}>
        <Skeleton width="30%" height={12} />
        <Skeleton width="95%" height={13} />
        <Skeleton width="80%" height={13} />
      </div>
    </div>
  )
}
