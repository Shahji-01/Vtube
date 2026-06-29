// ---------------------WATCH LATER ROUTES--------------------------------------
//
// Routes for the Watch Later feature, mounted at `/api/v1/watch-later`. Each
// route runs the centralized `validate(schema)` middleware first so a malformed
// `:videoId` is rejected with HTTP 400 before `verifyJWT` or any database
// access, then `verifyJWT` enforces authentication, then the controller runs.
// Middleware order: validate → verifyJWT → controller.
//
// Requirements: 4.2, 4.3, 6.1, 6.2

import { Router } from "express"
import { validate } from "../middlewares/validate.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { videoIdParamSchema } from "../validators/watchLater.schema.js"
import {
    addToWatchLater,
    removeFromWatchLater,
    listWatchLater,
} from "../controllers/watchLater.controller.js"

const router = Router()

router
    .route("/:videoId")
    .post(validate(videoIdParamSchema), verifyJWT, addToWatchLater)
    .delete(validate(videoIdParamSchema), verifyJWT, removeFromWatchLater)

router.route("/").get(verifyJWT, listWatchLater)

export default router
