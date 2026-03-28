import { Notification } from "../models/notification.model.js";

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

        return await Notification.create({
            type,
            recipient,
            sender,
            video,
            comment
        });
    } catch (error) {
        console.error("Notification Trigger Error:", error);
        return null;
    }
};
