import { Router } from 'express';
import {
    deleteVideo,
    getAllVideos,
    getVideoById,
    publishAVideo,
    searchSuggestions,
    streamVideo,
    togglePublishStatus,
    updateVideo,
} from "../controllers/video.controller.js"
import {verifyJWT, optionalJWT} from "../middlewares/auth.middleware.js"
import {upload, uploadImage} from "../middlewares/multer.middleware.js"
import {cacheMiddleware} from "../utils/cache.js"
import {validate} from "../middlewares/validate.middleware.js"
import {verifyOwnership} from "../middlewares/ownership.middleware.js"
import {Video} from "../models/video.model.js"
import {videoIdParam, publishVideoBody, updateVideoBody, getAllVideosQuery, enforceDateRange, autocompleteQuery} from "../validators/video.schema.js"

const router = Router();

// ── Public routes (no auth required) ─────────────────────────────────
router.route("/").get(optionalJWT, validate(getAllVideosQuery), enforceDateRange, cacheMiddleware(60), getAllVideos);
router.route("/search/suggestions").get(optionalJWT, validate(autocompleteQuery), searchSuggestions);
router.route("/stream/:video_Id").get(validate(videoIdParam), streamVideo);

// ── Protected write routes ────────────────────────────────────────────
// Order: verifyJWT → multer (multipart) → validate(body) → controller.
router.route("/").post(
    verifyJWT,
    upload.fields([
        { name: "videoFile", maxCount: 1 },
        { name: "thumbnail", maxCount: 1 },
    ]),
    validate(publishVideoBody),
    publishAVideo
);

router.route("/:video_Id")
    // public read + optional auth for history; validate ObjectId param
    .get(optionalJWT, validate(videoIdParam), getVideoById)
    // protected delete: validate id → verify ownership → controller
    .delete(
        verifyJWT,
        validate(videoIdParam),
        verifyOwnership(Video, "video_Id"),
        deleteVideo
    )
    // protected update: validate id → multer → validate body → verify ownership → controller
    .patch(
        verifyJWT,
        validate(videoIdParam),
        uploadImage.single("thumbnail"),
        validate(updateVideoBody),
        verifyOwnership(Video, "video_Id"),
        updateVideo
    );

router.route("/toggle/publish/:video_Id").patch(
    verifyJWT,
    validate(videoIdParam),
    verifyOwnership(Video, "video_Id"),
    togglePublishStatus
);

export default router
