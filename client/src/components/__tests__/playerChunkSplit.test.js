// Feature: phase-3-viewer-features, Task 8.2 — build-size smoke test for the player chunk split
// Validates: Requirements 1.2, 1.3, 1.4
//
// VideoPlayer loads video.js through an on-mount dynamic import (Task 8.1), so
// Vite/Rollup must emit the player library as its own chunk, separate from the
// lazy `Watch` route chunk. This smoke test inspects the *built* output in
// `client/dist/assets` and asserts the split actually happened:
//
//   1.2  A separate Player_Chunk containing the video.js library code exists and
//        is NOT the Watch route chunk.
//   1.4  The Watch route chunk does NOT contain the video.js library code.
//   1.3  The Watch route chunk's uncompressed size is strictly smaller than the
//        pre-change baseline of 733,184 bytes (716 KB).
//
// This is a deterministic build-artifact smoke test (no fast-check). It reads the
// filesystem directly and requires `npm run build` to have produced `client/dist`
// first. If the build output is missing, the test fails with a clear instruction.
//
// Chunk identification (by content, not by guessable file names):
//   - Watch route chunk  → the JS asset whose contents include Watch.jsx-specific
//     literals ('Up Next' and 'Start Over'), which are unique to that page.
//   - Player chunk        → a JS asset (other than the Watch chunk) whose contents
//     include a video.js library fingerprint. We use the library's runtime log
//     prefix `VIDEOJS` together with the `video.js` marker. NOTE: the string
//     fragment `vjs-` (CSS class names) is deliberately NOT used as the
//     fingerprint, because the Watch chunk legitimately references `vjs-*`
//     classes for the unmute overlay without bundling the library itself.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Pre-change baseline: the ~716 KB Watch route chunk flagged by the build (R1.3).
const WATCH_CHUNK_BASELINE_BYTES = 733_184

// client/src/components/__tests__ → up three levels → client/ → dist/assets
const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist', 'assets')

// A video.js library fingerprint that is present in the bundled library code but
// absent from page code that merely references vjs CSS classes.
const isPlayerLibraryCode = (contents) =>
  contents.includes('VIDEOJS') && contents.includes('video.js')

// Watch.jsx-specific literals — unique to the Watch route chunk.
const isWatchRouteCode = (contents) =>
  contents.includes('Up Next') && contents.includes('Start Over')

describe('build-size smoke: player chunk split (Task 8.2)', () => {
  let jsAssets

  beforeAll(() => {
    expect(
      existsSync(ASSETS_DIR),
      `Build output not found at ${ASSETS_DIR}. Run \`npm run build\` in client/ first.`
    ).toBe(true)

    jsAssets = readdirSync(ASSETS_DIR)
      .filter((name) => name.endsWith('.js'))
      .map((name) => {
        const path = join(ASSETS_DIR, name)
        return { name, path, contents: readFileSync(path, 'utf8'), size: statSync(path).size }
      })

    expect(jsAssets.length, 'expected at least one built JS asset').toBeGreaterThan(0)
  })

  it('emits the video.js library as a separate Player_Chunk that is not the Watch route chunk (R1.2)', () => {
    const watchChunk = jsAssets.find((a) => isWatchRouteCode(a.contents))
    expect(watchChunk, 'could not locate the Watch route chunk by its Watch.jsx markers').toBeTruthy()

    const playerChunks = jsAssets.filter((a) => isPlayerLibraryCode(a.contents))
    expect(
      playerChunks.length,
      'expected a dedicated chunk containing the video.js library code'
    ).toBeGreaterThan(0)

    // The player library must live in a chunk separate from the Watch route chunk.
    const playerChunkNames = playerChunks.map((a) => a.name)
    expect(playerChunkNames).not.toContain(watchChunk.name)
  })

  it('keeps the video.js library code out of the Watch route chunk (R1.4)', () => {
    const watchChunk = jsAssets.find((a) => isWatchRouteCode(a.contents))
    expect(watchChunk, 'could not locate the Watch route chunk').toBeTruthy()
    expect(
      isPlayerLibraryCode(watchChunk.contents),
      `Watch chunk ${watchChunk?.name} still contains video.js library code`
    ).toBe(false)
  })

  it('produces a Watch route chunk strictly smaller than the 733,184-byte baseline (R1.3)', () => {
    const watchChunk = jsAssets.find((a) => isWatchRouteCode(a.contents))
    expect(watchChunk, 'could not locate the Watch route chunk').toBeTruthy()
    expect(watchChunk.size).toBeLessThan(WATCH_CHUNK_BASELINE_BYTES)
  })
})
