// Feature: phase-3-viewer-features, Property 6: Resume decision respects the resumable band and tolerance
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  computeResumeTarget,
  RESUME_MINIMUM,
  RESUME_END_MARGIN,
  RESUME_TOLERANCE,
} from '../useWatchProgress.js'

// Finite, non-negative numbers across a realistic range of playback positions
// and durations, plus a handful of boundary-relevant edge values so the
// generated space exercises the band edges (RESUME_MINIMUM and d - RESUME_END_MARGIN).
const finiteNonNegativeArb = fc.oneof(
  { weight: 8, arbitrary: fc.double({ min: 0, max: 36000, noNaN: true, noDefaultInfinity: true }) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      0,
      RESUME_MINIMUM,
      RESUME_MINIMUM - 0.5,
      RESUME_MINIMUM + 0.5,
      RESUME_END_MARGIN,
      RESUME_END_MARGIN + RESUME_MINIMUM,
    ),
  },
)

// Non-finite values that must always collapse to a resume target of 0.
const nonFiniteArb = fc.constantFrom(NaN, Infinity, -Infinity)

describe('Property 6: Resume decision respects the resumable band and tolerance', () => {
  it('resumes within tolerance inside the band and returns 0 outside it', () => {
    fc.assert(
      fc.property(finiteNonNegativeArb, finiteNonNegativeArb, (p, d) => {
        const result = computeResumeTarget(p, d)

        const inBand = RESUME_MINIMUM <= p && p < d - RESUME_END_MARGIN
        if (inBand) {
          // Inside the resumable band the helper returns the stored position,
          // which must land within RESUME_TOLERANCE of p.
          expect(Math.abs(result - p)).toBeLessThanOrEqual(RESUME_TOLERANCE)
        } else {
          // Below the minimum or inside the trailing end margin → never resume.
          expect(result).toBe(0)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('returns 0 when either p or d is non-finite', () => {
    fc.assert(
      fc.property(
        fc.oneof(nonFiniteArb, finiteNonNegativeArb),
        fc.oneof(nonFiniteArb, finiteNonNegativeArb),
        (p, d) => {
          fc.pre(!Number.isFinite(p) || !Number.isFinite(d))
          expect(computeResumeTarget(p, d)).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })
})
