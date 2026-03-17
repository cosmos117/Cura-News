import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createNote,
  getUserNotes,
  getNotesByArticle,
  getNoteById,
  updateNote,
  deleteNote,
  togglePinNote,
  getNoteStats,
} from "../controllers/notesController.js";

const router = express.Router();

/**
 * Notes Routes
 * /api/notes/*
 */

/**
 * POST /api/notes
 * Create a new note for an article
 * Protected: User must be authenticated
 *
 * Request Body:
 * {
 *   "articleId": "MongoDB ObjectId",
 *   "content": "string (10-2000 chars)",
 *   "tags": ["string"] (optional, max 5)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Note created successfully",
 *   "data": {
 *     "_id": "...",
 *     "userId": "...",
 *     "articleId": "...",
 *     "content": "...",
 *     "tags": [...],
 *     "isPinned": false,
 *     "createdAt": "...",
 *     "updatedAt": "..."
 *   }
 * }
 */
router.post("/", protect, createNote);

/**
 * GET /api/notes
 * Get all notes for current user
 * Protected: User must be authenticated
 *
 * Query Parameters:
 * - limit: Results per page (default: 20, max: 100)
 * - skip: Pagination offset (default: 0)
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Found X notes for current user",
 *   "pagination": {
 *     "total": number,
 *     "limit": number,
 *     "skip": number,
 *     "hasMore": boolean
 *   },
 *   "data": [notes...]
 * }
 */
router.get("/", protect, getUserNotes);

/**
 * GET /api/notes/article/:articleId
 * Get all notes for a specific article (public, no auth required)
 * Returns notes from all users about this article
 *
 * Parameters:
 * - articleId: MongoDB ObjectId of article
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Found X notes for article",
 *   "count": number,
 *   "data": [
 *     {
 *       "_id": "...",
 *       "userId": { "_id": "...", "name": "..." },
 *       "content": "...",
 *       "tags": [...],
 *       "isPinned": boolean,
 *       "createdAt": "..."
 *     }
 *   ]
 * }
 */
router.get("/article/:articleId", getNotesByArticle);

/**
 * GET /api/notes/note/:id
 * Get a specific note by ID
 * Protected: User must be authenticated
 *
 * Parameters:
 * - id: MongoDB ObjectId of note
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Note retrieved successfully",
 *   "data": { note object }
 * }
 */
router.get("/note/:id", protect, getNoteById);

/**
 * PUT /api/notes/:id
 * Update a note
 * Protected: Only note owner can update
 *
 * Request Body (all optional):
 * {
 *   "content": "string (10-2000 chars)",
 *   "tags": ["string"] (max 5),
 *   "isPinned": boolean
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Note updated successfully",
 *   "data": { updated note object }
 * }
 */
router.put("/:id", protect, updateNote);

/**
 * DELETE /api/notes/:id
 * Delete a note
 * Protected: Only note owner can delete
 *
 * Parameters:
 * - id: MongoDB ObjectId of note
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Note deleted successfully",
 *   "data": {}
 * }
 */
router.delete("/:id", protect, deleteNote);

/**
 * PATCH /api/notes/:id/pin
 * Toggle pin status of a note
 * Protected: Only note owner can toggle
 *
 * Parameters:
 * - id: MongoDB ObjectId of note
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Note pinned/unpinned successfully",
 *   "data": { updated note object }
 * }
 */
router.patch("/:id/pin", protect, togglePinNote);

/**
 * GET /api/notes/stats/overview
 * Get statistics about user's notes
 * Protected: User must be authenticated
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "totalNotes": number,
 *     "pinnedNotes": number,
 *     "unpinnedNotes": number,
 *     "byTag": {
 *       "tagName": count,
 *       ...
 *     }
 *   }
 * }
 */
router.get("/stats/overview", protect, getNoteStats);

export default router;
