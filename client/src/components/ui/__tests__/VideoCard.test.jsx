// Feature: phase-3-viewer-features, Task 12.1 — VideoCard image + fallback tests
// Validates: Requirements 2.7, 2.8
//
// VideoCard renders a thumbnail from a Cloudinary URL sized for its layout
// (grid → grid-card/360px, list → list-thumb/240px), and falls back to a
// same-size placeholder (never a broken-image glyph) when the thumbnail is
// absent or fails to load.
//
// The card wraps its content in a router <Link> and mounts a WatchLaterButton
// (which uses AuthContext, ToastContext, and the axios client). We render
// inside <MemoryRouter> and mock those modules so the button mounts cleanly:
//   - ../../../api/axios            → resolving post/delete stubs
//   - ../../../context/AuthContext  → useAuth() returns { user: null }
//   - ../../../context/ToastContext → useToast() returns a no-op toast
//
// Tests:
//   1. Grid layout + Cloudinary thumbnail → <img> src requests the grid-card
//      width (w_360,q_auto,f_auto) from res.cloudinary.com (R2.7).
//   2. List layout → <img> src requests the list-thumb width
//      (w_240,q_auto,f_auto) (R2.7).
//   3. Absent thumbnail → NO <img> is rendered; the same-size placeholder is
//      shown instead, never a broken-image glyph (R2.8).
//   4. Failed image load → firing the img's onError flips to the placeholder;
//      the <img> is removed (R2.8).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── Mock the axios client so WatchLaterButton's api calls resolve ──
vi.mock('../../../api/axios', () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

// ── Mock AuthContext: anonymous viewer (no user) ──
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

// ── Mock ToastContext: no-op toast ──
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => vi.fn(),
}))

import VideoCard from '../VideoCard'

// The placeholder's play-triangle path uniquely identifies the fallback block.
const PLACEHOLDER_PATH = 'M8 5v14l11-7z'

const CLOUDINARY_THUMB =
  'https://res.cloudinary.com/demo/image/upload/v1700000000/vtube/thumb.jpg'

function makeVideo(overrides = {}) {
  return {
    _id: 'vid-1',
    title: 'Sample Video',
    thumbnail: CLOUDINARY_THUMB,
    duration: 125,
    views: 1500,
    createdAt: new Date().toISOString(),
    owner: { username: 'creator', fullName: 'Creator Name', avatar: '' },
    ...overrides,
  }
}

function renderCard(props) {
  return render(
    <MemoryRouter>
      <VideoCard {...props} />
    </MemoryRouter>,
  )
}

// The placeholder block (aria-hidden) containing the play-triangle path.
const queryPlaceholder = (container) =>
  container.querySelector(`path[d="${PLACEHOLDER_PATH}"]`)

describe('VideoCard thumbnail rendering', () => {
  it('grid layout requests the grid-card width (w_360) from a Cloudinary thumbnail (R2.7)', () => {
    const { container } = renderCard({ video: makeVideo(), layout: 'grid' })

    const img = screen.getByRole('img', { name: 'Sample Video' })
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain('res.cloudinary.com')
    expect(img.getAttribute('src')).toContain('w_360,q_auto,f_auto')

    // No fallback placeholder while the image is rendering.
    expect(queryPlaceholder(container)).toBeNull()
  })

  it('default layout (no layout prop) also requests the grid-card width (w_360) (R2.7)', () => {
    renderCard({ video: makeVideo() })

    const img = screen.getByRole('img', { name: 'Sample Video' })
    expect(img.getAttribute('src')).toContain('res.cloudinary.com')
    expect(img.getAttribute('src')).toContain('w_360,q_auto,f_auto')
  })

  it('list layout requests the list-thumb width (w_240) from a Cloudinary thumbnail (R2.7)', () => {
    renderCard({ video: makeVideo(), layout: 'list' })

    const img = screen.getByRole('img', { name: 'Sample Video' })
    expect(img.getAttribute('src')).toContain('res.cloudinary.com')
    expect(img.getAttribute('src')).toContain('w_240,q_auto,f_auto')
  })

  it('absent thumbnail renders the same-size placeholder and no <img> (no broken-image glyph) (R2.8)', () => {
    const { container } = renderCard({ video: makeVideo({ thumbnail: '' }) })

    // No <img> at all — so the browser can never show a broken-image glyph.
    expect(screen.queryByRole('img', { name: 'Sample Video' })).toBeNull()

    // The fallback placeholder occupies the thumbnail area instead.
    expect(queryPlaceholder(container)).not.toBeNull()
  })

  it('null thumbnail also renders the placeholder and no <img> (R2.8)', () => {
    const { container } = renderCard({ video: makeVideo({ thumbnail: null }) })

    expect(screen.queryByRole('img', { name: 'Sample Video' })).toBeNull()
    expect(queryPlaceholder(container)).not.toBeNull()
  })

  it('a failed image load flips to the placeholder and removes the <img> (R2.8)', () => {
    const { container } = renderCard({ video: makeVideo(), layout: 'grid' })

    // Initially the Cloudinary <img> is present, no placeholder.
    const img = screen.getByRole('img', { name: 'Sample Video' })
    expect(queryPlaceholder(container)).toBeNull()

    // Simulate the image failing to load.
    fireEvent.error(img)

    // The <img> is gone and the same-size placeholder is shown instead.
    expect(screen.queryByRole('img', { name: 'Sample Video' })).toBeNull()
    expect(queryPlaceholder(container)).not.toBeNull()
  })
})
