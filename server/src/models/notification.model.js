import mongoose, {Schema} from "mongoose";

const notificationSchema = new Schema({
    type: {
        type: String,
        enum: ["LIKE", "COMMENT", "SUBSCRIBE", "TWEET"],
        required: true
    },
    recipient: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    sender: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    video: {
        type: Schema.Types.ObjectId,
        ref: "Video"
    },
    comment: {
        type: Schema.Types.ObjectId,
        ref: "Comment"
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, {timestamps: true});

export const Notification = mongoose.model("Notification", notificationSchema);
