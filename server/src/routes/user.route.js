import { Router } from "express";
import {
        registerUser,
        loginUser, 
        logoutUser, 
        refreshAccessTooken, 
        changeCurrentPassword, 
        getCurrentUser, 
        updateUserDetails, 
        updateUserAvatar, 
        updateUserCoverImage, 
        getUserChannelProfile, 
        getWatchHistory,
        clearWatchHistory,
        removeVideoFromWatchHistory
    } from "../controllers/user.controller.js";
import {uploadImage} from "../middlewares/multer.middleware.js"
import { verifyJWT, optionalJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
        registerBody,
        loginBody,
        changePasswordBody,
        updateAccountBody,
        watchHistoryVideoIdParam
    } from "../validators/user.schema.js";
const router = Router();

// ------ register user

router.route("/register").post(
    // Middleware to handle file uploads for avatar and coverImage fields
    uploadImage.fields(
       [{
            name: "avatar", // Field name for avatar
            maxLength: 1 // Maximum number of files allowed for avatar (1 in this case)
        },
        {
            name: "coverImage", // Field name for coverImage
            maxLength: 1 // Maximum number of files allowed for coverImage (1 in this case)
        }]
    ),
    // Body validated AFTER multer so req.body is populated
    validate(registerBody),
    // Handler function for registering user
    registerUser
);

// ------- login user
router.route("/login").post(validate(loginBody), loginUser);

// secure routes
// ----------- logout user
router.route("/logout").post(verifyJWT ,logoutUser);

router.route("/refresh-token").post(refreshAccessTooken);

router.route("/change-password").post(verifyJWT, validate(changePasswordBody), changeCurrentPassword)

router.route("/current-user").get(verifyJWT, getCurrentUser)

router
.route("/update-account")
.patch(verifyJWT, validate(updateAccountBody), updateUserDetails) //if post all details will be chnaged

router
.route("/avatar")
.patch(verifyJWT, uploadImage.single("avatar"),updateUserAvatar)

router
.route("/cover-image")
.patch(verifyJWT,uploadImage.single("coverImage"),updateUserCoverImage)

router
.route("/c/:username")
.get(optionalJWT, getUserChannelProfile) // public — optionalJWT attaches req.user if logged in (for isSubscribed)

router
.route("/history")
.get(verifyJWT, getWatchHistory)
.delete(verifyJWT, clearWatchHistory)

router
.route("/history/:video_Id")
.delete(verifyJWT, validate(watchHistoryVideoIdParam), removeVideoFromWatchHistory)

export default  router ;
