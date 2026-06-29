import styles from './UnmuteButton.module.css'

/**
 * VolumeOffIcon — speaker with an "x", conveying the muted state.
 */
const VolumeOffIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <path d="M3 9v6h4l5 5V4L7 9H3z" />
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      d="M16 9l5 6m0-6l-5 6"
    />
  </svg>
)

/**
 * VolumeOnIcon — speaker with sound waves, conveying the unmuted state.
 */
const VolumeOnIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <path d="M3 9v6h4l5 5V4L7 9H3z" />
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
    />
  </svg>
)

/**
 * UnmuteButton — a visible overlay control for the muted/unmuted state of the
 * Video_Player (the Unmute_Affordance).
 *
 * Conveys the current muted state visually (a volume-off icon plus a
 * "Tap to unmute" label while muted; a volume-on icon while unmuted) and is
 * operable by both pointer and keyboard — it renders a real, focusable
 * `<button>` so Enter/Space activate it natively.
 *
 * The accessible name describes the action performed on activation:
 * `Unmute` while currently muted, `Mute` while currently unmuted.
 *
 * @param {Object} props
 * @param {boolean} props.muted     Current muted state of the player.
 * @param {() => void} props.onToggle  Invoked on activation; the parent restores
 *                                     audio and updates the `muted` prop so the
 *                                     affordance reflects the new state.
 *
 * Requirement 5.2: while muted, a visible affordance conveys the muted state.
 * Requirement 5.3: activating it restores audio and updates the affordance.
 * Requirement 5.6: operable by pointer and keyboard, with an accessible name
 *                  describing its action.
 */
export default function UnmuteButton({ muted, onToggle }) {
  // The accessible name names the action the activation performs, not the
  // current state (Req 5.6).
  const actionLabel = muted ? 'Unmute' : 'Mute'

  const classes = [styles.unmuteButton, muted ? styles.muted : styles.unmuted]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      aria-label={actionLabel}
      title={actionLabel}
      aria-pressed={!muted}
      onClick={onToggle}
    >
      <span className={styles.icon} aria-hidden="true">
        {muted ? <VolumeOffIcon /> : <VolumeOnIcon />}
      </span>
      {muted && <span className={styles.label}>Tap to unmute</span>}
    </button>
  )
}
