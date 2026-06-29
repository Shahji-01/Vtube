import mongoose, { Schema } from "mongoose";

const watchProgressSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    video: { type: Schema.Types.ObjectId, ref: "Video", required: true, index: true },
    positionSeconds: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true } // provides updatedAt (R3.1)
);

// At most one record per user+video (R3.1) — also the upsert key (R3.6).
watchProgressSchema.index({ user: 1, video: 1 }, { unique: true });

export const WatchProgress = mongoose.model("WatchProgress", watchProgressSchema);
