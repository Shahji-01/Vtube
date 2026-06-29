import {Router} from "express"

import {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos,
    getLikedComments,
    getLikedTweets
} from "../controllers/like.controller.js"

import { verifyJWT } from "../middlewares/auth.middleware.js"
import { validate } from "../middlewares/validate.middleware.js"
import { videoIdParam, commentIdParam, tweetIdParam } from "../validators/like.schema.js"

const router = Router()

router.use(verifyJWT) // Apply verifyJWT middleware to all routes in this file bcz auth user can only like or dislike

// Order: verifyJWT (applied above) → validate(param ObjectId) → controller.
router.route("/toggle/v/:videoId").post(validate(videoIdParam), toggleVideoLike);

router.route("/toggle/c/:commentId").post(validate(commentIdParam), toggleCommentLike);

router.route("/toggle/t/:tweetId").post(validate(tweetIdParam), toggleTweetLike);

router.route("/videos").get(getLikedVideos);

router.route("/comments").get(getLikedComments);

router.route("/tweets").get(getLikedTweets);

export default router