import { Router } from "express";
import {
  meetingReport,
  syncMeetings,
  syncConsultantMeetings,
  listMeetings,
  manualAnalyzeMeeting,
  deleteMeeting,
  monitorMeeting,
  unmonitorMeeting,
  fetchMeetingTranscript,
  joinMeetingFromSystem
} from "../controllers/meetingsController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

export const meetingsRoutes = Router();

// Sync scheduled Teams meetings from Microsoft Graph into MongoDB
meetingsRoutes.get("/sync", requireAuth, syncMeetings);
// Manager/admin: sync one consultant’s calendar into MongoDB (on-demand)
meetingsRoutes.post("/sync/consultant/:consultantId", requireAuth, requireRole("manager", "admin"), syncConsultantMeetings);

// List meetings for dashboards (consultant sees own, manager/admin sees all)
meetingsRoutes.get("/", requireAuth, listMeetings);

// Consolidated meeting report (meeting + consultant + transcript + analysis + scores)
meetingsRoutes.get("/report/:meetingId", requireAuth, meetingReport);

// Monitor a specific calendar meeting so it gets auto-analyzed when it ends
meetingsRoutes.post("/monitor", requireAuth, monitorMeeting);

// Unmonitor a meeting
meetingsRoutes.delete("/monitor/:meetingId", requireAuth, unmonitorMeeting);

// Consultant joins Teams meeting from system UI (enables auto monitoring state)
meetingsRoutes.post("/:meetingId/join", requireAuth, joinMeetingFromSystem);

// Paste transcript/script and generate analysis + score
meetingsRoutes.post("/manual-analysis", requireAuth, manualAnalyzeMeeting);

// Fetch transcript manually for a specific meeting
meetingsRoutes.post("/:meetingId/fetch-transcript", requireAuth, fetchMeetingTranscript);

// Delete a meeting/demo and its related documents
meetingsRoutes.delete("/:meetingId", requireAuth, deleteMeeting);
