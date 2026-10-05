import express from "express";
import {
  register,
  login,
  getCurrentUser,
  logout,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

/**
 * Auth Routes
 * /api/auth/*
 */

/**
 * POST /api/auth/register
 * Register a new user
 *
 * Request body:
 * {
 *   "name": "John Doe",
 *   "email": "john@example.com",
 *   "password": "password123",
 *   "confirmPassword": "password123"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "User registered successfully",
 *   "token": "eyJhbGc...",
 *   "user": {
 *     "id": "...",
 *     "name": "John Doe",
 *     "email": "john@example.com"
 *   }
 * }
 */
router.post("/register", authLimiter, register);

/**
 * POST /api/auth/login
 * Login user and get JWT token
 *
 * Request body:
 * {
 *   "email": "john@example.com",
 *   "password": "password123"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Login successful",
 *   "token": "eyJhbGc...",
 *   "user": {
 *     "id": "...",
 *     "name": "John Doe",
 *     "email": "john@example.com"
 *   }
 * }
 */
router.post("/login", authLimiter, login);

/**
 * GET /api/auth/me
 * Get current logged-in user (Protected route)
 *
 * Headers:
 * {
 *   "Authorization": "Bearer <token>"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "user": {
 *     "id": "...",
 *     "name": "John Doe",
 *     "email": "john@example.com",
 *     "isActive": true,
 *     "createdAt": "2026-03-17T..."
 *   }
 * }
 */
router.get("/me", protect, getCurrentUser);

/**
 * POST /api/auth/logout
 * Logout user (Protected route)
 *
 * There is no server-side token store, so this cannot invalidate an issued
 * JWT; the client discards its copy. A leaked token stays valid until it
 * expires. Adding a tokenVersion claim on the User document would allow real
 * server-side revocation.
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Logout successful. Please remove token from client."
 * }
 */
router.post("/logout", protect, logout);

export default router;
