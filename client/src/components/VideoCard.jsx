// VideoCard has moved to the design-system primitives under `ui/`.
// This re-export preserves the existing `../components/VideoCard` import path
// (default export) so callers keep working unchanged.
//
// The named `VideoCardSkeleton` previously exported here now lives with the
// shared Skeleton primitive (ui/Skeleton); it is re-exported from this same
// module so existing `import VideoCard, { VideoCardSkeleton }` imports keep
// resolving without changes.
//
// This is a pure re-export shim (no component is defined locally), so the
// react-refresh "only-export-components" check does not apply here.
/* eslint-disable react-refresh/only-export-components */
export { default } from './ui/VideoCard'
export { VideoCardSkeleton } from './ui/Skeleton'
