import { useRef, useEffect } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

export default function VideoPlayer({ options, onReady, poster }) {
  const videoRef = useRef(null)
  const playerRef = useRef(null)

  useEffect(() => {
    if (!playerRef.current) {
      if (videoRef.current) {
        playerRef.current = videojs(videoRef.current, {
           ...options,
           poster: poster,
           fluid: true,
           playbackRates: [0.5, 1, 1.25, 1.5, 2]
        }, () => {
          if (onReady) onReady(playerRef.current)
        })
      }
    } else {
      const player = playerRef.current
      if (options.autoplay !== undefined) player.autoplay(options.autoplay)
      if (options.sources) player.src(options.sources)
      if (poster) player.poster(poster)
    }
  }, [options, poster])

  useEffect(() => {
    const player = playerRef.current
    return () => {
      if (player && !player.isDisposed()) {
        player.dispose()
        playerRef.current = null
      }
    }
  }, [playerRef])

  return (
    <div data-vjs-player style={{ borderRadius: 16, overflow: 'hidden', background: '#000' }}>
      <video ref={videoRef} className="video-js vjs-big-play-centered" />
    </div>
  )
}
