import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

/**
 * Token issuer/audience claims.
 *
 * These are written on sign AND enforced on verify. Previously they were only
 * signed, so any token minted with the same secret by another service would
 * have been accepted by this API.
 */
const JWT_ISSUER = "cura-news-api";
const JWT_AUDIENCE = "cura-news-client";

/**
 * Generate JWT token
 * @param {string} userId - User ID to include in token
 * @param {number} [tokenVersion] - the account's current tokenVersion; the
 *   token stops working once the account's value moves past it
 * @returns {string} - JWT token
 */
export const generateToken = (userId, tokenVersion = 0) => {
  if (!userId) {
    throw new Error("User ID is required to generate token");
  }

  try {
    const token = jwt.sign(
      { userId, tv: tokenVersion || 0 }, // Payload
      config.JWT_SECRET, // Secret
      {
        expiresIn: config.JWT_EXPIRE, // Expiration time
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithm: "HS256",
      },
    );
    return token;
  } catch (error) {
    throw new Error(`Failed to generate token: ${error.message}`);
  }
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} - Decoded token payload
 * @throws {Error} - If token is invalid or expired
 */
export const verifyToken = (token) => {
  if (!token) {
    throw new Error("No token provided");
  }

  try {
    return jwt.verify(token, config.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"],
    });
  } catch (error) {
    // Preserve the error name so the global error handler can classify the
    // failure; the previous flattening to a bare Error erased it.
    if (error.name === "TokenExpiredError") {
      error.message = "Token has expired";
      throw error;
    }
    throw error;
  }
};

/**
 * Create auth response object
 * @param {Object} user - User object
 * @param {string} token - JWT token
 * @returns {Object} - Auth response
 */
export const createAuthResponse = (user, token) => {
  return {
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || null,
      preferences: user.publicPreferences(),
    },
  };
};