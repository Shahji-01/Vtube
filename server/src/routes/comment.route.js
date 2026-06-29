import { Router } from 'express';
import {
    addComment,
    deleteComment,
    getVideoComments,
    updateComment,
    getCommentReplies,
    pinComment,
    unpinComment
} from "../controllers/comment.controller.js"
import {verifyJWT, optionalJWT} from "../middlewares/auth.middleware.js"
import { validate } from "../middlewares/validate.middleware.js"
import { verifyOwnership, verifyVideoOwnerOfComment } from "../middlewares/ownership.middleware.js"
import { Comment } from "../models/comment.model.js"
import {
    getVideoCommentsSchema,
    addCommentSchema,
    updateCommentSchema,
    deleteCommentSchema,
    getCommentRepliesSchema,
    pinParam
} from "../validators/comment.schema.js"

const router = Router();

router.route("/:video_Id")
    .get(optionalJWT, validate(getVideoCommentsSchema), getVideoComments)
    .post(verifyJWT, validate(addCommentSchema), addComment);

router.route("/c/:comment_Id")
    .delete(
        verifyJWT,
        validate(deleteCommentSchema),
        verifyOwnership(Comment, "comment_Id"),
        deleteComment
    )
    .patch(
        verifyJWT,
        validate(updateCommentSchema),
        verifyOwnership(Comment, "comment_Id"),
        updateComment
    );

router.route("/replies/:comment_Id")
    .get(optionalJWT, validate(getCommentRepliesSchema), getCommentReplies);

router.route("/c/:comment_Id/pin")
    .patch(verifyJWT, validate(pinParam), verifyVideoOwnerOfComment("comment_Id"), pinComment);

router.route("/c/:comment_Id/unpin")
    .patch(verifyJWT, validate(pinParam), verifyVideoOwnerOfComment("comment_Id"), unpinComment);

export default router
