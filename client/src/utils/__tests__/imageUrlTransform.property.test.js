// Feature: phase-3-viewer-features, Property 2: Cloudinary transform is correct and preserves asset identity
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { imageUrl, secureUrl } from '../formatters.js'

// Recognized contexts → target rendered width (matches IMAGE_WIDTHS)
const WIDTH_BY_CONTEXT = { 'grid-card': 360, 'list-thumb': 240, 'avatar': 88 }

// ── generators ────────────────────────────────────────────────────────────
const ALNUM = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// a non-empty token of url-safe characters
const tokenArb = fc
  .array(fc.constantFrom(...ALNUM), { minLength: 1, maxLength: 16 })
  .map((chars) => chars.join(''))

// arbitrary cloud name
const cloudArb = tokenArb

// arbitrary publicId, optionally nested in folders (1–3 segments)
const publicIdArb = fc
  .array(tokenArb, { minLength: 1, maxLength: 3 })
  .map((segments) => segments.join('/'))

// arbitrary version: v<digits>
const versionArb = fc.integer({ min: 1, max: 9_999_999_999 }).map((n) => String(n))

// arbitrary extension
const extArb = fc.constantFrom('jpg', 'jpeg', 'png', 'webp', 'gif', 'avif')

// http or https so secureUrl normalization is also exercised
const protocolArb = fc.constantFrom('http', 'https')

const contextArb = fc.constantFrom('grid-card', 'list-thumb', 'avatar')

// a full Cloudinary image-upload URL
const cloudinaryUrlArb = fc
  .record({
    protocol: protocolArb,
    cloud: cloudArb,
    version: versionArb,
    publicId: publicIdArb,
    ext: extArb,
  })
  .map(
    ({ protocol, cloud, version, publicId, ext }) =>
      `${protocol}://res.cloudinary.com/${cloud}/image/upload/v${version}/${publicId}.${ext}`
  )

describe('Property 2: Cloudinary transform is correct and preserves asset identity', () => {
  it('inserts the exact width transform after /upload/ and preserves the underlying asset', () => {
    fc.assert(
      fc.property(cloudinaryUrlArb, contextArb, (url, context) => {
        const result = imageUrl(url, context)
        const width = WIDTH_BY_CONTEXT[context]
        const expectedTransform = `w_${width},q_auto,f_auto/`

        // (a) always an https URL
        expect(result.startsWith('https://')).toBe(true)

        // (b) the segment immediately after /upload/ is exactly the transform
        const marker = '/upload/'
        const idx = result.indexOf(marker)
        expect(idx).not.toBe(-1)
        const insertAt = idx + marker.length
        const afterUpload = result.slice(insertAt)
        // the inserted transform is exactly `w_<width>,q_auto,f_auto` followed by `/`
        const firstSegment = afterUpload.slice(0, afterUpload.indexOf('/'))
        expect(firstSegment).toBe(`w_${width},q_auto,f_auto`)
        expect(afterUpload.startsWith(expectedTransform)).toBe(true)

        // (c) removing exactly the inserted segment reproduces secureUrl(url)
        //     (same cloud, version, publicId, ext — asset identity preserved)
        const removed = result.slice(0, insertAt) + result.slice(insertAt + expectedTransform.length)
        expect(removed).toBe(secureUrl(url))
      }),
      { numRuns: 100 }
    )
  })
})
