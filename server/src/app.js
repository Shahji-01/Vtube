import express from "express";
import cors from "cors"; // Importing the 'cors' middleware
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { errorHandler } from "./middlewares/error.middleware.js";
import { ApiError } from "./utils/ApiError.js";
import { loadEnv, isIntegrationEnabled, INTEGRATIONS } from "./config/env.js";
import { buildHelmetOptions } from "./config/security.js";
import { requestLogger } from "./config/logger.js";
import { buildLimiters } from "./middlewares/rateLimiters.js";

// importing routes (module-level imports; mounting happens inside createApp so
// each created app is fully independent)
import userRouter from "./routes/user.route.js";
import videoRouter from "./routes/video.route.js";
import commentRouter from "./routes/comment.route.js";
import tweetRouter from "./routes/tweet.route.js";
import likeRouter from "./routes/like.route.js";
import playlistRouter from "./routes/playlist.route.js";
import subscriptionRouter from "./routes/subscription.route.js";
import healthcheckRouter from "./routes/healthcheck.route.js";
import dashboardRouter from "./routes/dashboard.route.js";
import notificationRouter from "./routes/notification.route.js";
import watchProgressRouter from "./routes/watchProgress.route.js";
import watchLaterRouter from "./routes/watchLater.route.js";
import reportRouter from "./routes/report.route.js";

// Conditionally-mounted integration routers. The router objects are imported
// unconditionally (cheap), but mounted inside createApp only when the
// integration's env vars are present (Req 15.3).
import emailRouter from "./routes/email.route.js";
import authOauthRouter from "./routes/auth.oauth.route.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Application factory.
 *
 * Builds a fully independent Express app from a resolved environment view so
 * tests/staging can supply overrides without touching the production default.
 * Env-driven config (Helmet CSP/CORP, structured request logging, and the
 * tiered rate limiters) is resolved per call. The production default app is
 * preserved via `export const app = createApp()` at the bottom of this module.
 *
 * Req 6.1, 9.1, 9.4, 11.3, 15.1, 15.2.
 *
 * @param {object} [overrides] - Factory overrides.
 * @param {Record<string, string | undefined>} [overrides.env] - Env source
 *   passed to `loadEnv` (defaults to `process.env`).
 * @returns {import("express").Express}
 */
