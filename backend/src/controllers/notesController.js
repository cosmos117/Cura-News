import Note from "../models/Note.js";
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

  if (typeof content !== "string") {
    throw new AppError("Note content must be a string", 400);
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

  // Populate the author so the response shape matches GET /api/notes/article/:id
  // (the UI relies on userId._id / userId.name to tell own notes from others).
  await note.populate("userId", "name");
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
 * Query Parameters:
 * - limit: Results per page (default: 50, max: 100)
 * - skip: Pagination offset (default: 0)
 */
export const getNotesByArticle = asyncHandler(async (req, res, next) => {
  const { articleId } = req.params;
  const { limit = 50, skip = 0 } = req.query;

  const parsedLimit = Math.min(parseInt(limit) || 50, 100);
  const parsedSkip = Math.max(parseInt(skip) || 0, 0);

  const [notes, totalCount] = await Promise.all([
    Note.findByArticle(articleId, { limit: parsedLimit, skip: parsedSkip }),
    Note.countDocuments({ articleId }),
  ]);

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
 * Get a specific note
 * GET /api/notes/note/:id
 * Protected: Requires authentication (owner only)
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

  // Check ownership - notes are private to their author
  if (!note.isOwnedBy(userId)) {
    throw new AppError("You are not authorized to view this note", 403);
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
    if (typeof content !== "string") {
      throw new AppError("Note content must be a string", 400);
    }
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
    if (!Array.isArray(tags)) {
      throw new AppError("Tags must be an array of strings", 400);
    }
    if (tags.length > 5) {
      throw new AppError("Cannot have more than 5 tags", 400);
    }
    note.tags = tags;
  }

  // Update pin status if provided
  if (isPinned !== undefined) {
    if (typeof isPinned !== "boolean") {
      throw new AppError("isPinned must be a boolean", 400);
    }
    note.isPinned = isPinned;
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
    // No ObjectId cast needed: the aggregation pipeline casts the string
    // userId automatically. `mongoose.Types.ObjectId(...)` without `new`
    // throws "Class constructor cannot be invoked without 'new'", and with
    // `new` is unavailable on the bson version mongoose 7 resolves to.
    { $match: { userId } },
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
