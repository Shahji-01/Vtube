// ---------------------TWEET VALIDATION SCHEMAS--------------------------------
//
// Per-route validation schemas for the tweets route group, consumed by the
// centralized `validate(schema)` middleware. Each schema maps request parts
// (`params`/`body`) to field rules from `./validators.js`.
//
// Field facts (must match the controller exactly):
//   - createTweet reads `req.body.content`
//   - updateTweet reads `req.body.tweet` and `req.params.tweet_Id`
//   - deleteTweet reads `req.params.tweet_Id`
//   - getUserTweets reads `req.params.user_Id`
//
// Requirements: 1.6, 1.7, 2.1, 3.7

import { isObjectId, required, nonBlank, maxLen } from "./validators.js";

const TWEET_MAX_LEN = 5000;

/** POST / — create a tweet (controller reads `content`). */
export const createTweetSchema = {
  body: {
    content: [required, nonBlank, maxLen(TWEET_MAX_LEN)],
  },
};

/** PATCH /:tweet_Id — update a tweet (controller reads `tweet`). */
export const updateTweetSchema = {
  params: {
    tweet_Id: isObjectId,
  },
  body: {
    tweet: [required, nonBlank, maxLen(TWEET_MAX_LEN)],
  },
};

/** DELETE /:tweet_Id — delete a tweet. */
export const deleteTweetSchema = {
  params: {
    tweet_Id: isObjectId,
  },
};

/** GET /user/:user_Id — public read of a user's tweets. */
export const getUserTweetsSchema = {
  params: {
    user_Id: isObjectId,
  },
};
