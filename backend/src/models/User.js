import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { EMAIL_PATTERN, MAX_EMAIL_LENGTH } from "../utils/validation.js";
import { SOURCE_NAMES } from "../config/feeds.js";
import { TOPIC_IDS } from "../config/topics.js";


/**
 * User Schema
 * Represents a user in the system with authentication
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide a name"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: [true, "Email already exists"],
      lowercase: true,
      // TLDs of any length: Google accounts can use domains like .info or .design.
      maxlength: [MAX_EMAIL_LENGTH, "Email is too long"],
      match: [EMAIL_PATTERN, "Please provide a valid email address"],
    },
    // Google-only accounts have no password; they sign in with an ID token.
    password: {
      type: String,
      required: [
        function () {
          return !this.googleId;
        },
        "Please provide a password",
      ],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Don't include password in queries by default
    },
    // Google's stable account ID (the ID token's `sub` claim).
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // The "For You" feed: papers and topics (ids from config/topics.js) the
    // reader picked. onboardedAt marks the picker as finished or skipped.
    preferences: {
      sources: { type: [{ type: String, enum: SOURCE_NAMES }], default: [] },
      topics: { type: [{ type: String, enum: TOPIC_IDS }], default: [] },
      onboardedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  },
);

/** The reader's feed picks, as sent to the client. */
userSchema.methods.publicPreferences = function () {
  const preferences = this.preferences || {};
  return {
    sources: [...(preferences.sources || [])],
    topics: [...(preferences.topics || [])],
    onboardedAt: preferences.onboardedAt || null,
  };
};


/**
 * Pre-save hook: Hash password before saving to database
 * Only runs if password is modified
 */
userSchema.pre("save", async function (next) {
  // Only hash if password is new or modified
  if (!this.isModified("password")) {
    return next();
  }

  try {
    // Generate salt (12 rounds; the default 10 is below current guidance)
    const salt = await bcrypt.genSalt(12);
    // Hash password
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Instance method: Compare passwords
 * @param {string} enteredPassword - Plain text password to compare
 * @returns {Promise<boolean>} - true if passwords match, false otherwise
 */
userSchema.methods.matchPassword = async function (enteredPassword) {
  try {
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    throw new Error("Error comparing passwords");
  }
};

/**
 * Instance method: Get public user data (without password)
 * @returns {Object} - User data safe to send to client
 */
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

/**
 * Remove password from query results by default
 */
userSchema.query.withoutPassword = function () {
  return this.select("-password");
};

const User = mongoose.model("User", userSchema);

export default User;
