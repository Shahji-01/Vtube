/**
 * Route baseline snapshot — Phase 1 Stabilization (Task 1.2)
 *
 * This is the PRE-CHANGE baseline of the public routing surface, captured before any
 * stabilization work touches `app.js`, the route files, or `client/src/App.jsx`.
 *
 * It is consumed by the behavior-preservation tests (design Property 11, Requirements 8.7 & 12.3):
 *   - `serverRoutes`  : every `/api/v1/` (method, path) pair exposed by the Express routers.
 *   - `clientRoutes`  : the client `path -> component` mapping declared in `client/src/App.jsx`.
 *
 * If a future change intentionally adds/removes/renames a route, this snapshot must be
 * updated in the same change so the divergence is explicit and reviewable.
 *
 * Sources of truth at capture time:
 *   - server mount prefixes : server/src/app.js
 *   - server route defs     : server/src/routes/*.route.js
 *   - client route defs     : client/src/App.jsx
 */

/**
 * @typedef {Object} ServerRoute
 * @property {"GET"|"POST"|"PATCH"|"PUT"|"DELETE"} method  HTTP method (uppercase)
 * @property {string} path     Fully-qualified path including the `/api/v1/<group>` mount prefix
 * @property {string} router   The mounting router group (for traceability)
 */

/**
 * Every `/api/v1/` (method, path) pair, grouped-by router but flattened into one array.
 * Paths use the Express-style `:param` placeholders exactly as declared in the routers.
 *
 * @type {ReadonlyArray<ServerRoute>}
 */
