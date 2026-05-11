import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { getLogos, uploadLogo, uploadLogoDark, deleteLogo, deleteLogoDark } from "../controllers/settingsController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "../uploads/logo");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const prefix = req.path.includes("dark") ? "logo_dark" : "logo_light";
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `${prefix}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  }
});

export const settingsRoutes = Router();

// Public — login/register pages need the logo without auth
settingsRoutes.get("/logo", getLogos);

// Light logo
settingsRoutes.post("/logo/light",   requireAuth, requireRole("manager", "admin"), upload.single("logo"), uploadLogo);
settingsRoutes.delete("/logo/light", requireAuth, requireRole("manager", "admin"), deleteLogo);

// Dark logo
settingsRoutes.post("/logo/dark",    requireAuth, requireRole("manager", "admin"), upload.single("logo"), uploadLogoDark);
settingsRoutes.delete("/logo/dark",  requireAuth, requireRole("manager", "admin"), deleteLogoDark);
