import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'

describe('test harness smoke test', () => {
  it('runs the Vitest runner', () => {
    expect(1 + 1).toBe(2)
  })

  it('renders into a jsdom DOM and exposes jest-dom matchers', () => {
    render(<button type="button">Click me</button>)
    const btn = screen.getByRole('button', { name: 'Click me' })
    expect(btn).toBeInTheDocument()
    expect(btn).toBeEnabled()
  })

  it('exposes the jest-axe accessibility matcher', async () => {
    const { container } = render(
      <main>
        <h1>Hello</h1>
        <button type="button">Action</button>
      </main>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
