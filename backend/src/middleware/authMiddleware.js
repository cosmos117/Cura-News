import { AppError, asyncHandler } from "./errorHandler.js";
import { verifyToken } from "../services/jwtService.js";
import User from "../models/User.js";

/**
 * jsonwebtoken identifies its failure modes by error name. Kept in one place
 * so auth failures are classified by name rather than by message text.
 */
const JWT_ERROR_NAMES = new Set(["JsonWebTokenError", "NotBeforeError"]);

/**
 * Extract a bearer token from the Authorization header.
 * @param {Object} req - Express request object
 * @returns {string|null} - The raw token, or null when absent/malformed
 */
const extractToken = (req) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice(7).trim();
  return token || null;
};

/**
 * Resolve a token to an active user document.
 * @param {string} token - JWT token
 * @returns {Promise<Object>} - The user document
 */
const resolveUser = async (token) => {
  const decoded = verifyToken(token);

  if (!decoded?.userId) {
    throw new AppError("Invalid token payload", 401);
  }

  const user = await User.findById(decoded.userId);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.isActive) {
    throw new AppError("Account has been deactivated", 403);
  }

  return user;
};

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
  const token = extractToken(req);

  if (!token) {
    throw new AppError(
      "Not authorized to access this route. Please provide a valid token.",
      401,
    );
  }

  try {
    const user = await resolveUser(token);

    req.user = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    };

    next();
  } catch (error) {
    // Classify by error name rather than by message string; verifyToken
    // preserves `name`, and message matching broke silently whenever the
    // message text changed.
    if (error.name === "TokenExpiredError") {
    throw new AppError("Token has expired. Please login again.", 401);
  }
    if (JWT_ERROR_NAMES.has(error.name)) {
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
  const token = extractToken(req);

  if (token) {
    try {
      const user = await resolveUser(token);

      req.user = {
        userId: user._id.toString(),
        email: user.email,
        name: user.name,
      };
    } catch (error) {
      // Silently ignore auth errors for optional auth
      console.warn("Optional auth error:", error.message);
    }
  }

  next();
});