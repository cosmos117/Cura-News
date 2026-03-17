import { AppError, asyncHandler } from "./errorHandler.js";
import { verifyToken } from "../services/jwtService.js";
import User from "../models/User.js";

/**
 * Protect middleware - Verify JWT token and authenticate user
 * Add this middleware to protected routes
 *
 * Extracts token from Authorization header: "Bearer <token>"
 * Verifies token and attaches user to request object
 *
 * Usage: app.get('/protected-route', protect, controllerFunction)
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Extract token from Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // Check if token exists
  if (!token) {
    throw new AppError(
      "Not authorized to access this route. Please provide a valid token.",
      401,
    );
  }

  try {
    // Verify token
    const decoded = verifyToken(token);

    // Get user from database
    const user = await User.findById(decoded.userId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (!user.isActive) {
      throw new AppError("Account has been deactivated", 403);
    }

    // Attach user to request object
    req.user = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    };

    next();
  } catch (error) {
    if (error.message === "Token has expired") {
      throw new AppError("Token has expired. Please login again.", 401);
    }
    if (error.message === "Invalid token") {
      throw new AppError("Invalid token. Please login again.", 401);
    }
    throw error;
  }
});

/**
 * Optional auth middleware - doesn't throw error if no token
 * Useful for routes that work with or without authentication
 *
 * Usage: app.get('/optional-auth-route', optionalAuth, controllerFunction)
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (token) {
    try {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId);

      if (user && user.isActive) {
        req.user = {
          userId: user._id.toString(),
          email: user.email,
          name: user.name,
        };
      }
    } catch (error) {
      // Silently ignore auth errors for optional auth
      console.warn("Optional auth error:", error.message);
    }
  }

  next();
});

/**
 * Check if user is authenticated
 * Utility function to use in controllers
 *
 * @param {Object} req - Express request object
 * @returns {boolean} - true if user is authenticated
 */
export const isAuthenticated = (req) => {
  return req.user && req.user.userId;
};
