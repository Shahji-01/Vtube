import { Notification } from "../models/notification.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const getNotifications = asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ recipient: req.user._id })
        .sort({ createdAt: -1 })
        .populate("sender", "username avatar")
        .populate("video", "title thumbnail")
        .limit(20);

    return res.status(200).json(
        new ApiResponse(200, notifications, "Notifications fetched successfully")
    );
});

const markAsRead = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: req.user._id },
        { isRead: true },
        { new: true }
    );

    if (!notification) {
        throw new ApiError(404, "Notification not found");
    }

    return res.status(200).json(
        new ApiResponse(200, notification, "Notification marked as read")
    );
});

const clearNotifications = asyncHandler(async (req, res) => {
    await Notification.deleteMany({ recipient: req.user._id });

    return res.status(200).json(
        new ApiResponse(200, {}, "Notifications cleared successfully")
    );
});

export {
    getNotifications,
    markAsRead,
    clearNotifications
};
