import Note from "../models/Note.js";
import mongoose from "mongoose";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";

/**
 * Create a new note for an article
 * POST /api/notes
 * Protected: Requires authentication
 */
export const createNote = asyncHandler(async (req, res, next) => {
  const { articleId, content, tags } = req.body;
  const userId = req.user.userId;

  // Validation
  if (!articleId) {
    throw new AppError("Please provide an article ID", 400);
  }

  if (!content) {
    throw new AppError("Please provide note content", 400);
  }

  if (content.length < 10) {
    throw new AppError("Note content must be at least 10 characters", 400);
  }

  if (content.length > 2000) {
    throw new AppError("Note content cannot exceed 2000 characters", 400);
  }

  // Create note
  const note = await Note.create({
    userId,
    articleId,
    content,
    tags: tags || [],
  });

  // Populate article information
  await note.populate("articleId", "headline date");

  res.status(201).json({
    success: true,
    message: "Note created successfully",
    data: note.getPublicNote(),
  });
});

/**
 * Get all notes for current user
 * GET /api/notes
 * Protected: Requires authentication
 * Query Parameters:
 * - limit: Results per page (default: 20, max: 100)
 * - skip: Pagination offset (default: 0)
 */
export const getUserNotes = asyncHandler(async (req, res, next) => {
  const { limit = 20, skip = 0 } = req.query;
  const userId = req.user.userId;

  // Validate pagination
  const parsedLimit = Math.min(parseInt(limit) || 20, 100);
  const parsedSkip = Math.max(parseInt(skip) || 0, 0);

  // Get total count
  const totalCount = await Note.countDocuments({ userId });

  // Fetch notes
  const notes = await Note.findByUser(userId, {
    limit: parsedLimit,
    skip: parsedSkip,
  });

  const publicNotes = notes.map((note) => note.getPublicNote());

  res.status(200).json({
    success: true,
    message: `Found ${notes.length} notes for current user`,
    pagination: {
      total: totalCount,
      limit: parsedLimit,
      skip: parsedSkip,
      hasMore: totalCount > parsedSkip + parsedLimit,
    },
    data: publicNotes,
  });
});

/**
 * Get all notes for a specific article
 * GET /api/notes/article/:articleId
 * Public: No authentication required
 */
export const getNotesByArticle = asyncHandler(async (req, res, next) => {
  const { articleId } = req.params;

  // Find notes
  const notes = await Note.find({ articleId })
    .populate("userId", "name")
    .sort({ isPinned: -1, createdAt: -1 });

  // Don't expose user emails for articles
  const publicNotes = notes.map((note) => ({
    _id: note._id,
    userId: {
      _id: note.userId._id,
      name: note.userId.name,
    },
    content: note.content,
    tags: note.tags,
    isPinned: note.isPinned,
    createdAt: note.createdAt,
  }));

  res.status(200).json({
    success: true,
    message: `Found ${notes.length} notes for article`,
    count: notes.length,
    data: publicNotes,
  });
});

/**
 * Get a specific note
 * GET /api/notes/note/:id
 * Protected: Requires authentication (can only see own notes or article notes)
 */
export const getNoteById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.userId;

  // Find note
  const note = await Note.findById(id).populate(
    "articleId",
    "headline summary date",
  );

  if (!note) {
    throw new AppError("Note not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Note retrieved successfully",
    data: note.getPublicNote(),
  });
});

/**
 * Update a note
 * PUT /api/notes/:id
 * Protected: Requires authentication (only owner can update)
 */
export const updateNote = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { content, tags, isPinned } = req.body;
  const userId = req.user.userId;

  // Find note
  let note = await Note.findById(id);

  if (!note) {
    throw new AppError("Note not found", 404);
  }

  // Check ownership
  if (!note.isOwnedBy(userId)) {
    throw new AppError("You are not authorized to update this note", 403);
  }

  // Validate content if provided
  if (content !== undefined) {
    if (content.length < 10) {
      throw new AppError("Note content must be at least 10 characters", 400);
    }
    if (content.length > 2000) {
      throw new AppError("Note content cannot exceed 2000 characters", 400);
    }
    note.content = content;
  }

  // Update tags if provided
  if (tags !== undefined) {
    if (Array.isArray(tags) && tags.length > 5) {
      throw new AppError("Cannot have more than 5 tags", 400);
    }
    note.tags = tags;
  }

  // Update pin status if provided
  if (isPinned !== undefined) {
    note.isPinned = Boolean(isPinned);
  }

  // Save
  await note.save();

  res.status(200).json({
    success: true,
    message: "Note updated successfully",
    data: note.getPublicNote(),
  });
});

/**
 * Delete a note
 * DELETE /api/notes/:id
 * Protected: Requires authentication (only owner can delete)
 */
export const deleteNote = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.userId;

  // Find note
  const note = await Note.findById(id);

  if (!note) {
    throw new AppError("Note not found", 404);
  }

  // Check ownership
  if (!note.isOwnedBy(userId)) {
    throw new AppError("You are not authorized to delete this note", 403);
  }

  // Delete
  await Note.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Note deleted successfully",
    data: {},
  });
});

/**
 * Pin/Unpin a note
 * PATCH /api/notes/:id/pin
 * Protected: Requires authentication (only owner)
 */
export const togglePinNote = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.userId;

  // Find note
  let note = await Note.findById(id);

  if (!note) {
    throw new AppError("Note not found", 404);
  }

  // Check ownership
  if (!note.isOwnedBy(userId)) {
    throw new AppError("You are not authorized to pin this note", 403);
  }

  // Toggle pin status
  note.isPinned = !note.isPinned;
  await note.save();

  res.status(200).json({
    success: true,
    message: `Note ${note.isPinned ? "pinned" : "unpinned"} successfully`,
    data: note.getPublicNote(),
  });
});

/**
 * Get statistics about user's notes
 * GET /api/notes/stats/overview
 * Protected: Requires authentication
 */
export const getNoteStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.userId;

  const totalNotes = await Note.countDocuments({ userId });
  const pinnedNotes = await Note.countDocuments({ userId, isPinned: true });

  const tagStats = await Note.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $unwind: "$tags" },
    {
      $group: {
        _id: "$tags",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalNotes,
      pinnedNotes,
      unpinnedNotes: totalNotes - pinnedNotes,
      byTag: tagStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
    },
  });
});
