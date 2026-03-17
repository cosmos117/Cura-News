import User from "../models/User.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { generateToken, createAuthResponse } from "../services/jwtService.js";

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
  if (!name || !email || !password) {
    throw new AppError("Please provide name, email, and password", 400);
  }

  // Password confirmation
  if (password !== confirmPassword) {
    throw new AppError("Passwords do not match", 400);
  }

  // Password strength check
  if (password.length < 6) {
    throw new AppError("Password must be at least 6 characters", 400);
  }

  // Email format check (basic)
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  if (!emailRegex.test(email)) {
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
  if (!email || !password) {
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
  const user = await User.findById(req.user.userId);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt,
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
