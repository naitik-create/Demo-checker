import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { runWorkflow } from "../controllers/workflowController.js";

export const workflowRoutes = Router();

// Trigger automated demo monitoring workflow
workflowRoutes.post("/demo-monitoring/run", requireAuth, requireRole("manager", "admin"), runWorkflow);

