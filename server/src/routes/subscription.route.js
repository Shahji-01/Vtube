import { Router } from 'express';
import {
    createChannel,
    getSubscribedChannels,
    getUserChannelSubscribers,
    toggleSubscription,
    getSubscribedChannelsVideos
} from "../controllers/subscription.controller.js"
import {verifyJWT} from "../middlewares/auth.middleware.js"
import {validate} from "../middlewares/validate.middleware.js"
import {channelIdParam, userIdParam, subscriberIdParam} from "../validators/subscription.schema.js"

const router = Router();
router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

// Order: verifyJWT (applied above) → validate(param ObjectId) → controller.
router.route("/create/c/:user_Id").post(validate(userIdParam), createChannel)
router
    .route("/c/:channel_Id")
    .get(validate(channelIdParam), getUserChannelSubscribers)

router.route("/toggle/c/:channel_Id").post(validate(channelIdParam), toggleSubscription);

router.route("/u/:subscriberId").get(validate(subscriberIdParam), getSubscribedChannels);

router.route("/videos").get(getSubscribedChannelsVideos);

export default router