export function createApp(overrides = {}) {
  const env = loadEnv(overrides.env);
  const { globalLimiter, authLimiter, uploadLimiter } = buildLimiters(env);

  const app = express();

  app.set("trust proxy", 1); // Trust first specific proxy (e.g. Render/Vercel)

  // Security middleware to set secure HTTP headers. CSP/CORP directives are
  // built from the resolved env (Cloudinary always allowed; Vite dev origins
  // only outside production).
  app.use(helmet(buildHelmetOptions(env)));

  // Structured request logging (pino-http) mounted early — right after helmet —
  // so every request gets exactly one completion record (method, path, status,
  // responseTime).
  app.use(requestLogger(env));

  // Tiered rate limiting (design §5) to prevent brute-force and DDoS attacks.
  // Global tier protects the whole API; stricter tiers are layered on top for
  // auth and upload paths below (mounted BEFORE the routers so they run first).
  app.use("/api/v1/", globalLimiter);

  // Auth tier: tightly cap credential/token endpoints to blunt brute-force.
  app.use(
    [
      "/api/v1/users/login",
      "/api/v1/users/register",
      "/api/v1/users/refresh-token",
      "/api/v1/users/change-password",
    ],
    authLimiter
  );

  // Upload tier: throttle expensive media uploads.
  // - avatar/cover-image are PATCH-only paths with no public GETs, so mounting
  //   on the exact path is safe.
  // - /api/v1/videos also serves public GETs (list + by-id), so a plain path
  //   mount would wrongly throttle reads. We method-scope it to the POST
  //   publish/upload AND the PATCH thumbnail update only, leaving public GETs
  //   untouched.
  app.use(["/api/v1/users/avatar", "/api/v1/users/cover-image"], uploadLimiter);
  app.use("/api/v1/videos", (req, res, next) => {
    if (req.method === "POST" || req.method === "PATCH") {
      return uploadLimiter(req, res, next);
    }
    return next();
  });

  // ── CORS (env-driven, production-locked) ──────────────────────────
  // In production we ONLY trust the explicitly configured origin(s) and never
  // the Vite dev origins. We also refuse the wildcard `*` together with
  // credentials, which is an invalid (and unsafe) combination the browser would
  // reject anyway. Outside production the localhost dev origins are added so the
  // Vite dev server can talk to the API with cookies.
  const isProduction = env.NODE_ENV === "production";
  const corOrigin = (overrides.env ?? process.env).COR_ORIGIN;
  const wildcardAllowed = corOrigin === "*" && !isProduction;

  const allowedOrigins = [
    corOrigin === "*" ? null : corOrigin,
    ...(isProduction
      ? []
      : ["http://localhost:5173", "http://127.0.0.1:5173"]),
  ].filter(Boolean);

  app.use(
    cors({
      origin: function (origin, callback) {
        // Allow requests with no origin (e.g. mobile apps, curl, Postman)
        if (!origin || allowedOrigins.includes(origin) || wildcardAllowed) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: Origin '${origin}' not allowed`));
        }
      },
      credentials: true,
    })
  );

  // Adding middleware to parse incoming JSON requests with a maximum limit of 20KB
  app.use(express.json({ limit: "20kb" })); //form bhara to data liya

  // Adding middleware to parse incoming URL-encoded form data with extended option
  app.use(express.urlencoded({ extended: true, limit: "20kb" })); // this will use will data come form url and it will encode special character like space = %20 and other

  app.use(express.static("public")); // serve static content from static folder

  // Serve the built React SPA only when it is present. In a SPLIT deployment
  // (frontend on Vercel, backend API-only on Render) there is no client/dist,
  // so we run as a pure JSON API. In a COMBINED deployment the build exists and
  // we serve it plus a SPA catch-all (registered after the API routes below).
  const clientBuildPath = path.join(__dirname, "../../client/dist");
  const serveClient = fs.existsSync(path.join(clientBuildPath, "index.html"));
  if (serveClient) {
    app.use(express.static(clientBuildPath));
  }

  app.use(cookieParser()); // to perfomr CRUD OPER ON USER WEB COOKIES

  // route declarations

  // Mounting the userRouter middleware at the "/api/v1/users" endpoint
  app.use("/api/v1/users", userRouter); // here api/v1/users routes will act as prefix and controll will go to userRegister

  app.use("/api/v1/videos", videoRouter);

  app.use("/api/v1/comments", commentRouter);

  app.use("/api/v1/tweets", tweetRouter);

  app.use("/api/v1/healthcheck", healthcheckRouter);

  app.use("/api/v1/subscriptions", subscriptionRouter);

  app.use("/api/v1/likes", likeRouter);

  app.use("/api/v1/playlist", playlistRouter);

  app.use("/api/v1/dashboard", dashboardRouter);
  app.use("/api/v1/notifications", notificationRouter);
  app.use("/api/v1/watch-progress", watchProgressRouter);
  app.use("/api/v1/watch-later", watchLaterRouter);
  app.use("/api/v1/reports", reportRouter);

  // ── Conditionally-mounted integration routes (Req 15.3) ───────────
  // Email verification / password-reset is registered ONLY when the email
  // integration is enabled (every EMAIL_* var present & non-blank in the
  // resolved factory env). When the vars are blank the route is absent,
  // preserving the Phase-1 route baseline.
  if (isIntegrationEnabled(INTEGRATIONS.email, env)) {
    app.use("/api/v1/email", emailRouter);
  }

  // Google sign-in is registered ONLY when the Google integration is enabled
  // (both GOOGLE_* vars present & non-blank in the resolved factory env). When
  // the vars are blank the route is absent, preserving the route baseline
  // (Req 14.2, 14.7, 15.3).
  if (isIntegrationEnabled(INTEGRATIONS.google, env)) {
    app.use("/api/v1/auth", authOauthRouter);
  }

  // ── Catch-all route ───────────────────────────────────────────────
  // Combined deploy: serve the React app for any non-API route so client-side
  // routing works on refresh/deep-link. API-only deploy (no client build):
  // return a uniform JSON 404 instead of trying to send a non-existent file.
  if (serveClient) {
    app.get("*", (req, res, next) => {
      res.sendFile(path.join(clientBuildPath, "index.html"), (err) => {
        if (err) {
          next(new ApiError(500, "Unable to serve application"));
        }
      });
    });
  } else {
    app.use((req, res, next) => {
      next(new ApiError(404, "Not Found"));
    });
  }

  // Global error handler — MUST be the final middleware, after all routers
  // and the SPA catch-all, so every forwarded error gets the uniform shape.
  app.use(errorHandler);

  return app;
}

// Production default app — preserves `export { app }` so index.js
// (`import { app } from "./app.js"`) keeps working unchanged.
// http://localhost/api/v1/users/*
export const app = createApp();
