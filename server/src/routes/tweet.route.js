import { Router } from 'express';
import {
    createTweet,
    deleteTweet,
    getUserTweets,
    updateTweet,
} from "../controllers/tweet.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { validate } from "../middlewares/validate.middleware.js"
import { verifyOwnership } from "../middlewares/ownership.middleware.js"
import { Tweet } from "../models/tweet.model.js"
import {
    createTweetSchema,
    updateTweetSchema,
    deleteTweetSchema,
    getUserTweetsSchema,
} from "../validators/tweet.schema.js"

const router = Router();

// GET is public — logged-out visitors can read tweets on any channel.
// Still validate the id param so malformed ids are rejected with 400 before any DB query.
router.route("/user/:user_Id").get(validate(getUserTweetsSchema), getUserTweets);

// Write routes require authentication
router.use(verifyJWT);

// Per-route order: auth -> validate -> ownership -> controller
router.route("/").post(validate(createTweetSchema), createTweet);

router
    .route("/:tweet_Id")
    .patch(
        validate(updateTweetSchema),
        verifyOwnership(Tweet, "tweet_Id"),
        updateTweet
    )
    .delete(
        validate(deleteTweetSchema),
        verifyOwnership(Tweet, "tweet_Id"),
        deleteTweet
    );

export default router
