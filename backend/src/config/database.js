import mongoose from "mongoose";
import { config } from "./env.js";

/**
 * Connect to MongoDB
 * @returns {Promise<void>}
 */
export const connectDB = async () => {
  // Uses the configured value so a missing .env falls back to the local
  // default instead of crashing. The previous raw process.env read made
  // config.MONGO_URI dead and turned a missing .env into a hard boot failure.
  await mongoose.connect(config.MONGO_URI, {
    // Both of these were removed/defaulted in Mongoose 6+/driver 4 and only
    // produced deprecation noise.
    serverSelectionTimeoutMS: 10000,
  });

  console.log(
    `✅ MongoDB connected successfully at ${mongoose.connection.host}:${mongoose.connection.port}`,
  );

  return mongoose.connection;
};

/**
 * Disconnect from MongoDB
 * @returns {Promise<void>}
 */
export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log("MongoDB disconnected");
  } catch (error) {
    console.error("Error disconnecting from MongoDB:", error.message);
  }
};