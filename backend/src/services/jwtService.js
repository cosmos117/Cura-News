import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

/**
 * Generate JWT token
 * @param {string} userId - User ID to include in token
 * @returns {string} - JWT token
 */
export const generateToken = (userId) => {
  if (!userId) {
    throw new Error("User ID is required to generate token");
  }

  try {
    const token = jwt.sign(
      { userId }, // Payload
      config.JWT_SECRET, // Secret
      {
        expiresIn: config.JWT_EXPIRE, // Expiration time
        issuer: "cura-news-api", // Token issuer
        audience: "cura-news-client", // Token audience
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
    const decoded = jwt.verify(token, config.JWT_SECRET);
    return decoded;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Token has expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    }
    throw error;
  }
};

/**
 * Decode token without verification (for testing/debugging)
 * @param {string} token - JWT token to decode
 * @returns {Object} - Decoded token payload
 */
export const decodeToken = (token) => {
  if (!token) {
    throw new Error("No token provided");
  }

  try {
    return jwt.decode(token);
  } catch (error) {
    throw new Error(`Failed to decode token: ${error.message}`);
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
    },
  };
};