export const serverRoutes = Object.freeze([
  // ── users  (mounted at /api/v1/users) ────────────────────────────────
  { method: "POST",   path: "/api/v1/users/register",            router: "users" },
  { method: "POST",   path: "/api/v1/users/login",               router: "users" },
  { method: "POST",   path: "/api/v1/users/logout",              router: "users" },
  { method: "POST",   path: "/api/v1/users/refresh-token",       router: "users" },
  { method: "POST",   path: "/api/v1/users/change-password",     router: "users" },
  { method: "GET",    path: "/api/v1/users/current-user",        router: "users" },
  { method: "PATCH",  path: "/api/v1/users/update-account",      router: "users" },
  { method: "PATCH",  path: "/api/v1/users/avatar",              router: "users" },
  { method: "PATCH",  path: "/api/v1/users/cover-image",         router: "users" },
  { method: "GET",    path: "/api/v1/users/c/:username",         router: "users" },
  { method: "GET",    path: "/api/v1/users/history",             router: "users" },
  { method: "DELETE", path: "/api/v1/users/history",             router: "users" },
  { method: "DELETE", path: "/api/v1/users/history/:video_Id",   router: "users" },

  // ── videos  (mounted at /api/v1/videos) ──────────────────────────────
  { method: "GET",    path: "/api/v1/videos/",                          router: "videos" },
  { method: "GET",    path: "/api/v1/videos/stream/:video_Id",          router: "videos" },
  { method: "POST",   path: "/api/v1/videos/",                          router: "videos" },
  { method: "GET",    path: "/api/v1/videos/:video_Id",                 router: "videos" },
  { method: "DELETE", path: "/api/v1/videos/:video_Id",                 router: "videos" },
  { method: "PATCH",  path: "/api/v1/videos/:video_Id",                 router: "videos" },
  { method: "PATCH",  path: "/api/v1/videos/toggle/publish/:video_Id",  router: "videos" },
  // Phase 4 (Task 7.5) — ADDITIVE: search suggestions endpoint.
  { method: "GET",    path: "/api/v1/videos/search/suggestions",       router: "videos" },

  // ── comments  (mounted at /api/v1/comments) ──────────────────────────
  { method: "GET",    path: "/api/v1/comments/:video_Id",            router: "comments" },
  { method: "POST",   path: "/api/v1/comments/:video_Id",            router: "comments" },
  { method: "DELETE", path: "/api/v1/comments/c/:comment_Id",        router: "comments" },
  { method: "PATCH",  path: "/api/v1/comments/c/:comment_Id",        router: "comments" },
  { method: "GET",    path: "/api/v1/comments/replies/:comment_Id",  router: "comments" },
  // Phase 4 (Task 7.5) — ADDITIVE: pin/unpin comment endpoints.
  { method: "PATCH",  path: "/api/v1/comments/c/:comment_Id/pin",    router: "comments" },
  { method: "PATCH",  path: "/api/v1/comments/c/:comment_Id/unpin",  router: "comments" },

  // ── tweets  (mounted at /api/v1/tweets) ──────────────────────────────
  { method: "GET",    path: "/api/v1/tweets/user/:user_Id",  router: "tweets" },
  { method: "POST",   path: "/api/v1/tweets/",               router: "tweets" },
  { method: "PATCH",  path: "/api/v1/tweets/:tweet_Id",      router: "tweets" },
  { method: "DELETE", path: "/api/v1/tweets/:tweet_Id",      router: "tweets" },

  // ── healthcheck  (mounted at /api/v1/healthcheck) ────────────────────
  { method: "GET",    path: "/api/v1/healthcheck/",  router: "healthcheck" },

  // ── subscriptions  (mounted at /api/v1/subscriptions) ────────────────
  { method: "POST",   path: "/api/v1/subscriptions/create/c/:user_Id",     router: "subscriptions" },
  { method: "GET",    path: "/api/v1/subscriptions/c/:channel_Id",         router: "subscriptions" },
  { method: "POST",   path: "/api/v1/subscriptions/toggle/c/:channel_Id",  router: "subscriptions" },
  { method: "GET",    path: "/api/v1/subscriptions/u/:subscriberId",       router: "subscriptions" },
  { method: "GET",    path: "/api/v1/subscriptions/videos",                router: "subscriptions" },

  // ── likes  (mounted at /api/v1/likes) ────────────────────────────────
  { method: "POST",   path: "/api/v1/likes/toggle/v/:videoId",    router: "likes" },
  { method: "POST",   path: "/api/v1/likes/toggle/c/:commentId",  router: "likes" },
  { method: "POST",   path: "/api/v1/likes/toggle/t/:tweetId",    router: "likes" },
  { method: "GET",    path: "/api/v1/likes/videos",               router: "likes" },
  { method: "GET",    path: "/api/v1/likes/comments",             router: "likes" },
  { method: "GET",    path: "/api/v1/likes/tweets",               router: "likes" },

  // ── playlist  (mounted at /api/v1/playlist) ──────────────────────────
  { method: "POST",   path: "/api/v1/playlist/",                              router: "playlist" },
  { method: "GET",    path: "/api/v1/playlist/:playlistId",                   router: "playlist" },
  { method: "PATCH",  path: "/api/v1/playlist/:playlistId",                   router: "playlist" },
  { method: "DELETE", path: "/api/v1/playlist/:playlistId",                   router: "playlist" },
  { method: "PATCH",  path: "/api/v1/playlist/add/:videoId/:playlistId",      router: "playlist" },
  { method: "PATCH",  path: "/api/v1/playlist/remove/:videoId/:playlistId",   router: "playlist" },
  { method: "GET",    path: "/api/v1/playlist/user/:userId",                  router: "playlist" },

  // ── dashboard  (mounted at /api/v1/dashboard) ────────────────────────
  { method: "GET",    path: "/api/v1/dashboard/stats",   router: "dashboard" },
  { method: "GET",    path: "/api/v1/dashboard/videos",  router: "dashboard" },

  // ── notifications  (mounted at /api/v1/notifications) ────────────────
  { method: "GET",    path: "/api/v1/notifications/",                      router: "notifications" },
  { method: "DELETE", path: "/api/v1/notifications/clear",                 router: "notifications" },
  { method: "PATCH",  path: "/api/v1/notifications/:notificationId/read",  router: "notifications" },

  // ── watch-progress  (mounted at /api/v1/watch-progress) ──────────────
  // Phase 3 (Task 4.4) — ADDITIVE: resume-playback endpoints. No existing
  // entries removed or modified.
  { method: "PUT",    path: "/api/v1/watch-progress/:videoId",  router: "watchProgress" },
  { method: "GET",    path: "/api/v1/watch-progress/:videoId",  router: "watchProgress" },

  // ── watch-later  (mounted at /api/v1/watch-later) ────────────────────
  // Phase 3 (Task 4.4) — ADDITIVE: Watch Later endpoints. No existing
  // entries removed or modified.
  { method: "POST",   path: "/api/v1/watch-later/:videoId",  router: "watchLater" },
  { method: "DELETE", path: "/api/v1/watch-later/:videoId",  router: "watchLater" },
  { method: "GET",    path: "/api/v1/watch-later/",          router: "watchLater" },

  // ── reports  (mounted at /api/v1/reports) ────────────────────────────
  // Phase 4 (Task 7.5) — ADDITIVE: content reporting endpoints. No existing
  // entries removed or modified.
  { method: "POST",   path: "/api/v1/reports/",                 router: "reports" },
  { method: "GET",    path: "/api/v1/reports/",                 router: "reports" },
  { method: "PATCH",  path: "/api/v1/reports/:reportId/resolve",  router: "reports" },
  { method: "PATCH",  path: "/api/v1/reports/:reportId/dismiss",  router: "reports" },
]);

