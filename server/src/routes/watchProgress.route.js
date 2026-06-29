import { Router } from "express";
import {
    saveProgress,
    getProgress,
} from "../controllers/watchProgress.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { validate } from "../middlewares/validate.middleware.js"
import {
    videoIdParamSchema,
    saveProgressBodySchema,
} from "../validators/watchProgress.schema.js"

const router = Router();

// Middleware order: validate → verifyJWT → controller (mirrors watchLater.route.js),
// so a malformed `:videoId` is rejected with HTTP 400 before auth or any DB
// access. The `validate` middleware accepts a single `{ params?, query?, body? }`
// schema, so the per-part schemas are merged for the PUT route.
router
    .route("/:videoId")
    .put(
        validate({
            params: videoIdParamSchema.params,
            body: saveProgressBodySchema.body,
        }),
        verifyJWT,
        saveProgress
    )
    .get(validate(videoIdParamSchema), verifyJWT, getProgress);

export default router
