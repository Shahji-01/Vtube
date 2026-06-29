import mongoose, { isValidObjectId } from "mongoose"
import {Comment} from "../models/comment.model.js"
import {Video} from "../models/video.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"
import {triggerNotification} from "../utils/notification.js"
import {resolveCommentContent} from "../services/commentContent.js"

/*------------GETVIDECOMMENTS----------------*/

const getVideoComments = asyncHandler(async (req, res) => {
    const { video_Id } = req.params;
    const { page = 1, limit = 10, sort = "newest" } = req.query;

    if (!isValidObjectId(video_Id)) {
        throw new ApiError(400, "Invalid video ID");
    }

    // Pinned comments always come first (R3.6); the secondary order depends on
    // the requested sort: `top` ranks by likes then recency (R3.7), while
    // `newest` (or an absent/unknown value) preserves the existing recency
    // ordering (R3.8). `likesCount` is computed below, so this $sort must run
    // AFTER the $addFields that produces it.
    const sortStage = sort === "top"
        ? { pinned: -1, likesCount: -1, createdAt: -1 }
        : { pinned: -1, createdAt: -1 };

    const commentsAggregation = await Comment.aggregate([
        {
            $match: {
                video: new mongoose.Types.ObjectId(video_Id),
                parentComment: null,
                isHidden: { $ne: true }
            }
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
        },
        {
            $sort: sortStage
        },
        {
            $skip: (parseInt(page) - 1) * parseInt(limit)
        },
        {
            $limit: parseInt(limit)
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
        throw new ApiError(500, "Some error occurred while adding comment");
    }
});//DONE!


/*----------------UPDATECOMMENT--------------*/

const updateComment = asyncHandler(async (req, res) => {
    // TODO: update a comment
    const {comment_Id} = req.params;

    // Unify the comment content field: prefer `commentContent`, fall back to the
    // legacy `newComment`, trimming whitespace (Req 5.1, 5.2, 5.4).
    const content = resolveCommentContent(req.body);

    if (!content) {
        throw new ApiError(400, "commentContent must not be empty");
    }

    try {
        const updatedComment = await Comment.findByIdAndUpdate(comment_Id,
            {
                content
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
        throw new ApiError(500, "Some error occurred while updating comment");
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

/*--------------PINCOMMENT--------------------*/

const pinComment = asyncHandler(async (req, res) => {
    const { comment_Id } = req.params;

    // The `verifyVideoOwnerOfComment` guard has already validated ownership and
    // stashed the loaded comment on `req.resource`. Fall back to a fresh load
    // if it is missing for any reason.
    const comment = req.resource || await Comment.findById(comment_Id);

    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    // Pinning an already-pinned comment is an idempotent no-op success and must
    // not count against the pin limit (R3.2).
    if (comment.pinned) {
        return res
            .status(200)
            .json(new ApiResponse(200, comment, "Comment pinned"));
    }

    // Enforce Pin_Limit = 1 per video: if a pinned comment already exists,
    // pinning another → 409 (R3.4).
    const pinnedCount = await Comment.countDocuments({ video: comment.video, pinned: true });

    if (pinnedCount >= 1) {
        throw new ApiError(409, "Pin limit reached: unpin the current pinned comment first");
    }

    const updated = await Comment.findByIdAndUpdate(
        comment._id,
        { pinned: true, pinnedAt: new Date() },
        { new: true, validateBeforeSave: false }
    );

    return res
        .status(200)
        .json(new ApiResponse(200, updated, "Comment pinned"));
});//DONE!


/*--------------UNPINCOMMENT--------------------*/

const unpinComment = asyncHandler(async (req, res) => {
    const { comment_Id } = req.params;

    const comment = req.resource || await Comment.findById(comment_Id);

    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    // Unpinning is idempotent: clear the pin state regardless of current value (R3.5).
    const updated = await Comment.findByIdAndUpdate(
        comment._id,
        { pinned: false, pinnedAt: null },
        { new: true, validateBeforeSave: false }
    );

    return res
        .status(200)
        .json(new ApiResponse(200, updated, "Comment unpinned"));
});//DONE!


export {
    getVideoComments, 
    addComment, 
    updateComment,
    deleteComment,
    getCommentReplies,
    pinComment,
    unpinComment
}