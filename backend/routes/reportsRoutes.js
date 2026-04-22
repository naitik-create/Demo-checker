import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { listManualScriptReports } from "../controllers/reportsController.js";

export const reportsRoutes = Router();

// Manual script reports (created via /api/analysis-reports/manual-script)
reportsRoutes.get(
  "/manual-scripts",
  requireAuth,
  requireRole("manager", "admin", "consultant"),
  listManualScriptReports
);

