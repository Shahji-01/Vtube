import { describe, it, expect } from 'vitest'
import { IMAGE_WIDTHS } from '../formatters.js'

// Validates: Requirements 2.3
describe('IMAGE_WIDTHS exact values', () => {
  it('maps grid-card to 360', () => {
    expect(IMAGE_WIDTHS['grid-card']).toBe(360)
  })

  it('maps list-thumb to 240', () => {
    expect(IMAGE_WIDTHS['list-thumb']).toBe(240)
  })

  it('maps avatar to 88', () => {
    expect(IMAGE_WIDTHS['avatar']).toBe(88)
  })
})
