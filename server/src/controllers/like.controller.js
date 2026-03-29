import mongoose, {isValidObjectId} from "mongoose"
import {Like} from "../models/like.model.js"
import {Video} from "../models/video.model.js"
import {Comment} from "../models/comment.model.js"
import {Tweet} from "../models/tweet.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"
import {triggerNotification} from "../utils/notification.js"

/*--------------------toggleVideoLike----------------*/

const toggleVideoLike = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { isDislike = false } = req.query; // Default to false if not provided

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    try {
        const existingLike = await Like.findOne({
            video: videoId,
            likedBy: req.user._id
        });

        if (existingLike) {
            // Case 1: Toggling the same action (e.g., clicking Like when already Liked)
            if (existingLike.isDislike.toString() === isDislike.toString()) {
                await Like.deleteOne({ _id: existingLike._id });
                return res.status(200).json(new ApiResponse(200, null, `${isDislike === "true" ? "Dislike" : "Like"} removed`));
            } 
            
            // Case 2: Switching from Like to Dislike or vice-versa
            existingLike.isDislike = (isDislike === "true");
            await existingLike.save();
            return res.status(200).json(new ApiResponse(200, existingLike, `Switched to ${isDislike === "true" ? "Dislike" : "Like"}`));
        } else {
            // Case 3: Brand new Like/Dislike
            const newLike = await Like.create({
                video: videoId,
                likedBy: req.user._id,
                isDislike: (isDislike === "true")
            });

            // Trigger Notification ONLY for Likes
            if (isDislike !== "true") {
                const video = await Video.findById(videoId);
                if (video) {
                    await triggerNotification({
                        type: "LIKE",
                        recipient: video.owner,
                        sender: req.user._id,
                        video: videoId
                    });
                }
            }

            return res.status(200).json(new ApiResponse(200, newLike, `${isDislike === "true" ? "Dislike" : "Like"} added`));
        }
    } catch (error) {
        throw new ApiError(500, error?.message || "Internal server error toggling video like");
    }
});//DONE!


/*-----------------toggleCommentLike----------------*/

const toggleCommentLike = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const { isDislike = false } = req.query;

    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    try {
        const existingLike = await Like.findOne({
            comment: commentId,
            likedBy: req.user._id
        });

        if (existingLike) {
            if (existingLike.isDislike.toString() === isDislike.toString()) {
                await Like.deleteOne({ _id: existingLike._id });
                return res.status(200).json(new ApiResponse(200, null, `${isDislike === "true" ? "Dislike" : "Like"} removed`));
            }
            existingLike.isDislike = (isDislike === "true");
            await existingLike.save();
            return res.status(200).json(new ApiResponse(200, existingLike, `Switched to ${isDislike === "true" ? "Dislike" : "Like"}`));
        } else {
            const newLike = await Like.create({
                comment: commentId,
                likedBy: req.user._id,
                isDislike: (isDislike === "true")
            });

            if (isDislike !== "true") {
                const comment = await Comment.findById(commentId);
                if (comment) {
                    await triggerNotification({
                        type: "LIKE",
                        recipient: comment.owner,
                        sender: req.user._id,
                        video: comment.video,
                        comment: commentId
                    });
                }
            }

            return res.status(200).json(new ApiResponse(200, newLike, `${isDislike === "true" ? "Dislike" : "Like"} added`));
        }
    } catch (error) {
        throw new ApiError(500, error?.message || "Internal server error toggling comment like");
    }
});//DONE!


/*--------------------toggleTweetLike-------------*/

const toggleTweetLike = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;
    const { isDislike = false } = req.query;

    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID");
    }

    try {
        const existingLike = await Like.findOne({
            tweet: tweetId,
            likedBy: req.user._id
        });

        if (existingLike) {
            if (existingLike.isDislike.toString() === isDislike.toString()) {
                await Like.deleteOne({ _id: existingLike._id });
                return res.status(200).json(new ApiResponse(200, null, `${isDislike === "true" ? "Dislike" : "Like"} removed`));
            }
            existingLike.isDislike = (isDislike === "true");
            await existingLike.save();
            return res.status(200).json(new ApiResponse(200, existingLike, `Switched to ${isDislike === "true" ? "Dislike" : "Like"}`));
        } else {
            const newLike = await Like.create({
                tweet: tweetId,
                likedBy: req.user._id,
                isDislike: (isDislike === "true")
            });

            if (isDislike !== "true") {
                const tweet = await Tweet.findById(tweetId);
                if (tweet) {
                    await triggerNotification({
                        type: "LIKE",
                        recipient: tweet.owner,
                        sender: req.user._id,
                    });
                }
            }

            return res.status(200).json(new ApiResponse(200, newLike, `${isDislike === "true" ? "Dislike" : "Like"} added`));
        }
    } catch (error) {
        throw new ApiError(500, error?.message || "Internal server error toggling tweet like");
    }
});//DONE!


/*--------------------getLikesVideos------------------*/

const getLikedVideos = asyncHandler(async (req, res) => {
    try {
        const likedVideos = await Like.aggregate([
            {
                $match: {
                    likedBy: new mongoose.Types.ObjectId(req.user._id),
                    video: { $exists: true, $ne: null },
                    isDislike: false // Only show actual likes in "Liked Videos"
                }
            },
            {
                $lookup: {
                    from: "videos",
                    localField: "video",
                    foreignField: "_id",
                    as: "video"
                }
            },
            {
                $unwind: "$video"
            },
            {
                $lookup: {
                    from: "users",
                    localField: "video.owner",
                    foreignField: "_id",
                    as: "video.owner"
                }
            },
            {
                $unwind: {
                    path: "$video.owner",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: "$video._id",
                    title: "$video.title",
                    description: "$video.description",
                    thumbnail: "$video.thumbnail",
                    duration: "$video.duration",
                    views: "$video.views",
                    createdAt: "$video.createdAt",
                    owner: {
                        _id: "$video.owner._id",
                        username: "$video.owner.username",
                        fullName: "$video.owner.fullName",
                        avatar: "$video.owner.avatar"
                    }
                }
            }
        ]);

        return res
            .status(200)
            .json(new ApiResponse(200, likedVideos, "Liked videos fetched successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Some error occured while getting liked videos");
    }
});


const getLikedComments = asyncHandler(async (req, res) => {
    try {
        const likedComments = await Like.find({ comment: { $ne: null }, likedBy: req.user._id }).populate("comment");
        return res.status(200).json(new ApiResponse(200, likedComments, "Liked comments fetched successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Some error occurred while getting liked comments");
    }
});


const getLikedTweets = asyncHandler(async (req, res) => {
    try {
        const likedTweets = await Like.find({ tweet: { $ne: null }, likedBy: req.user._id, isDislike: false }).populate("tweet");
        return res.status(200).json(new ApiResponse(200, likedTweets, "Liked tweets fetched successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Some error occurred while getting liked tweets");
    }
});


export {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos,
    getLikedComments,
    getLikedTweets
}