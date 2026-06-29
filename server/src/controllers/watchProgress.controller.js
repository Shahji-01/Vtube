import { WatchProgress } from "../models/watchProgress.model.js"
import { Video } from "../models/video.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"


//------------------saveProgress----------------

const saveProgress = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { positionSeconds } = req.body

    // Load the target video; a valid ObjectId that matches no video is a 404.
    const video = await Video.findById(videoId)
    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // Reject invalid positions BEFORE any write (R3.4).
    if (
        typeof positionSeconds !== "number" ||
        !Number.isFinite(positionSeconds) ||
        positionSeconds < 0 ||
        positionSeconds > video.duration
    ) {
        throw new ApiError(400, "Invalid positionSeconds")
    }

    // Upsert keyed by the requesting user + video — never trust a client user id (R3.6, R3.8, R6.5).
    const record = await WatchProgress.findOneAndUpdate(
        { user: req.user._id, video: videoId },
        { $set: { positionSeconds } },
        { upsert: true, new: true }
    )

    return res
        .status(200)
        .json(new ApiResponse(200, record, "Progress saved"))
})


//------------------getProgress----------------

const getProgress = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // Load the target video; a valid ObjectId that matches no video is a 404 (R3.5).
    const video = await Video.findById(videoId)
    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // Strictly scope the read to the requesting user (R3.8, R6.5).
    const record = await WatchProgress.findOne({ user: req.user._id, video: videoId })

    return res
        .status(200)
        .json(new ApiResponse(200, record || { positionSeconds: null }, "Progress fetched"))
})


export {
    saveProgress,
    getProgress,
}
