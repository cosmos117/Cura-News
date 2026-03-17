import dotenv from "dotenv";
import app from "./app.js";
import { connectDB } from "./config/database.js";
import { config } from "./config/env.js";

// Load environment variables
dotenv.config();

// Validate environment variables
console.log("🔧 Loading configuration...");
console.log(`📍 Environment: ${config.NODE_ENV}`);
console.log(`🌐 CORS Origin: ${config.CORS_ORIGIN}`);

// Connect to database
connectDB().catch((error) => {
  console.error("Failed to connect to database:", error.message);
  process.exit(1);
});

// Start server
const PORT = config.PORT;
const server = app.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`🚀 API available at http://localhost:${PORT}/api`);
  console.log(`📊 Health check at http://localhost:${PORT}/health\n`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n\n⏹️  Server shutting down gracefully...");
  server.close(async () => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", async () => {
  console.log("\n\n⏹️  Server shutting down (SIGTERM)...");
  server.close(async () => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error.message);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

export default server;
