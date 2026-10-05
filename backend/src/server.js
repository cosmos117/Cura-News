// Load .env FIRST. This import must stay above every other import: ES module
// imports are hoisted, so any module that reads process.env at evaluation
// time (config/env.js) would otherwise capture defaults before dotenv ran.
import "./config/dotenv.js";

import app from "./app.js";
import { connectDB, disconnectDB } from "./config/database.js";
import { config } from "./config/env.js";

// Validate environment variables
console.log("🔧 Loading configuration...");
console.log(`📍 Environment: ${config.NODE_ENV}`);
console.log(`🌐 CORS Origin: ${config.CORS_ORIGIN}`);

if (!config.GEMINI_API_KEY && !config.GROQ_API_KEY) {
  console.warn(
    "⚠️  GEMINI_API_KEY and GROQ_API_KEY are not set - detailed summaries will fail.",
  );
}

let server;

/**
 * Boot sequence: connect to Mongo BEFORE accepting requests, so the server
 * never serves traffic against an unreachable database.
 */
const start = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error("❌ Failed to connect to database:", error.message);
    process.exit(1);
  }

  server = app.listen(config.PORT, () => {
    console.log(`\n✅ Server running on port ${config.PORT}`);
    console.log(`🚀 API available at http://localhost:${config.PORT}/api`);
    console.log(`📊 Health check at http://localhost:${config.PORT}/health\n`);
  });
};

start();

/**
 * Graceful shutdown: stop accepting connections, close the DB, then exit.
 */
const shutdown = (signal) => {
  console.log(`\n\n⏹️  Server shutting down (${signal})...`);

  const forceExit = setTimeout(() => {
    console.error("⚠️  Forced exit after 10s shutdown timeout");
    process.exit(1);
  }, 10000);

  forceExit.unref();

  const done = async () => {
    clearTimeout(forceExit);
    await disconnectDB();
    console.log("✅ Shutdown complete");
    process.exit(0);
  };

  if (server) {
    server.close(done);
  } else {
    done();
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  shutdown("uncaughtException");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  shutdown("unhandledRejection");
});

export default server;