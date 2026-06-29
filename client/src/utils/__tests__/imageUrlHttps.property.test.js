// Feature: phase-3-viewer-features, Property 1: Image helper always yields https or empty
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { imageUrl, IMAGE_WIDTHS } from '../formatters.js'

// Known contexts (recognized by the helper) plus arbitrary unknown strings.
const KNOWN_CONTEXTS = Object.keys(IMAGE_WIDTHS)

// Arbitrary for the `context` argument: known contexts, unknown strings, and nullish values.
const contextArb = fc.oneof(
  fc.constantFrom(...KNOWN_CONTEXTS),
  fc.string(),
  fc.constantFrom(undefined, null, '', 'thumbnail', 'banner', 'unknown'),
)

// A Cloudinary URL of the documented shape:
//   https://res.cloudinary.com/<cloud>/image/upload/v123/<id>.jpg
const cloudinaryUrlArb = fc
  .tuple(
    fc.constantFrom('http', 'https'),
    fc.stringMatching(/^[a-z0-9-]{1,12}$/),
    fc.integer({ min: 1, max: 999999 }),
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,16}$/),
    fc.constantFrom('jpg', 'png', 'webp', 'gif'),
  )
  .map(
    ([scheme, cloud, ver, id, ext]) =>
      `${scheme}://res.cloudinary.com/${cloud}/image/upload/v${ver}/${id}.${ext}`,
  )

// Non-Cloudinary http/https URLs.
const nonCloudinaryUrlArb = fc
  .tuple(
    fc.constantFrom('http', 'https'),
    fc.constantFrom('example.com', 'cdn.example.org', 'images.test', 'localhost:3000', 'a.b.c'),
    fc.stringMatching(/^[a-zA-Z0-9/_.-]{0,24}$/),
  )
  .map(([scheme, host, path]) => `${scheme}://${host}/${path}`)

// Whitespace-only strings.
const whitespaceArb = fc.stringMatching(/^[ \t\n\r]{1,8}$/)

// Falsy / nullish values.
const falsyArb = fc.constantFrom('', null, undefined, 0, false, NaN)

// The full url input space, matching the documented Property 1 domain:
// falsy values, whitespace-only strings, non-Cloudinary http/https URLs,
// and Cloudinary URLs.
const urlArb = fc.oneof(
  falsyArb,
  whitespaceArb,
  nonCloudinaryUrlArb,
  cloudinaryUrlArb,
)

describe('Property 1: Image helper always yields https or empty', () => {
  it('returns "" or an https:// URL, never http://, for any url and context', () => {
    fc.assert(
      fc.property(urlArb, contextArb, (url, context) => {
        const result = imageUrl(url, context)

        // The result is always a string.
        expect(typeof result).toBe('string')

        // It is either empty or an https URL...
        expect(result === '' || result.startsWith('https://')).toBe(true)

        // ...and it never starts with the insecure http:// scheme.
        expect(result.startsWith('http://')).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})
