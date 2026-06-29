import multer from "multer";
import crypto from "crypto";
import path from "path";
import { ApiError } from "../utils/ApiError.js";

// Multer middleware for handling multipart/form-data uploads. Hardened against
// the common abuse vectors for a public, authenticated upload surface:
//
//   1. Safe filenames — the temp file is written under a server-generated
//      random name, NEVER the client-supplied `originalname`. This prevents
//      path traversal (e.g. "../../etc/passwd") and filename collisions/
//      overwrites on the shared temp directory.
//   2. Size limits — a per-file byte cap (plus a small field/file count cap)
//      bounds disk/CPU usage and blunts denial-of-service via huge uploads.
//   3. Type allowlist — a `fileFilter` rejects anything outside the expected
//      MIME families, so a signed-in user cannot stash arbitrary executables
//      or oversized junk on the server.
//
// Two configured uploaders are exported:
//   - `upload`      : media (image OR video), large cap — for video publish.
//   - `uploadImage` : image only, small cap — for avatars, covers, thumbnails.
//
// Multer surfaces limit violations as a `MulterError` (e.g. LIMIT_FILE_SIZE)
// and `fileFilter` rejections as the error we pass to its callback; both flow
// to the global error handler, which maps them to a clean 4xx response.

// ── Size caps ────────────────────────────────────────────────────────────────
const MB = 1024 * 1024;
const VIDEO_MAX_BYTES = 200 * MB; // generous cap for a source video
const IMAGE_MAX_BYTES = 8 * MB;   // avatars / covers / thumbnails

// ── Allowed MIME families ────────────────────────────────────────────────────
const IMAGE_MIME = /^image\/(jpe?g|png|webp|gif|avif)$/i;
const VIDEO_MIME = /^video\/(mp4|webm|ogg|quicktime|x-matroska|x-msvideo)$/i;

// Shared disk storage that writes to ./public/temp under a random, sanitized
// filename. The original extension is preserved (allowlisted chars only) purely
// for Cloudinary's content sniffing; the basename is never client-controlled.
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/temp");
  },
  filename: function (req, file, cb) {
    const rawExt = path.extname(file.originalname || "");
    // Keep only a short, safe extension (alphanumerics); drop anything else.
    const safeExt = /^\.[A-Za-z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "";
    const unique = `${Date.now()}-${crypto.randomBytes(16).toString("hex")}`;
    cb(null, `${unique}${safeExt}`);
  },
});

/**
 * Build a multer fileFilter that accepts only the given MIME pattern(s).
 * @param {RegExp[]} patterns
 * @param {string} label - human-readable accepted-types description for errors
 */
const mimeFilter = (patterns, label) => (req, file, cb) => {
  const ok = patterns.some((re) => re.test(file.mimetype));
  if (ok) return cb(null, true);
  cb(new ApiError(400, `Unsupported file type. Allowed: ${label}`));
};

// Media uploader (image OR video) — used by the video publish route, which
// accepts a `videoFile` plus a `thumbnail`.
export const upload = multer({
  storage,
  limits: {
    fileSize: VIDEO_MAX_BYTES,
    files: 2,
    fields: 20,
  },
  fileFilter: mimeFilter([IMAGE_MIME, VIDEO_MIME], "images and videos"),
});

// Image-only uploader — used for avatar, cover image, and standalone thumbnail
// updates. Tighter byte cap and rejects video/other types outright.
export const uploadImage = multer({
  storage,
  limits: {
    fileSize: IMAGE_MAX_BYTES,
    files: 2,
    fields: 20,
  },
  fileFilter: mimeFilter([IMAGE_MIME], "images (jpg, png, webp, gif, avif)"),
});
