import { Router } from 'express';
import {
    createTweet,
    deleteTweet,
    getUserTweets,
    updateTweet,
} from "../controllers/tweet.controller.js"
import {verifyJWT} from "../middlewares/auth.middleware.js"

const router = Router();

// GET is public — logged-out visitors can read tweets on any channel
router.route("/user/:user_Id").get(getUserTweets);

// Write routes require authentication
router.use(verifyJWT);
router.route("/").post(createTweet);
router.route("/:tweet_Id").patch(updateTweet).delete(deleteTweet);

export default router