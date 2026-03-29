import mongoose, {isValidObjectId} from "mongoose"
import {User} from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"
import {triggerNotification} from "../utils/notification.js"

/*-------------------Create Subscription document-------------*/
// ... existing createChannel remains fine ...
const createChannel = asyncHandler(async (req, res) => {
    const { user_Id } = req.params;

    if (!isValidObjectId(user_Id)) {
    throw new ApiError(404, "Invalid channel id :Try with valid id")        
    }

    try {
        const createdUserChannel = await Subscription.create(
            {
                channel: user_Id,
                subscriber:null
            }
        )

        if (!createdUserChannel) {
            throw new ApiError(404, "Couldn't create channel subscription")
        }

        res
        .status(201)
        .json(new ApiResponse(201, createdUserChannel, "Your Videotube channel has been created successfully : "))
    } catch (error) {
        throw new ApiError(500, error, "Something went wrong while creating your subscription")
    }
})


/*----------------------TOGGLESUBSCRIPTION----------------*/

const toggleSubscription = asyncHandler(async (req, res) => {
    const { channel_Id } = req.params;

    if (!isValidObjectId(channel_Id)) {
        throw new ApiError(404, "Enter valid channel_Id to toggle subscription")
    }
  
    try {
        const existingSub = await Subscription.findOne({
            subscriber: req.user._id,
            channel: channel_Id
        });

        if (existingSub) {
            await Subscription.findByIdAndDelete(existingSub._id);
            return res.status(200).json(new ApiResponse(200, null, "Unsubscribed successfully"));
        } else {
            const newSub = await Subscription.create({
                subscriber: req.user._id,
                channel: channel_Id
            });

            // Trigger Notification
            await triggerNotification({
                type: "SUBSCRIBE",
                recipient: channel_Id,
                sender: req.user._id
            });

            return res.status(200).json(new ApiResponse(200, newSub, "Subscribed successfully"));
        }
    } catch (error) {
        throw new ApiError(500, "Something went wrong while toggling subscription: " + error.message)
    }
})//DONE!


/*---------------------------GETUSERcHANNELSUBSCRIBERS-----------*/

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const { channel_Id } = req.params
    
    if (!isValidObjectId(channel_Id)) {
        throw new ApiError(404, "Tyr againn with valid channel id")
    }

    try {
        const channelSubscriptions = await Subscription.find({channel:channel_Id}) 
        const subscriberIds = channelSubscriptions.map(subscription => subscription.subscriber)


        res
        .status(200)
        .json(new ApiResponse(200,subscriberIds,"Channel Subscriber fetched successfully"));

    } catch (error) {
        throw new ApiError(500, error, "Something went wrong while getting subscribers :Please try again later")
    }
})//DONE!


/*------------------------GETSUBSCRIBERcHANNELS----------------*/

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params
    
    if (!isValidObjectId(subscriberId)) {
        throw new ApiError(404, "Try again with a valid subscriber id")
    }

    try {
        const userSubscriptions = await Subscription.find({subscriber:subscriberId}) 
        const channelIds = userSubscriptions.map(subscription => subscription.channel)

        
        res
        .status(200)
        .json(new ApiResponse(200,channelIds,"Subscribed channels fetched successfully"));

    } catch (error) {
        throw new ApiError(500, error, "Something went wrong while getting subscribers :Please try again later")
    }
})//DONE!


const getSubscribedChannelsVideos = asyncHandler(async (req, res) => {
    const subscriberId = req.user._id;

    try {
        const videos = await Subscription.aggregate([
            {
                $match: {
                    subscriber: new mongoose.Types.ObjectId(subscriberId)
                }
            },
            {
                $lookup: {
                    from: "videos",
                    localField: "channel",
                    foreignField: "owner",
                    as: "channelVideos"
                }
            },
            {
                $unwind: "$channelVideos"
            },
            {
                $match: {
                    "channelVideos.isPublished": true
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "channelVideos.owner",
                    foreignField: "_id",
                    as: "owner"
                }
            },
            {
                $unwind: "$owner"
            },
            {
                $project: {
                    _id: "$channelVideos._id",
                    title: "$channelVideos.title",
                    description: "$channelVideos.description",
                    thumbnail: "$channelVideos.thumbnail",
                    videoFile: "$channelVideos.videoFile",
                    duration: "$channelVideos.duration",
                    views: "$channelVideos.views",
                    createdAt: "$channelVideos.createdAt",
                    owner: {
                        _id: "$owner._id",
                        username: "$owner.username",
                        fullName: "$owner.fullName",
                        avatar: "$owner.avatar"
                    }
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ]);

        return res.status(200).json(new ApiResponse(200, videos, "Subscribed channels videos fetched successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Something went wrong while fetching subscribed channels videos");
    }
});


export {
    createChannel,
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels,
    getSubscribedChannelsVideos
}