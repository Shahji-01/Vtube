import { Router } from 'express';
import {
    getChannelStats,
    getChannelVideos,
} from "../controllers/dashboard.controller.js"
import {verifyJWT} from "../middlewares/auth.middleware.js"
import {cacheMiddleware} from "../utils/cache.js"

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router.route("/stats").get(cacheMiddleware(300), getChannelStats);
router.route("/videos").get(getChannelVideos);

export default router