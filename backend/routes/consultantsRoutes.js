import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { getConsultant, listConsultants, resetConsultantPassword, listPendingManagers, approveManager, rejectManager, deleteConsultant } from "../controllers/consultantsController.js";

export const consultantsRoutes = Router();

consultantsRoutes.get("/", requireAuth, requireRole("manager", "admin"), listConsultants);
// Static /managers/* routes must come before /:consultantId to avoid wildcard capture
consultantsRoutes.get("/managers/pending", requireAuth, requireRole("manager", "admin"), listPendingManagers);
consultantsRoutes.patch("/managers/:managerId/approve", requireAuth, requireRole("manager", "admin"), approveManager);
consultantsRoutes.patch("/managers/:managerId/reject", requireAuth, requireRole("manager", "admin"), rejectManager);
consultantsRoutes.get("/:consultantId", requireAuth, requireRole("manager", "admin"), getConsultant);
consultantsRoutes.patch("/:consultantId/reset-password", requireAuth, requireRole("manager", "admin"), resetConsultantPassword);
consultantsRoutes.delete("/:consultantId", requireAuth, requireRole("manager", "admin"), deleteConsultant);

