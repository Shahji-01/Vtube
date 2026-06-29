import mongoose, { Schema } from "mongoose";

const REPORT_REASONS = ["SPAM", "HARASSMENT", "HATE", "SEXUAL", "VIOLENCE", "MISINFORMATION", "OTHER"];
const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"];

const reportSchema = new Schema(
    {
        reporter: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        targetType: {
            type: String,
            enum: ["Video", "Comment"],
            required: true,
        },
        video: {
            type: Schema.Types.ObjectId,
            ref: "Video", // set when targetType === "Video"
        },
        comment: {
            type: Schema.Types.ObjectId,
            ref: "Comment", // set when targetType === "Comment"
        },
        reason: {
            type: String,
            enum: REPORT_REASONS,
            required: true,
        },
        status: {
            type: String,
            enum: REPORT_STATUSES,
            default: "OPEN",
            index: true,
        },
    },
    { timestamps: true }
);

// Partial unique indexes filtered to status:"OPEN" — once a report is RESOLVED/DISMISSED it
// leaves the partial index, so the same reporter may report the same target again later (R4.3).
reportSchema.index(
    { reporter: 1, video: 1 },
    { unique: true, partialFilterExpression: { status: "OPEN", targetType: "Video" } }
);
reportSchema.index(
    { reporter: 1, comment: 1 },
    { unique: true, partialFilterExpression: { status: "OPEN", targetType: "Comment" } }
);

export const Report = mongoose.model("Report", reportSchema);
export { REPORT_REASONS, REPORT_STATUSES };
