import { Component } from 'react'
import EmptyState from './ui/EmptyState'
import Button from './ui/Button'

/** Decorative glyph for the error placeholder (token-colored via EmptyState). */
const ErrorGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

/**
 * ChunkErrorBoundary — catches lazy-route load failures.
 *
 * Wraps the `<Suspense>` that renders lazy page chunks. It catches both
 * dynamic-import (chunk) rejections and the 30s load-timeout signalled by
 * `RouteFallback`, then renders an `EmptyState tone="error"` with a Retry
 * action (Req 8.6). The requested URL is never changed — recovery happens by
 * resetting the boundary's own state so React re-attempts the lazy import,
 * keeping the user on the same route.
 */
export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
    this.handleRetry = this.handleRetry.bind(this)
  }

  static getDerivedStateFromError() {
    // A lazy-import rejection or the RouteFallback timeout surfaced here.
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // Keep diagnostics in the console without leaking details into the UI.
    if (import.meta.env?.DEV) {
      console.error('ChunkErrorBoundary caught a route load failure:', error, info)
    }
  }

  handleRetry() {
    // Reset state so the wrapped Suspense re-attempts the lazy import. The URL
    // is preserved because we do not navigate — we only clear the error state.
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <EmptyState
          tone="error"
          icon={<ErrorGlyph />}
          title="This page could not be loaded"
          subtitle="Something went wrong while loading the page. Check your connection and try again."
          action={
            <Button variant="primary" onClick={this.handleRetry}>
              Retry
            </Button>
          }
        />
      )
    }

    return this.props.children
  }
}
