import { Router } from 'express';
import {
    addVideoToPlaylist,
    createPlaylist,
    deletePlaylist,
    getPlaylistById,
    getUserPlaylists,
    removeVideoFromPlaylist,
    updatePlaylist,
} from "../controllers/playlist.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { validate } from "../middlewares/validate.middleware.js"
import { verifyOwnership } from "../middlewares/ownership.middleware.js"
import { Playlist } from "../models/playlist.model.js"
import {
    createPlaylistSchema,
    playlistIdParamSchema,
    videoPlaylistParamsSchema,
    userIdParamSchema,
} from "../validators/playlist.schema.js"

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router.route("/").post(validate(createPlaylistSchema), createPlaylist)

router
    .route("/:playlistId")
    .get(validate(playlistIdParamSchema), getPlaylistById)
    .patch(
        validate(playlistIdParamSchema),
        verifyOwnership(Playlist, "playlistId", "owner"),
        updatePlaylist
    )
    .delete(
        validate(playlistIdParamSchema),
        verifyOwnership(Playlist, "playlistId", "owner"),
        deletePlaylist
    );

router.route("/add/:videoId/:playlistId").patch(
    validate(videoPlaylistParamsSchema),
    verifyOwnership(Playlist, "playlistId", "owner"),
    addVideoToPlaylist
);
router.route("/remove/:videoId/:playlistId").patch(
    validate(videoPlaylistParamsSchema),
    verifyOwnership(Playlist, "playlistId", "owner"),
    removeVideoFromPlaylist
);

router.route("/user/:userId").get(validate(userIdParamSchema), getUserPlaylists);

export default router
