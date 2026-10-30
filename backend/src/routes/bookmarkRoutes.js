import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getBookmark,
  getBookmarkStatus,
  getBookmarks,
  removeBookmark,
  saveBookmark,
} from "../controllers/bookmarkController.js";

const router = express.Router();

router.use(protect);
router.get("/", getBookmarks);
router.get("/:articleId/status", getBookmarkStatus);
router.get("/:articleId", getBookmark);
router.post("/:articleId", saveBookmark);
router.delete("/:articleId", removeBookmark);

export default router;
