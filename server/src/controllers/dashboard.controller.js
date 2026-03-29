import mongoose from "mongoose"
import {Video} from "../models/video.model.js"
import {Subscription} from "../models/subscription.model.js"
import {Like} from "../models/like.model.js"
import {Comment} from "../models/comment.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"

/*--------------------------CAHNNELStats------------------*/

const getChannelStats = asyncHandler(async (req, res) => {
    try {
        if (!req.user) {
            throw new ApiError(403, "User not logged in");
        }
        
        const userId = req.user._id;

        const totalSubscribers = await Subscription.countDocuments({ channel: userId });

        const videos = await Video.find({ owner: userId });
        const totalVideos = videos.length;
        
        let totalVideoViews = 0;
        const videoIds = videos.map(video => {
            totalVideoViews += (video.views || 0);
            return video._id;
        });

        const totalLikes = videoIds.length > 0
            ? await Like.countDocuments({ video: { $in: videoIds } })
            : 0;

        const totalComments = videoIds.length > 0
            ? await Comment.countDocuments({ video: { $in: videoIds } })
            : 0;

        const stats = {
            totalSubscribers,
            totalVideos,
            totalVideoViews,
            totalLikes,
            totalComments
        };

        res.status(200).json(new ApiResponse(200, stats, "Channel Stats fetched successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Error getting channel stats");
    }
});


/*--------------------------ALLVIDEOSOFACAHNNEL------------------*/


const getChannelVideos = asyncHandler(async (req, res) => {
    try {
        if (!req.user) {
            throw new ApiError(403, "User not logged in");
        }
        const channelVideos = await Video.find({ owner: req.user._id }).sort({ createdAt: -1 });
        
        res.status(200).json(new ApiResponse(200, channelVideos, "Channel videos fetched successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Error fetching channel videos");
    }
});


export {
    getChannelStats, 
    getChannelVideos
}



