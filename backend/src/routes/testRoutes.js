import express from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";

const router = express.Router();

/**
 * GET /api/test
 * Test endpoint to check if API is working
 */
router.get(
  "/test",
  asyncHandler(async (req, res) => {
    res.status(200).json({
      success: true,
      message: "API is working perfectly! 🚀",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    });
  }),
);

/**
 * GET /api/test/error
 * Test endpoint to check error handling
 */
router.get(
  "/test/error",
  asyncHandler(async (req, res) => {
    throw new AppError("This is a test error", 400);
  }),
);

/**
 * GET /api/test/server-error
 * Test endpoint to check 500 error handling
 */
router.get(
  "/test/server-error",
  asyncHandler(async (req, res) => {
    throw new Error("Intentional server error for testing");
  }),
);

/**
 * POST /api/test/echo
 * Test endpoint to echo back request body
 */
router.post(
  "/test/echo",
  asyncHandler(async (req, res) => {
    res.status(200).json({
      success: true,
      message: "Request echoed back",
      receivedData: req.body,
      timestamp: new Date().toISOString(),
    });
  }),
);

export default router;
