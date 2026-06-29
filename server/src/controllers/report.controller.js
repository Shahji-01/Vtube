import { Report } from "../models/report.model.js"
import { Video } from "../models/video.model.js"
import { Comment } from "../models/comment.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"


//--------------------createReport--------------------

const createReport = asyncHandler(async (req, res) => {
    // Body is already validated by the route's validate(createReportSchema) middleware.
    const { targetType, targetId, reason } = req.body

    // Verify the reported target actually exists (404 otherwise — R4.1).
    if (targetType === "Video") {
        const video = await Video.findById(targetId)
        if (!video) {
            throw new ApiError(404, "No video found to report")
        }
    } else if (targetType === "Comment") {
        const comment = await Comment.findById(targetId)
        if (!comment) {
            throw new ApiError(404, "No comment found to report")
        }
    }

    // Duplicate-active check: at most one OPEN report per reporter per target (R4.3).
    const existing = await Report.findOne({
        reporter: req.user._id,
        status: "OPEN",
        [targetType === "Video" ? "video" : "comment"]: targetId,
    })
    if (existing) {
        throw new ApiError(409, "You already have an open report for this content")
    }

    // Create the report. The partial unique index is the race-condition backstop:
    // map an E11000 duplicate-key error to the same friendly 409.
    let report
    try {
        report = await Report.create({
            reporter: req.user._id,
            targetType,
            video: targetType === "Video" ? targetId : undefined,
            comment: targetType === "Comment" ? targetId : undefined,
            reason,
            status: "OPEN",
        })
    } catch (error) {
        if (error?.code === 11000) {
            throw new ApiError(409, "You already have an open report for this content")
        }
        throw error
    }

    return res
        .status(201)
        .json(new ApiResponse(201, report, "Report submitted"))
})


//--------------------listReports--------------------

const listReports = asyncHandler(async (req, res) => {
    // Optional status filter (validated by the route). Moderator-only access is
    // enforced by the route's requireModerator middleware (R4.5, R4.8).
    const { status } = req.query
    const filter = status ? { status } : {}

    const reports = await Report.find(filter)
        .sort({ createdAt: -1 })
        .populate("reporter", "username")
        .populate("video", "title")
        .populate("comment", "content")

    return res
        .status(200)
        .json(new ApiResponse(200, reports, "Reports fetched successfully"))
})


//--------------------resolveReport--------------------

const resolveReport = asyncHandler(async (req, res) => {
    const report = await Report.findById(req.params.reportId)
    if (!report) {
        throw new ApiError(404, "No report found")
    }

    // Hide the reported target, then mark the report resolved (R4.6).
    if (report.targetType === "Video") {
        await Video.findByIdAndUpdate(report.video, { isHidden: true })
    } else if (report.targetType === "Comment") {
        await Comment.findByIdAndUpdate(report.comment, { isHidden: true })
    }

    report.status = "RESOLVED"
    await report.save()

    return res
        .status(200)
        .json(new ApiResponse(200, report, "Report resolved"))
})


//--------------------dismissReport--------------------

const dismissReport = asyncHandler(async (req, res) => {
    const report = await Report.findById(req.params.reportId)
    if (!report) {
        throw new ApiError(404, "No report found")
    }

    // Dismiss the report; the target is left unchanged (R4.7).
    report.status = "DISMISSED"
    await report.save()

    return res
        .status(200)
        .json(new ApiResponse(200, report, "Report dismissed"))
})


export {
    createReport,
    listReports,
    resolveReport,
    dismissReport,
}
