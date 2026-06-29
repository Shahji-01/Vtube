// ---------------------REPORT ROUTES------------------------------------------
//
// Routes for the content reporting + moderation feature, mounted at
// `/api/v1/reports`. Middleware order per route: verifyJWT (authentication) →
// requireModerator (moderator-only routes) → validate(schema) (input shape) →
// controller.
//
//   POST   /                      — any authenticated user files a report
//   GET    /                      — moderators list reports (optional ?status)
//   PATCH  /:reportId/resolve     — moderators resolve a report (hide target)
//   PATCH  /:reportId/dismiss     — moderators dismiss a report (no change)
//
// Requirements: 4.1, 4.5, 4.6, 4.7, 5.3

import { Router } from "express"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { requireModerator } from "../middlewares/moderation.middleware.js"
import { validate } from "../middlewares/validate.middleware.js"
import {
    createReportSchema,
    listReportsQuery,
    reportIdParam,
} from "../validators/report.schema.js"
import {
    createReport,
    listReports,
    resolveReport,
    dismissReport,
} from "../controllers/report.controller.js"

const router = Router()

router
    .route("/")
    .post(verifyJWT, validate(createReportSchema), createReport)
    .get(verifyJWT, requireModerator, validate(listReportsQuery), listReports)

router
    .route("/:reportId/resolve")
    .patch(verifyJWT, requireModerator, validate(reportIdParam), resolveReport)

router
    .route("/:reportId/dismiss")
    .patch(verifyJWT, requireModerator, validate(reportIdParam), dismissReport)

export default router
