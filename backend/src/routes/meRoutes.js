import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import {
  deleteAccount,
  getPreferences,
  skipOnboarding,
  updatePreferences,
} from "../controllers/meController.js";

const router = express.Router();

router.use(protect);
router.get("/preferences", getPreferences);
router.put("/preferences", updatePreferences);
router.post("/onboarding/skip", skipOnboarding);
router.delete("/", authLimiter, deleteAccount);

export default router;
