/**
 * normalizeViews.js — one-time view-count consolidation runner (Req 4.6–4.9).
 *
 * Iterates every Video document that still carries the legacy `view` field and
 * applies the pure `normalizedUpdate(doc)` transform: set the canonical `views`
 * to the greater of `view`/`views` (never decreasing) and remove the legacy
 * `view` field. Per-document failures are caught so processing continues, and
 * the failed `_id`s are collected and reported in a structured summary.
 *
 * The routine is idempotent and non-decreasing (Req 4.7, 4.8): a second run
 * finds no remaining `view` fields and changes nothing. Failed documents are
 * left untouched and reported (Req 4.9).
 *
 * Run once via:  node src/scripts/normalizeViews.js
 * Exits 0 when every matched document succeeded, non-zero if any failed.
 */
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";

import connectDB from "../db/index.js";
import logger from "../config/logger.js";
import { configureDns } from "../config/dns.js";
import { Video } from "../models/video.model.js";
import { normalizedUpdate } from "../services/viewCount.js";

// Load environment the same way the server entrypoint does, then apply the
// optional custom DNS resolver before connecting (parity with src/index.js).
dotenv.config({ path: "./.env" });
configureDns(process.env.DNS_SERVERS);

/**
 * Normalize every Video document that still carries the legacy `view` field.
 *
 * @returns {Promise<{ processed: number, updated: number, failedIds: string[] }>}
 */
async function normalizeViews() {
  let processed = 0;
  let updated = 0;
  const failedIds = [];

  // `.lean()` returns the raw stored document including the legacy `view`
  // field, which is not part of the Video schema and would otherwise be
  // stripped from a hydrated Mongoose document. A cursor keeps memory bounded
  // for large collections.
  const cursor = Video.find({ view: { $exists: true } })
    .lean()
    .cursor();

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    processed += 1;
    try {
      await Video.updateOne({ _id: doc._id }, normalizedUpdate(doc));
      updated += 1;
    } catch (error) {
      // Leave the document's existing fields unchanged, continue processing
      // the rest, and record the failed `_id` (Req 4.9).
      failedIds.push(String(doc._id));
      logger.error(
        { err: error, videoId: String(doc._id) },
        "normalizeViews: failed to normalize document; continuing"
      );
    }
  }

  return { processed, updated, failedIds };
}

async function main() {
  await connectDB();

  const summary = await normalizeViews();

  logger.info(
    {
      processed: summary.processed,
      updated: summary.updated,
      failed: summary.failedIds.length,
      failedIds: summary.failedIds,
    },
    "normalizeViews: migration complete"
  );

  // Close the connection so the process can exit cleanly.
  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect();

  // Non-zero exit if any document failed to normalize (Req 4.9).
  process.exit(summary.failedIds.length > 0 ? 1 : 0);
}

// Only run the migration when this file is executed directly (e.g.
// `node src/scripts/normalizeViews.js`). When imported (e.g. by tests) the
// exported `normalizeViews` function is available without side effects.
const isDirectRun =
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    logger.error({ err: error }, "normalizeViews: fatal error; aborting");
    process.exit(1);
  });
}

export { normalizeViews };
