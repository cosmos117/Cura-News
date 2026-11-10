import express from "express";
import {
  register,
  login,
  googleLogin,
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
 * POST /api/auth/google
 * Sign in or sign up with a Google OAuth access token from the "Sign in with
 * Google" popup. Creates the account on first use; returns the same shape as
 * login.
 *
 * Request Body:
 * {
 *   "accessToken": "<Google access token>"
 * }
 */
router.post("/google", authLimiter, googleLogin);

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
 * Revokes every token issued to the account (see User.tokenVersion), so a
 * copied or leaked token dies with the session instead of living on until it
 * expires.
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Logout successful"
 * }
 */
router.post("/logout", protect, logout);

export default router;
