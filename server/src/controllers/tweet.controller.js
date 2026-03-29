import mongoose, { isValidObjectId } from "mongoose"
import {Tweet} from "../models/tweet.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"

/*---------------------CreateTweet-------------------*/

const createTweet = asyncHandler(async (req, res) => {
    // Accept both `content` (Channel page) and `tweetToBeCreated` (legacy)
    const content = req.body.content || req.body.tweetToBeCreated;

    if (!content?.trim()) {
        throw new ApiError(400, "Tweet content is required")
    }

    try {
        const createdTweet = await Tweet.create({
            content,
            owner: req.user._id
        })
      if (!createdTweet) {
          throw new ApiError(500, "Tweet could not be created")
      }
      res
      .status(200)
      .json(new ApiResponse(200, createdTweet, "Tweet created successfully"))

    } catch (error) {
        throw new ApiError(500, error?.message || "Error creating tweet")
    }
})//DONE!

/*-------------------GetUserTweet--------------------*/

const getUserTweets = asyncHandler(async (req, res) => {
    // TODO: get user tweets
    const {user_Id} = req.params
    
    if (!(user_Id || isValidObjectId(user_Id))) {
        throw new ApiError(404, "Enter user id to get user tweets")
    }
   
   try {
     const userTweets = await Tweet.find({owner : user_Id}).exec()
 
     if (!(userTweets || userTweets.length === 0)) {
         throw new ApiError(500, `Can not fetch user ${user_Id} tweets at thid moment : try again later`)
     }
 
     res
     .status(200)
     .json(new ApiResponse(200, userTweets, "User Tweets fetched"))
 
   } catch (error) {
     throw new ApiError(500, error, "Could not fetch user tweets at thid moment")
   }
})//DONE!

/*------------UPDATE TWEET----------------*/

const updateTweet = asyncHandler(async (req, res) => {
    const {tweet_Id} = req.params
    const {tweet} = req.body

    if (!tweet || !tweet_Id) {
        throw new ApiError(400, "Tweet content and tweet ID are required")
    }
    try {
        const existingTweet = await Tweet.findOne({ _id: tweet_Id, owner: req.user._id });
        if (!existingTweet) {
             throw new ApiError(403, "Tweet not found or you are not authorized to update this tweet")
        }
        const updatedTweet = await Tweet.findByIdAndUpdate(
            tweet_Id,
            { content: tweet },
            { new: true, validateBeforeSave: false }
        )

        if (!updatedTweet) {
            throw new ApiError(500, "Something went wrong while updating tweet")
        }

        res
        .status(200)
        .json(new ApiResponse(200, updatedTweet, "Tweet has been updated"))

    } catch (error) {
        if (error instanceof ApiError) throw error
        throw new ApiError(500, error?.message || "Error updating tweet")
    }
})//DONE!

/*--------------------DELETEtWEET----------------*/

const deleteTweet = asyncHandler(async (req, res) => {
    const {tweet_Id} = req.params

    if (!tweet_Id) {
        throw new ApiError(400, "Enter tweet_Id to delete tweet")
    }

    if (!isValidObjectId(tweet_Id)) {
        throw new ApiError(400, "Invalid tweet_Id: Enter valid tweet_Id")
    }

    try {
        const tweet = await Tweet.findById(tweet_Id)

        if (!tweet) {
            throw new ApiError(404, "Tweet not found")
        }

        // FIXED: was inverted — any user could delete, owner could not.
        if (tweet.owner.toString() !== req.user._id.toString()) {
            throw new ApiError(403, "You are not authorized to delete this tweet")
        }
        
        await Tweet.deleteOne({ _id: tweet_Id })

        res
        .status(200)
        .json(new ApiResponse(200, {}, "Your tweet has been deleted"))

    } catch (error) {
        if (error instanceof ApiError) throw error
        throw new ApiError(500, error?.message || "Something went wrong while deleting your tweet")
    }
})//DONE!

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}