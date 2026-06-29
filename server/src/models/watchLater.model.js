import mongoose, { Schema } from "mongoose";

const watchLaterSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        video: {
            type: Schema.Types.ObjectId,
            ref: "Video",
            required: true,
        },
    },
    { timestamps: true } // createdAt gives a natural "recently added" sort order
);

// At most one entry per user+video (R4.1); makes add idempotent at the DB layer.
watchLaterSchema.index({ user: 1, video: 1 }, { unique: true });

export const WatchLater = mongoose.model("WatchLater", watchLaterSchema);
