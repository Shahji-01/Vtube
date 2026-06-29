import { Notification } from "../models/notification.model.js";
import {
    emitNotification,
    emitUnreadCount,
} from "../socket/notificationSocket.js";
import logger from "../config/logger.js";

/**
 * Trigger a notification
 * @param {Object} params
 * @param {string} params.type - LIKE, COMMENT, SUBSCRIBE, TWEET
 * @param {string} params.recipient - User ID who receives the notification
 * @param {string} params.sender - User ID who triggered the action
 * @param {string} [params.video] - Optional Video ID
 * @param {string} [params.comment] - Optional Comment ID
 */
export const triggerNotification = async ({ type, recipient, sender, video, comment }) => {
    try {
        // Don't notify if sender is same as recipient
        if (recipient.toString() === sender.toString()) return null;

        const notification = await Notification.create({
            type,
            recipient,
            sender,
            video,
            comment
        });

        // Realtime delivery happens AFTER a successful persist. It runs in its
        // own try/catch so an emit failure (or absent socket layer) can never
        // affect the persisted record or bubble out of this function. The emit
        // helpers are no-ops when Socket.IO is not initialized (getIO() === null),
        // so REST-only callers/tests still observe exactly one persisted record.
        try {
            // Mirror the populated shape returned by GET /api/v1/notifications.
            const payload = await Notification.findById(notification._id)
                .populate("sender", "username fullName avatar")
                .populate("video", "title thumbnail");

            emitNotification(recipient, payload);

            const unread = await Notification.countDocuments({
                recipient,
                isRead: false
            });
            emitUnreadCount(recipient, unread);
        } catch (emitError) {
            logger.error({ err: emitError }, "Notification realtime emit error");
        }

        return notification;
    } catch (error) {
        logger.error({ err: error }, "Notification Trigger Error");
        return null;
    }
};