/**
 * @typedef {Object} ClientRoute
 * @property {string} path        URL path pattern (React Router syntax, `:param` placeholders)
 * @property {string} component   Name of the page component rendered for this path
 * @property {boolean} layout     Whether the route renders inside the shared `<Layout />` element
 * @property {boolean} protected  Whether the route is wrapped in `<ProtectedRoute>`
 */

/**
 * The client `path -> component` mapping declared in `client/src/App.jsx`.
 * `"*"` is the in-layout catch-all that renders the NotFound page.
 *
 * @type {ReadonlyArray<ClientRoute>}
 */
export const clientRoutes = Object.freeze([
  // Auth pages (rendered without the shared Layout)
  { path: "/login",                 component: "Login",        layout: false, protected: false },
  { path: "/register",              component: "Register",     layout: false, protected: false },

  // Main layout — public routes
  { path: "/",                      component: "Home",         layout: true,  protected: false },
  { path: "/watch/:videoId",        component: "Watch",        layout: true,  protected: false },
  { path: "/channel/:username",     component: "Channel",      layout: true,  protected: false },
  { path: "/search",                component: "Search",       layout: true,  protected: false },
  { path: "/library",               component: "Library",      layout: true,  protected: false },
  { path: "/playlist/:playlistId",  component: "PlaylistView", layout: true,  protected: false },

  // Main layout — protected routes
  { path: "/upload",                component: "Upload",        layout: true, protected: true },
  { path: "/dashboard",             component: "Dashboard",     layout: true, protected: true },
  { path: "/settings",              component: "Settings",      layout: true, protected: true },
  { path: "/subscriptions",         component: "Subscriptions", layout: true, protected: true },

  // Catch-all (in layout) → NotFound
  { path: "*",                      component: "NotFound",      layout: true, protected: false },
]);

/**
 * Convenience: a Set of `"METHOD path"` strings for the server baseline, useful for
 * exact set-equality comparisons in behavior-preservation tests.
 *
 * @type {ReadonlySet<string>}
 */
export const serverRouteKeys = Object.freeze(
  new Set(serverRoutes.map((r) => `${r.method} ${r.path}`))
);

/**
 * Convenience: a Set of client path patterns for quick membership/equality checks.
 *
 * @type {ReadonlySet<string>}
 */
export const clientRoutePaths = Object.freeze(
  new Set(clientRoutes.map((r) => r.path))
);
