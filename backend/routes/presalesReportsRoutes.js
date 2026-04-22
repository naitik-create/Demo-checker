import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { getCompletePresalesReport } from "../controllers/presalesReportsController.js";

export const presalesReportsRoutes = Router();

// Presales complete report (group-wise consultant sections) + date filter
presalesReportsRoutes.get(
  "/complete",
  requireAuth,
  requireRole("manager", "admin"),
  getCompletePresalesReport
);

