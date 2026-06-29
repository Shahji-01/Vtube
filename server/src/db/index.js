import mongoose from "mongoose";

import { DB_NAME } from "../contants.js";
import logger from "../config/logger.js";
import { Video } from "../models/video.model.js";
import { Comment } from "../models/comment.model.js";
import { Like } from "../models/like.model.js";
import { Subscription } from "../models/subscription.model.js";
import { User } from "../models/user.model.js";

// Models whose declared indexes must be materialized before the connection is
// reported ready (Req 10.6). Calling Model.init() resolves once the model's
// indexes have finished building against the database.
const INDEXED_MODELS = [
  { name: "Video", model: Video },
  { name: "Comment", model: Comment },
  { name: "Like", model: Like },
  { name: "Subscription", model: Subscription },
  { name: "User", model: User },
];

/**
 * Ensure every declared Index_Definition is registered with the database
 * before the connection is reported ready (Req 10.6). If any model's index
 * build rejects, emit an `error`-level structured log identifying the failing
 * model (Req 10.8) and rethrow so the caller does not treat the connection as
 * ready.
 */
const ensureIndexes = async () => {
  await Promise.all(
    INDEXED_MODELS.map(({ name, model }) =>
      model.init().catch((error) => {
        logger.error(
          { model: name, err: error },
          `Index registration failed for model ${name}; connection not ready`
        );
        // Rethrow so Promise.all rejects and the connection is not reported ready.
        throw error;
      })
    )
  );
};

const connectDB = async () => {
  try {
    // console.log(process.env.MONGODB_URL)
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URL}/${DB_NAME}`
    );

    // Build every declared index before reporting the connection as ready.
    // If this rejects, the catch below logs and exits so the server never
    // begins accepting requests on a broken index set (Req 10.6, 10.8).
    await ensureIndexes();

    logger.info(
      { host: connectionInstance.connection.host },
      "DATABASE CONNECTION ESTABLISHED and indexes registered"
    );
  } catch (error) {
    logger.error(
      { err: error, db: DB_NAME },
      `MONGODB CONNECTION FAILED with database: ${DB_NAME} (from db/index.js)`
    );
    process.exit(1);
  }
};

export default connectDB;
