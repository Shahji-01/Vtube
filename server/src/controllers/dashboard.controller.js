import mongoose from "mongoose"
import {Video} from "../models/video.model.js"
import {Subscription} from "../models/subscription.model.js"
import {Like} from "../models/like.model.js"
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

        // Count subscribers
        const totalSubscribers = await Subscription.countDocuments({ channel: userId });

        // Get videos
        const videos = await Video.find({ owner: userId });
        const totalVideos = videos.length;
        
        let totalVideoViews = 0;
        videos.forEach(video => {
            totalVideoViews += (video.views || video.view || 0); 
        });

        // Get total likes for all videos owned by the user
        let totalLikes = 0;
        const videoIds = videos.map(video => video._id);
        if (videoIds.length > 0) {
            totalLikes = await Like.countDocuments({ video: { $in: videoIds } });
        }

        const stats = {
            totalSubscribers,
            totalVideos,
            totalVideoViews,
            totalLikes
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



