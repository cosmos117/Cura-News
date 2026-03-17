import mongoose from "mongoose";

/**
 * Notes Schema
 * Represents user notes about a news article
 * Users can save their study notes, highlights, or personal thoughts about articles
 */
const notesSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Please provide a user ID"],
      index: true, // Index for fast user-specific queries
    },
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "News",
      required: [true, "Please provide an article ID"],
      index: true, // Index for fast article queries
    },
    content: {
      type: String,
      required: [true, "Please provide note content"],
      trim: true,
      minlength: [10, "Note content must be at least 10 characters"],
      maxlength: [2000, "Note content cannot exceed 2000 characters"],
    },
    tags: {
      type: [String],
      validate: {
        validator: function (tags) {
          return !tags || tags.length <= 5;
        },
        message: "Cannot have more than 5 tags",
      },
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  },
);

/**
 * Compound index for efficient queries
 * Allows fast retrieval of all notes for a specific user
 */
notesSchema.index({ userId: 1, createdAt: -1 });

/**
 * Compound index for finding all notes on a specific article
 */
notesSchema.index({ articleId: 1, createdAt: -1 });

/**
 * Instance method: Check if user owns this note
 * @param {string} userId - User ID to check ownership
 * @returns {boolean} - true if user owns note, false otherwise
 */
notesSchema.methods.isOwnedBy = function (userId) {
  return this.userId.toString() === userId.toString();
};

/**
 * Instance method: Get public note data (safe to send to client)
 * @returns {Object} - Note data for API response
 */
notesSchema.methods.getPublicNote = function () {
  return {
    _id: this._id,
    userId: this.userId,
    articleId: this.articleId,
    content: this.content,
    tags: this.tags,
    isPinned: this.isPinned,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

/**
 * Static method: Find all notes for a user
 * @param {string} userId - User ID
 * @param {Object} options - Query options (limit, skip, sort)
 * @returns {Promise<Array>} - Array of notes
 */
notesSchema.statics.findByUser = function (userId, options = {}) {
  const { limit = 20, skip = 0 } = options;
  return this.find({ userId })
    .populate("articleId", "headline date")
    .sort({ isPinned: -1, createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .exec();
};

/**
 * Static method: Find all notes for an article
 * @param {string} articleId - Article ID
 * @returns {Promise<Array>} - Array of notes
 */
notesSchema.statics.findByArticle = function (articleId) {
  return this.find({ articleId })
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .exec();
};

const Note = mongoose.model("Note", notesSchema);

export default Note;
