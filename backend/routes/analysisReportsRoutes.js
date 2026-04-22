import { Router } from "express";
import multer from "multer";
import { saveAnalysisReport, handleManualScript, handleVideoUpload } from "../controllers/analysisReportsController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

// Accept video/audio in memory (up to 500MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
                     "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type. Please upload a video or audio file."));
  }
});

export const analysisReportsRoutes = Router();

// Receives analysis results (e.g. from AI service) and stores in MongoDB
analysisReportsRoutes.post("/save", saveAnalysisReport);

// Manual Script Analysis for Managers
analysisReportsRoutes.post("/manual-script", requireAuth, requireRole("manager", "admin"), handleManualScript);

// Video/Audio Upload Analysis for Managers
analysisReportsRoutes.post(
  "/upload-video",
  requireAuth,
  requireRole("manager", "admin"),
  upload.single("video"),
  handleVideoUpload
);
