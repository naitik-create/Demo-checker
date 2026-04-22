import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { consultantPerformance, leaderboard } from "../controllers/performanceController.js";

export const performanceRoutes = Router();

performanceRoutes.get("/consultants/:consultantId", requireAuth, consultantPerformance);
performanceRoutes.get("/leaderboard", requireAuth, leaderboard);

