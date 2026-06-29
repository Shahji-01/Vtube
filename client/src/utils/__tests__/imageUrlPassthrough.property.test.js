// Feature: phase-3-viewer-features, Property 3: Non-Cloudinary and unknown-context inputs pass through untransformed
//
// Validates: Requirements 2.4, 2.6
//
// Property 3 asserts the two passthrough branches of `imageUrl`:
//   2.4 — a URL whose host is NOT res.cloudinary.com returns secureUrl(url)
//         with no inserted transform parameters, regardless of context.
//   2.6 — a Cloudinary_Url paired with an unrecognized Image_Context returns
//         secureUrl(url) with no inserted width parameter.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { imageUrl, secureUrl } from '../formatters.js'

const KNOWN_CONTEXTS = ['grid-card', 'list-thumb', 'avatar']

// Matches the exact transform segment `imageUrl` would insert after /upload/.
const INSERTED_TRANSFORM = /w_\d+,q_auto,f_auto/

// A safe path/identifier token: alphanumerics only, so generated URLs can
// never accidentally contain the `w_<n>,q_auto,f_auto` segment we check for.
const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,12}$/)

// Any context string that is NOT one of the three recognized contexts.
const unknownContext = fc
  .oneof(
    fc.stringMatching(/^[a-zA-Z0-9-]{0,15}$/),
    fc.constantFrom('', 'gridcard', 'thumb', 'GRID-CARD', 'list', 'icon', 'card'),
  )
  .filter((c) => !KNOWN_CONTEXTS.includes(c))

// Any context at all (recognized or not) — used for the non-Cloudinary branch
// where the context must never matter.
const anyContext = fc.oneof(fc.constantFrom(...KNOWN_CONTEXTS), unknownContext)

// A non-Cloudinary URL: arbitrary http/https host (never res.cloudinary.com)
// with an arbitrary path that may even contain an `upload` segment.
const nonCloudinaryUrl = fc
  .record({
    scheme: fc.constantFrom('http', 'https'),
    host: fc.domain().filter((d) => d !== 'res.cloudinary.com'),
    segments: fc.array(fc.oneof(safeWord, fc.constant('upload')), {
      minLength: 0,
      maxLength: 4,
    }),
  })
  .map(({ scheme, host, segments }) => `${scheme}://${host}/${segments.join('/')}`)

// A well-formed Cloudinary_Url with an /upload/ delivery segment.
const cloudinaryUrl = fc
  .record({
    scheme: fc.constantFrom('http', 'https'),
    cloud: safeWord,
    resource: fc.constantFrom('image', 'video'),
    version: fc.option(
      fc.integer({ min: 1, max: 9_999_999_999 }).map((n) => `v${n}`),
      { nil: null },
    ),
    publicId: fc.array(safeWord, { minLength: 1, maxLength: 3 }).map((a) => a.join('/')),
    ext: fc.constantFrom('jpg', 'png', 'webp', 'gif'),
  })
  .map(({ scheme, cloud, resource, version, publicId, ext }) => {
    const versionSeg = version ? `${version}/` : ''
    return `${scheme}://res.cloudinary.com/${cloud}/${resource}/upload/${versionSeg}${publicId}.${ext}`
  })

describe('Property 3: Non-Cloudinary and unknown-context inputs pass through untransformed', () => {
  it('returns secureUrl(url) with no inserted transform for any non-Cloudinary host (any context)', () => {
    fc.assert(
      fc.property(nonCloudinaryUrl, anyContext, (url, context) => {
        const result = imageUrl(url, context)
        expect(result).toBe(secureUrl(url))
        expect(result).not.toMatch(INSERTED_TRANSFORM)
      }),
      { numRuns: 200 },
    )
  })

  it('returns secureUrl(url) with no inserted width for a Cloudinary URL with an unknown context', () => {
    fc.assert(
      fc.property(cloudinaryUrl, unknownContext, (url, context) => {
        const result = imageUrl(url, context)
        expect(result).toBe(secureUrl(url))
        expect(result).not.toMatch(INSERTED_TRANSFORM)
      }),
      { numRuns: 200 },
    )
  })
})
