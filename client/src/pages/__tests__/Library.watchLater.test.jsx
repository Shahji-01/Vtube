// Feature: phase-3-viewer-features, Task 12.4 — Library Watch Later tab test
// Validates: Requirement 4.11
//
// Library.jsx renders a Tabs control whose active tab is driven by the
// `?tab=` search param. Selecting `watch-later` loads the saved entries via
// GET /watch-later, maps each entry's populated `video` doc into the grid, and
// renders a VideoCard per video. The pre-existing tabs (Watch History, Liked
// Videos, Tweets) remain present and untouched, each backed by their own
// endpoint.
//
// Library is light, but VideoCard pulls in the WatchLaterButton + its context
// deps. To keep this test focused on the tab/data wiring we stub VideoCard with
// a lightweight component that simply renders the video title and id. The
// contexts (authenticated user, no-op toast) and the axios client are mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── Hoisted state shared with the async mock factories below ──
const h = vi.hoisted(() => ({
  // Authenticated user so Library actually fetches.
  user: { _id: 'user-1', username: 'viewer' },
  // No-op toast.
  toast: vi.fn(),
  // Records the urls api.get() was called with, per test.
  getCalls: [],
}))

// ── Mock VideoCard with a lightweight stub that renders the video title/id ──
vi.mock('../../components/VideoCard', async () => {
  const React = await import('react')
  return {
    default: ({ video }) =>
      React.createElement(
        'div',
        { 'data-testid': `video-card-${video._id}` },
        video.title,
      ),
    // Library also imports the named VideoCardSkeleton.
    VideoCardSkeleton: () =>
      React.createElement('div', { 'data-testid': 'video-card-skeleton' }),
  }
})

// ── Mock the axios client: /watch-later resolves saved entries; others empty ──
vi.mock('../../api/axios', () => {
  const get = vi.fn((url) => {
    h.getCalls.push(url)
    if (url === '/watch-later') {
      return Promise.resolve({
        data: {
          data: [
            {
              _id: 'wl1',
              user: 'user-1',
              video: {
                _id: 'v1',
                title: 'WL Video',
                thumbnail: 'https://res.cloudinary.com/demo/image/upload/v1/wl.jpg',
                duration: 120,
                views: 5,
                createdAt: new Date().toISOString(),
                owner: { _id: 'owner-1', username: 'creator', fullName: 'Creator', avatar: '' },
              },
              createdAt: new Date().toISOString(),
            },
          ],
        },
      })
    }
    // history, liked, tweets → empty
    return Promise.resolve({ data: { data: [] } })
  })
  const api = {
    get,
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    defaults: { baseURL: '/api/v1' },
  }
  return { default: api, getToken: vi.fn(() => null) }
})

// ── Mock the contexts so Library mounts as an authenticated viewer ──
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: h.user }),
}))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => h.toast,
}))

import api from '../../api/axios'
import Library from '../Library'

function renderLibrary(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Library />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  h.getCalls = []
  h.toast.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Library — Watch Later tab (R4.11)', () => {
  it('selecting the watch-later tab loads GET /watch-later and renders the returned videos', async () => {
    renderLibrary('/library?tab=watch-later')

    // The returned saved video renders (mapped from entry.video into a VideoCard).
    expect(await screen.findByText('WL Video')).toBeInTheDocument()
    expect(screen.getByTestId('video-card-v1')).toBeInTheDocument()

    // The list was loaded from the /watch-later endpoint.
    expect(api.get).toHaveBeenCalledWith('/watch-later')
    expect(h.getCalls).toContain('/watch-later')
  })

  it('keeps the existing tabs present and unchanged alongside Watch Later', async () => {
    renderLibrary('/library?tab=watch-later')

    // Wait for content so the tablist is fully rendered.
    await screen.findByText('WL Video')

    // All tabs (existing + the new Watch Later) remain present as tabs.
    expect(screen.getByRole('tab', { name: 'Watch History' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Liked Videos' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tweets' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Watch Later' })).toBeInTheDocument()
  })

  it('the history tab still loads from the existing GET /users/history endpoint', async () => {
    renderLibrary('/library?tab=history')

    // The history tab is active and reachable.
    expect(await screen.findByRole('tab', { name: 'Watch History' })).toBeInTheDocument()

    // The existing history endpoint was used (other tabs untouched).
    expect(api.get).toHaveBeenCalledWith('/users/history')
    expect(h.getCalls).toContain('/users/history')
    expect(h.getCalls).not.toContain('/watch-later')
  })
})
