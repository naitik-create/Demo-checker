import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/authMiddleware.js";
import {
  getConsultantTeamsConnectUrl,
  getTeamsConnectUrl,
  oauthCallback,
  getMyTeamsData,
  getConsultantTeamsData
} from "../controllers/teamsConnectController.js";
import { ENABLE_TEAMS } from "../config/features.js";

export const teamsConnectRoutes = Router();

// OAuth callback — Microsoft redirects here after user signs in (no auth needed)
teamsConnectRoutes.get("/oauth/callback", oauthCallback);

// Get OAuth URL for self-connect (consultant or manager connecting their own account)
teamsConnectRoutes.get("/connect-url", requireAuth, (req, res, next) => {
  if (!ENABLE_TEAMS) return res.status(501).json({ ok: false, error: "Teams integration is disabled" });
  return getTeamsConnectUrl(req, res, next);
});

// Get OAuth URL for manager to connect a consultant's Teams account
teamsConnectRoutes.get("/consultants/:consultantId/connect-url", requireAuth, requireRole("manager", "admin"), (req, res, next) => {
  if (!ENABLE_TEAMS) return res.status(501).json({ ok: false, error: "Teams integration is disabled" });
  return getConsultantTeamsConnectUrl(req, res, next);
});

// GET own Teams data (profile + calendar + online meetings) — for any authenticated user
teamsConnectRoutes.get("/me", requireAuth, getMyTeamsData);

// GET consultant's Teams data — manager/admin only
teamsConnectRoutes.get("/consultants/:consultantId/data", requireAuth, requireRole("manager", "admin"), getConsultantTeamsData);
