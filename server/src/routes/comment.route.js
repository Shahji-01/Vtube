import { Router } from 'express';
import {
    addComment,
    deleteComment,
    getVideoComments,
    updateComment,
    getCommentReplies
} from "../controllers/comment.controller.js"
import {verifyJWT, optionalJWT} from "../middlewares/auth.middleware.js"

const router = Router();

router.route("/:video_Id")
    .get(optionalJWT, getVideoComments)
    .post(verifyJWT, addComment);

router.route("/c/:comment_Id")
    .delete(verifyJWT, deleteComment)
    .patch(verifyJWT, updateComment);

router.route("/replies/:comment_Id")
    .get(optionalJWT, getCommentReplies);

export default router