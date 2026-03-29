import { Router } from 'express';
import {
    deleteVideo,
    getAllVideos,
    getVideoById,
    publishAVideo,
    streamVideo,
    togglePublishStatus,
    updateVideo,
} from "../controllers/video.controller.js"
import {verifyJWT, optionalJWT} from "../middlewares/auth.middleware.js"
import {upload} from "../middlewares/multer.middleware.js"
import {cacheMiddleware} from "../utils/cache.js"

const router = Router();

// ── Public routes (no auth required) ─────────────────────────────────
router.route("/").get(optionalJWT, cacheMiddleware(60), getAllVideos);
router.route("/stream/:video_Id").get(streamVideo);

// ── Protected write routes ────────────────────────────────────────────
router.route("/").post(
    verifyJWT,
    upload.fields([
        { name: "videoFile", maxCount: 1 },
        { name: "thumbnail", maxCount: 1 },
    ]),
    publishAVideo
);

router.route("/:video_Id")
    .get(optionalJWT, getVideoById)                       // public read + optional auth for history
    .delete(verifyJWT, deleteVideo)                       // protected delete
    .patch(verifyJWT, upload.single("thumbnail"), updateVideo); // protected update

router.route("/toggle/publish/:video_Id").patch(verifyJWT, togglePublishStatus);

export default router