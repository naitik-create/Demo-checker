import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { getConsultant, listConsultants } from "../controllers/consultantsController.js";

export const consultantsRoutes = Router();

consultantsRoutes.get("/", requireAuth, requireRole("manager", "admin"), listConsultants);
consultantsRoutes.get("/:consultantId", requireAuth, requireRole("manager", "admin"), getConsultant);

