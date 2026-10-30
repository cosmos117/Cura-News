import User from "../models/User.js";
import Bookmark from "../models/Bookmark.js";
import { SOURCE_NAMES } from "../config/feeds.js";
import { TOPIC_IDS } from "../config/topics.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";

/**
 * Validate one list of picks: known values only, no duplicates, at least one.
 */
const readPicks = (value, allowed, noun) => {
  if (!Array.isArray(value)) {
    throw new AppError(`${noun}s must be a list`, 400);
  }
  const picks = [...new Set(value.map((item) => String(item).trim()))];
  const unknown = picks.filter((item) => !allowed.includes(item));
  if (unknown.length) {
    throw new AppError(`Unknown ${noun}: ${unknown.join(", ")}`, 400);
  }
  if (!picks.length) {
    throw new AppError(`Pick at least one ${noun}`, 400);
  }
  return picks;
};

const findUser = async (userId, select) => {
  const user = await User.findById(userId).select(select || "");
  if (!user) throw new AppError("User not found", 404);
  return user;
};

/**
 * GET /api/me/preferences
 */
export const getPreferences = asyncHandler(async (req, res) => {
  const user = await findUser(req.user.userId);
  res.status(200).json({ success: true, preferences: user.publicPreferences() });
});

/**
 * Save the reader's For You picks.
 * PUT /api/me/preferences
 *
 * Request Body:
 * {
 *   "sources": ["The Hindu", "Indian Express"],
 *   "topics": ["science-technology", "sports"]
 * }
 */
export const updatePreferences = asyncHandler(async (req, res) => {
  const sources = readPicks(req.body?.sources, SOURCE_NAMES, "source");
  const topics = readPicks(req.body?.topics, TOPIC_IDS, "topic");

  const user = await findUser(req.user.userId);
  user.preferences.sources = sources;
  user.preferences.topics = topics;
  user.preferences.onboardedAt ||= new Date();
  await user.save();

  res.status(200).json({
    success: true,
    message: "Preferences saved",
    preferences: user.publicPreferences(),
  });
});

/**
 * The reader closed the picker without choosing. Recorded so sign-up does
 * not offer it again; the For You button still can.
 * POST /api/me/onboarding/skip
 */
export const skipOnboarding = asyncHandler(async (req, res) => {
  const user = await findUser(req.user.userId);
  user.preferences.onboardedAt ||= new Date();
  await user.save();

  res.status(200).json({ success: true, preferences: user.publicPreferences() });
});

/**
 * Permanently delete the reader's account and everything tied to it (picks
 * live on the user; saved articles are removed here). There is no undo; the
 * client confirms in a dialog first, and `confirm` guards against a stray
 * request deleting an account by accident.
 * DELETE /api/me
 *
 * Request Body:
 * {
 *   "confirm": "DELETE"
 * }
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  if (req.body?.confirm !== "DELETE") {
    throw new AppError("Account deletion was not confirmed", 400);
  }

  const user = await findUser(req.user.userId);
  await Bookmark.deleteMany({ user: user._id });
  await user.deleteOne();

  res.status(200).json({
    success: true,
    message: "Your account has been permanently deleted.",
  });
});
