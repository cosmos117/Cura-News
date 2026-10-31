import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import { config } from "../config/env.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { generateToken, createAuthResponse } from "../services/jwtService.js";
import { MAX_PASSWORD_LENGTH, isValidEmail } from "../utils/validation.js";

/** A non-empty string. Objects would reach Mongo queries as operators. */
const isText = (value) => typeof value === "string" && value.length > 0;

/**
 * Register a new user
 * POST /api/auth/register
 *
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.name - User's full name
 * @param {string} req.body.email - User's email (unique)
 * @param {string} req.body.password - User's password
 * @param {Object} res - Express response object
 * @returns {Object} - { success, token, user }
 */
export const register = asyncHandler(async (req, res, next) => {
  const { name, email, password, confirmPassword } = req.body;

  // Validation
  if (!isText(name) || !isText(email) || !isText(password)) {
    throw new AppError("Please provide name, email, and password", 400);
  }

  // Password confirmation
  if (!confirmPassword) {
    throw new AppError("Please provide a password confirmation", 400);
  }

  if (password !== confirmPassword) {
    throw new AppError("Passwords do not match", 400);
  }

  // Password strength check
  if (password.length < 8) {
    throw new AppError("Password must be at least 8 characters", 400);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError(`Password cannot exceed ${MAX_PASSWORD_LENGTH} characters`, 400);
  }

  if (!isValidEmail(email)) {
    throw new AppError("Please provide a valid email address", 400);
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new AppError("Email already registered. Please login instead.", 409);
  }

  // Create new user
  const user = new User({
    name: name.trim(),
    email: email.toLowerCase(),
    password,
  });

  // Save user (triggers pre-save hook to hash password)
  await user.save();

  // Generate JWT token
  const token = generateToken(user._id.toString());

  // Create auth response
  const authResponse = createAuthResponse(user, token);

  // Send response
  res.status(201).json({
    ...authResponse,
    message: "User registered successfully",
  });
});

/**
 * Login user
 * POST /api/auth/login
 *
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User's email
 * @param {string} req.body.password - User's password
 * @param {Object} res - Express response object
 * @returns {Object} - { success, token, user }
 */
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validation
  if (!isText(email) || !isText(password) || password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError("Please provide email and password", 400);
  }

  // Find user by email (include password field since it's set to select: false)
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  // Check if account is active
  if (!user.isActive) {
    throw new AppError("Account has been deactivated", 403);
  }

  // Google-only accounts have no password. Same message as a wrong password,
  // so the response does not reveal how an account was created.
  if (!user.password) {
    throw new AppError("Invalid email or password", 401);
  }

  // Compare passwords
  const isPasswordValid = await user.matchPassword(password);

  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  // Generate JWT token
  const token = generateToken(user._id.toString());

  // Create auth response
  const authResponse = createAuthResponse(user, token);

  // Send response
  res.status(200).json({
    ...authResponse,
    message: "Login successful",
  });
});

const googleClient = new OAuth2Client();
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** A display name that fits the User model's 2-50 character limits. */
const nameFromGoogle = (payload) => {
  const candidates = [payload.name, payload.given_name, payload.email?.split("@")[0]];
  const name = candidates.map((value) => value?.trim()).find((value) => value?.length >= 2);
  return (name || "Reader").slice(0, 50);
};

/**
 * Sign in (or sign up) with Google
 * POST /api/auth/google
 *
 * The frontend's own Google button opens Google's OAuth popup and receives an
 * access token. Before anything is trusted, Google's tokeninfo endpoint must
 * confirm the token is live and was issued to OUR client ID; otherwise a
 * token granted to any other app could be replayed here to sign in as its
 * user. The profile (ID, email, name, picture) then comes from userinfo.
 *
 * The user is matched by Google ID first, then by verified email, which links
 * Google to an existing password account.
 *
 * @param {Object} req.body
 * @param {string} req.body.accessToken - Google OAuth access token
 * @returns {Object} - { success, token, user }
 */
export const googleLogin = asyncHandler(async (req, res, next) => {
  if (!config.GOOGLE_CLIENT_ID) {
    throw new AppError("Google sign-in is not configured", 503);
  }

  const { accessToken } = req.body;
  if (!accessToken || typeof accessToken !== "string") {
    throw new AppError("Missing Google access token", 400);
  }

  let payload;
  try {
    const tokenInfo = await googleClient.getTokenInfo(accessToken);
    if (tokenInfo.aud !== config.GOOGLE_CLIENT_ID) {
      throw new Error("Token was issued to a different client");
    }
    const { data } = await axios.get(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    });
    payload = data;
  } catch {
    throw new AppError("Invalid Google credential", 401);
  }

  // Only a verified email may link to (and so take over) an existing account.
  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new AppError("Your Google account email is not verified", 401);
  }

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ googleId: payload.sub });
  let created = false;

  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      user.googleId = payload.sub;
      if (!user.avatar && payload.picture) user.avatar = payload.picture;
      await user.save();
    } else {
      user = await User.create({
        name: nameFromGoogle(payload),
        email,
        googleId: payload.sub,
        avatar: payload.picture || null,
      });
      created = true;
    }
  }

  if (!user.isActive) {
    throw new AppError("Account has been deactivated", 403);
  }


  const token = generateToken(user._id.toString());

  res.status(created ? 201 : 200).json({
    ...createAuthResponse(user, token),
    message: created ? "User registered successfully" : "Login successful",
  });
});

/**
 * Get current logged-in user
 * GET /api/auth/me
 * Protected route (requires authentication)
 *
 * @param {Object} req - Express request object (req.user added by auth middleware)
 * @param {Object} res - Express response object
 * @returns {Object} - { success, user }
 */
export const getCurrentUser = asyncHandler(async (req, res, next) => {
  // +password only to report whether one is set; it is never sent.
  const user = await User.findById(req.user.userId).select("+password");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || null,
      isActive: user.isActive,
      createdAt: user.createdAt,
      preferences: user.publicPreferences(),
      // How the account signs in, so Settings asks for the right confirmation.
      hasPassword: Boolean(user.password),
      hasGoogle: Boolean(user.googleId),
    },
  });
});

/**
 * Logout user (Frontend will remove token from localStorage)
 * POST /api/auth/logout
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - { success, message }
 */
export const logout = asyncHandler(async (req, res, next) => {
  res.status(200).json({
    success: true,
    message: "Logout successful. Please remove token from client.",
  });
});
