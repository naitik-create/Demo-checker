import { Router } from "express";
import { listMeetings } from "../controllers/teamsController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

export const teamsRoutes = Router();

// List Teams meetings for the authenticated user (delegated token)
// GET /api/teams/meetings?pastDays=7&futureDays=14
teamsRoutes.get("/meetings", requireAuth, listMeetings);
