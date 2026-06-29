import { isValidObjectId } from "mongoose"
import { WatchLater } from "../models/watchLater.model.js"
import { Video } from "../models/video.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"


//--------------------addToWatchLater--------------------

const addToWatchLater = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // Verify the target video exists (404 if not — R4.4).
    const video = await Video.findById(videoId)
    if (!video) {
        throw new ApiError(404, "No video found to add to Watch Later")
    }

    const user = req.user._id

    // Idempotent upsert keyed on {user, video}. Adding an already-present video
    // leaves the single membership unchanged and returns the existing entry
    // (R4.5, R4.6). The unique {user, video} index guarantees at most one entry.
    let entry
    try {
        entry = await WatchLater.findOneAndUpdate(
            { user, video: videoId },
            { $setOnInsert: { user, video: videoId } },
            { upsert: true, new: true }
        )
    } catch (error) {
        // Treat a duplicate-key race (E11000) on the unique index as "already present".
        if (error?.code === 11000) {
            entry = await WatchLater.findOne({ user, video: videoId })
        } else {
            throw error
        }
    }

    return res
        .status(200)
        .json(new ApiResponse(200, entry, "Video is in Watch Later"))
})


//--------------------removeFromWatchLater--------------------

const removeFromWatchLater = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // Idempotent delete constrained to the requesting user. Whether or not an
    // entry existed, the video ends up absent and we respond 200 (R4.7).
    const removed = await WatchLater.findOneAndDelete({
        user: req.user._id,
        video: videoId,
    })

    return res
        .status(200)
        .json(new ApiResponse(200, removed, "Video is not in Watch Later"))
})


//--------------------listWatchLater--------------------

const listWatchLater = asyncHandler(async (req, res) => {
    // Return only the requesting user's entries (never a client-supplied user id),
    // most recently added first. Populate the video docs and their owner, matching
    // the playlist population conventions. The Playlist collection is never touched (R4.8, R4.12).
    const entries = await WatchLater.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .populate({
            path: "video",
            populate: { path: "owner", select: "fullName username avatar" },
        })

    return res
        .status(200)
        .json(new ApiResponse(200, entries, "Watch Later fetched successfully"))
})


export {
    addToWatchLater,
    removeFromWatchLater,
    listWatchLater,
}
