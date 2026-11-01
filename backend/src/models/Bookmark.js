import mongoose from "mongoose";
import { withTopicLabels } from "../config/topics.js";

/** A bookmark lives for 30 days from the moment it was saved. */
export const BOOKMARK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Most saved articles a reader can hold at once. Each save stores a copy of
 * the story (~3 KB), so without a cap one account could fill the database.
 */
export const MAX_BOOKMARKS_PER_USER = 50;

const bookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // May point at a deleted article: all News is wiped at 00:00 IST, while a
    // bookmark outlives that. `snapshot` is what keeps the bookmark readable.
    article: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "News",
      required: true,
      index: true,
    },
    // Copy of the article as it was when saved, refreshed again just before
    // the article is deleted (see the deleteMany hook in News.js).
    snapshot: {
      type: Object,
      required: true,
    },
    // TTL index: MongoDB removes the document once this time has passed.
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true, minimize: false },
);

bookmarkSchema.index({ user: 1, article: 1 }, { unique: true });
// The Saved page lists a reader's bookmarks newest first.
bookmarkSchema.index({ user: 1, createdAt: -1 });

/** Build the stored copy of a News document (lean or hydrated). */
bookmarkSchema.statics.snapshotFrom = function (article) {
  const data = typeof article.toObject === "function" ? article.toObject() : article;
  return withTopicLabels(data);
};

/**
 * Filter for bookmarks that are still valid. The TTL monitor only runs about
 * once a minute, so expired documents can briefly linger; this hides them.
 */
bookmarkSchema.statics.activeFilter = function (filter = {}) {
  return { ...filter, expiresAt: { $gt: new Date() } };
};

const Bookmark = mongoose.model("Bookmark", bookmarkSchema);

export default Bookmark;
