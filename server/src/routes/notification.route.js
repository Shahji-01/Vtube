import { Router } from 'express';
import {
    getNotifications,
    markAsRead,
    clearNotifications
} from "../controllers/notification.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { notificationIdParam } from "../validators/notification.schema.js";

const router = Router();

router.use(verifyJWT); // All notification routes require authentication

router.route("/").get(getNotifications);
router.route("/clear").delete(clearNotifications);
router.route("/:notificationId/read").patch(validate(notificationIdParam), markAsRead);

export default router;
