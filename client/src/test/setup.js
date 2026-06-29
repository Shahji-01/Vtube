// Vitest global setup: registers @testing-library/jest-dom and jest-axe matchers.
import '@testing-library/jest-dom/vitest'
import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { toHaveNoViolations } from 'jest-axe'

// Register jest-axe's `toHaveNoViolations` matcher for accessibility assertions.
expect.extend(toHaveNoViolations)

// Unmount React trees and clean up the DOM after every test to avoid leakage.
afterEach(() => {
  cleanup()
})
