import mongoose from "mongoose"
import {Comment} from "../models/comment.model.js"
import {Video} from "../models/video.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"
import {triggerNotification} from "../utils/notification.js"

/*------------GETVIDECOMMENTS----------------*/

const getVideoComments = asyncHandler(async (req, res) => {
    const { video_Id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!isValidObjectId(video_Id)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const commentsAggregation = await Comment.aggregate([
        {
            $match: {
                video: new mongoose.Types.ObjectId(video_Id),
                parentComment: null
            }
        },
        {
            $sort: { createdAt: -1 }
        },
        {
            $skip: (parseInt(page) - 1) * parseInt(limit)
        },
        {
            $limit: parseInt(limit)
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullName: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                owner: { $first: "$owner" }
            }
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "comment",
                as: "likes"
            }
        },
        {
            $addFields: {
                likesCount: {
                    $size: {
                        $filter: {
                            input: "$likes",
                            as: "l",
                            cond: { $eq: ["$$l.isDislike", false] }
                        }
                    }
                },
                dislikesCount: {
                    $size: {
                        $filter: {
                            input: "$likes",
                            as: "l",
                            cond: { $eq: ["$$l.isDislike", true] }
                        }
                    }
                },
                isLiked: {
                    $cond: {
                        if: {
                            $in: [req.user?._id, {
                                $map: {
                                    input: { $filter: { input: "$likes", as: "l", cond: { $eq: ["$$l.isDislike", false] } } },
                                    as: "l",
                                    in: "$$l.likedBy"
                                }
                            }]
                        },
                        then: true,
                        else: false
                    }
                },
                isDisliked: {
                    $cond: {
                        if: {
                            $in: [req.user?._id, {
                                $map: {
                                    input: { $filter: { input: "$likes", as: "l", cond: { $eq: ["$$l.isDislike", true] } } },
                                    as: "l",
                                    in: "$$l.likedBy"
                                }
                            }]
                        },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                likes: 0
            }
        }
    ]);

    return res
        .status(200)
        .json(new ApiResponse(200, commentsAggregation, "Comments fetched successfully"));
});//DONE!


/*-------------ADDCOMMENT-----------------*/

const addComment = asyncHandler(async (req, res) => {
    // Extracting video ID from request parameters
    const { video_Id } = req.params;

    // Extracting comment content from request body
    const { commentContent, parentComment } = req.body;

    if (!(video_Id || commentContent)) {
        throw new ApiError(404, "Invalid video_Id or you have not written any comment");
    }

    try {
        const newComment = await Comment.create({
            content: commentContent,
            video: video_Id,
            owner: req.user._id,
            parentComment: parentComment || null
        });

        // Checking if new comment was successfully created
        if (!newComment) {
            // If new comment is not created, throw an error
            throw new ApiError(500, "Can not add a comment to video");
        }

        // Sending a success response with the newly created comment
        const video = await Video.findById(video_Id);
        if (video) {
            await triggerNotification({
                type: "COMMENT",
                recipient: video.owner,
                sender: req.user._id,
                video: video_Id,
                comment: newComment._id
            });
        }

        res
            .status(200)
            .json(new ApiResponse(200, newComment, "Comment added successfully"));
    } catch (error) {
        // If an error occurs during the process, throw an error
        throw new ApiError(500, error, "Some error occurred while adding comment");
    }
});//DONE!


/*----------------UPDATECOMMENT--------------*/

const updateComment = asyncHandler(async (req, res) => {
    // TODO: update a comment
    const {comment_Id} = req.params;

    const {newComment} = req.body;

    // console.log(newComment, comment_Id, "Comment and video_Id ");

    if (!(comment_Id || newComment)) {
        throw new ApiError(404, "Invalid comment_Id : can not update empty");
    }

    try {
        const updatedComment = await Comment.findByIdAndUpdate(comment_Id,
            {
                content: newComment
            },
            {
                new: true,
                validateBeforeSave: false
            })
        
            // console.log(updatedComment,"Comment updated")

        res
        .status(200)
        .json(new ApiResponse(200, updatedComment, "Comment updated successfully"))

    } catch (error) {
        throw new ApiError(500, error, "Some error occurred while updating comment");
    }
}) //DONE!


/*--------------DELETECOMMENT--------------------*/

const deleteComment = asyncHandler(async (req, res) => {
    // TODO: delete a comment
    const {comment_Id} = req.params

    // console.log(comment_Id,"Comment id")

    if (!comment_Id) {
        throw new ApiError(404, "Enter Comment Id to delete comment")
    }

    try {
        const comment = await Comment.findById({_id:comment_Id})
        
        if (!comment) {
            throw new ApiError(404, "comment not found : See if comment id is correct")
        }
       
        if (comment.owner.toString() !== req.user._id.toString()) {
            throw new ApiError(403, "You are not allowed to delete this comment")
        }
        
        const deletedComment = await Comment.findByIdAndDelete(comment_Id)
        
        if (!deletedComment) {
            throw new ApiError(500, "Comment could not deleted: try again")
        }

        res
        .status(200)
        .json(new ApiResponse(200, deletedComment, "Comment deleted successfully"))
    } catch (error) {
        throw new ApiError(500, "An error occured while deleting your comment: please try again later")
    }
})//DONE!


/*--------------GETCOMMENTREPLIES--------------------*/

const getCommentReplies = asyncHandler(async (req, res) => {
    const { comment_Id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!isValidObjectId(comment_Id)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    const repliesAggregation = await Comment.aggregate([
        {
            $match: {
                parentComment: new mongoose.Types.ObjectId(comment_Id)
            }
        },
        {
            $sort: { createdAt: 1 }
        },
        {
            $skip: (parseInt(page) - 1) * parseInt(limit)
        },
        {
            $limit: parseInt(limit)
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullName: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                owner: { $first: "$owner" }
            }
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "comment",
                as: "likes"
            }
        },
        {
            $addFields: {
                likesCount: {
                    $size: {
                        $filter: {
                            input: "$likes",
                            as: "l",
                            cond: { $eq: ["$$l.isDislike", false] }
                        }
                    }
                },
                dislikesCount: {
                    $size: {
                        $filter: {
                            input: "$likes",
                            as: "l",
                            cond: { $eq: ["$$l.isDislike", true] }
                        }
                    }
                },
                isLiked: {
                    $cond: {
                        if: {
                            $in: [req.user?._id, {
                                $map: {
                                    input: { $filter: { input: "$likes", as: "l", cond: { $eq: ["$$l.isDislike", false] } } },
                                    as: "l",
                                    in: "$$l.likedBy"
                                }
                            }]
                        },
                        then: true,
                        else: false
                    }
                },
                isDisliked: {
                    $cond: {
                        if: {
                            $in: [req.user?._id, {
                                $map: {
                                    input: { $filter: { input: "$likes", as: "l", cond: { $eq: ["$$l.isDislike", true] } } },
                                    as: "l",
                                    in: "$$l.likedBy"
                                }
                            }]
                        },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                likes: 0
            }
        }
    ]);

    return res
        .status(200)
        .json(new ApiResponse(200, repliesAggregation, "Replies fetched successfully"));
});

export {
    getVideoComments, 
    addComment, 
    updateComment,
    deleteComment,
    getCommentReplies
}