import { Op } from "sequelize";
import { Meeting, User, Transcript, AnalysisReport, DemoScore } from "../models/index.js";
import { runManualTranscriptAnalysis } from "../services/manualTranscriptAnalysisService.js";
import { analyzeAndScoreMeeting, fetchTranscriptForMeetingResult, analyzeIsDemoMeetingInBackground } from "../services/demoMonitoringWorkflow.js";
import { syncAllConsultantsCalendarsToDb, syncConsultantCalendarToDb } from "../services/calendarSyncService.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function canManageAllMeetings(req) {
  return ["manager", "admin"].includes(req.user?.role);
}

export async function syncMeetings(req, res, next) {
  try {
    // Consultants sync only their own calendar; managers/admins sync all
    if (req.user?.role === "consultant") {
      const result = await syncConsultantCalendarToDb(req.user.id);
      if (!result.ok) {
        const err = new Error(result.message || "Calendar sync failed");
        err.status = 400;
        return next(err);
      }
      return res.json({
        ok: true,
        message: `Synced ${result.upsertedMeetings} meeting(s) from ${result.fetched} calendar event(s).`,
        window: result.window,
        fetched: result.fetched,
        upsertedMeetings: result.upsertedMeetings
      });
    }

    const result = await syncAllConsultantsCalendarsToDb();
    if (result.message && !result.perConsultant?.length) {
      return res.json({ ok: true, message: result.message, window: result.window, fetched: 0, upsertedMeetings: 0, upsertedRecordings: 0 });
    }
    res.json({
      ok: true,
      message: `Synced ${result.upsertedMeetings} meeting(s) from ${result.fetched} calendar event(s).`,
      window: result.window,
      fetched: result.fetched,
      upsertedMeetings: result.upsertedMeetings,
      upsertedRecordings: 0,
      perConsultant: result.perConsultant
    });
  } catch (err) {
    next(err);
  }
}

export async function syncConsultantMeetings(req, res, next) {
  try {
    const { consultantId } = req.params;
    if (!consultantId) return res.status(400).json({ ok: false, error: "Invalid consultant id." });

    const result = await syncConsultantCalendarToDb(consultantId);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.message || "Calendar sync failed." });

    res.json({
      ok: true,
      message: `Imported ${result.upsertedMeetings} meeting(s) from ${result.fetched} calendar event(s).`,
      fetched: result.fetched,
      upsertedMeetings: result.upsertedMeetings,
      window: result.window,
      consultantId: result.consultantId
    });
  } catch (err) {
    next(err);
  }
}

export async function meetingReport(req, res, next) {
  try {
    const { meetingId } = req.params;
    if (!meetingId) throw badRequest("meetingId is required");

    const meeting = await Meeting.findOne({
      where: { id: meetingId },
      include: [{ model: User, as: "consultant", attributes: ["id", "name", "email", "role"] }]
    });

    if (!meeting) {
      const err = new Error("Meeting not found");
      err.status = 404;
      throw err;
    }

    const [transcript, analysisReport, demoScore] = await Promise.all([
      Transcript.findOne({ where: { meetingId: meeting.id } }),
      AnalysisReport.findOne({ where: { meetingId: meeting.id } }),
      DemoScore.findOne({ where: { meetingId: meeting.id } })
    ]);

    res.json({
      ok: true,
      meeting: {
        id: meeting.id,
        title: meeting.title,
        teamsMeetingId: meeting.teamsMeetingId,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        status: meeting.status,
        joinedFromSystem: Boolean(meeting.joinedFromSystem),
        joinedAt: meeting.joinedAt || null,
        transcriptStatus: meeting.transcriptStatus || "not_requested",
        analysisStatus: meeting.analysisStatus || "not_started",
        monitored: Boolean(meeting.monitored),
        joinUrl: meeting.raw?.joinUrl || null,
        participants: meeting.participants || [],
        createdAt: meeting.createdAt
      },
      consultant: meeting.consultant
        ? { id: meeting.consultant.id, name: meeting.consultant.name, email: meeting.consultant.email, role: meeting.consultant.role }
        : null,
      transcript: transcript
        ? { id: transcript.id, meetingId: transcript.meetingId, transcriptText: transcript.transcriptText, createdAt: transcript.createdAt }
        : null,
      summary: analysisReport?.summary || "",
      clientName: analysisReport?.clientName || "",
      productName: analysisReport?.productName || "",
      pros: analysisReport?.pros || [],
      cons: analysisReport?.cons || [],
      tips: analysisReport?.tips || [],
      sentiment: analysisReport?.sentiment || "neutral",
      questionsCount: analysisReport?.questionsCount || 0,
      questionsDetected: analysisReport?.questionsDetected || [],
      qaPairs: analysisReport?.qaPairs || [],
      demoQualityEvaluation: analysisReport?.demoQualityEvaluation || "",
      structuredDetails: analysisReport?.structuredDetails || {},
      riskFlags: analysisReport?.riskFlags || {},
      kpiGaps: analysisReport?.kpiGaps || {},
      scores: demoScore
        ? {
            discoveryScore: demoScore.discoveryScore,
            rapportScore: demoScore.rapportScore,
            demoScore: demoScore.demoScore,
            objectionsScore: demoScore.objectionsScore,
            engagementScore: demoScore.engagementScore,
            closeScore: demoScore.closeScore,
            riskDeduction: demoScore.riskDeduction,
            totalScore: demoScore.totalScore
          }
        : null
    });
  } catch (err) {
    next(err);
  }
}

export async function manualAnalyzeMeeting(req, res, next) {
  try {
    const { meetingId, transcriptText } = req.body || {};
    if (!meetingId) throw badRequest("meetingId is required");
    if (!transcriptText || !String(transcriptText).trim()) throw badRequest("transcriptText is required");

    const isManagerOrAdmin = ["manager", "admin"].includes(req.user?.role);
    const where = { id: meetingId };
    if (!isManagerOrAdmin) where.consultantId = req.user?.id;

    const meeting = await Meeting.findOne({ where, attributes: ["id", "title", "consultantId"] });
    if (!meeting) {
      const err = new Error("Meeting not found or access denied");
      err.status = 404;
      throw err;
    }

    const result = await runManualTranscriptAnalysis({ meetingId: meeting.id, transcriptText: String(transcriptText) });

    const clientName = result.analysis.clientName || "";
    const titleUpdate = { analysisStatus: "completed", transcriptStatus: "ready" };
    if (!meeting.title || meeting.title === "Teams meeting" || meeting.title === "Meeting") {
      const suffix = clientName ? ` - ${clientName}` : "";
      titleUpdate.title = `Demo${suffix}`.slice(0, 120);
    }
    await meeting.update(titleUpdate);

    res.status(201).json({
      ok: true,
      meetingId: meeting.id,
      analysis: result.analysis,
      scores: result.scores
    });
  } catch (err) {
    next(err);
  }
}

export async function reAnalyzeMeeting(req, res, next) {
  try {
    const { meetingId } = req.params;
    if (!meetingId) throw badRequest("meetingId is required");

    const meeting = await Meeting.findOne({ where: { id: meetingId } });
    if (!meeting) throw badRequest("Meeting not found");

    // Consultants can only re-analyze their own meetings; managers/admins can re-analyze any
    const isManagerOrAdmin = ["manager", "admin"].includes(req.user?.role);
    if (!isManagerOrAdmin && meeting.consultantId !== req.user?.id) {
      const err = new Error("Forbidden: you can only re-analyze your own meetings");
      err.status = 403;
      throw err;
    }

    const transcript = await Transcript.findOne({ where: { meetingId: meeting.id } });
    if (!transcript || !transcript.transcriptText) {
      throw badRequest("No transcript text found to re-analyze");
    }

    // Trigger re-analysis using existing transcript
    const result = await runManualTranscriptAnalysis({ 
      meetingId: meeting.id, 
      transcriptText: transcript.transcriptText 
    });

    await meeting.update({ analysisStatus: "completed" });

    res.json({
      ok: true,
      message: "Re-analysis completed successfully",
      analysis: result.analysis,
      scores: result.scores
    });
  } catch (err) {
    next(err);
  }
}

export async function upsertDemoFlag(req, res, next) {
  try {
    const { teamsMeetingId, isDemo, title, startTime, endTime, joinUrl } = req.body;
    if (!teamsMeetingId) throw badRequest("teamsMeetingId is required");
    const consultantId = req.user.id;
    let meeting = await Meeting.findOne({ where: { teamsMeetingId: String(teamsMeetingId), consultantId } });
    if (!meeting) {
      meeting = await Meeting.create({
        title: title || "Teams Meeting",
        teamsMeetingId: String(teamsMeetingId),
        consultantId,
        startTime: startTime ? new Date(startTime) : new Date(),
        endTime: endTime ? new Date(endTime) : new Date(Date.now() + 3600000),
        status: "scheduled",
        monitored: false,
        transcriptStatus: "not_requested",
        analysisStatus: "not_started",
        isDemo: Boolean(isDemo),
        raw: { joinUrl: joinUrl || null }
      });
    } else {
      await meeting.update({ isDemo: Boolean(isDemo) });
    }
    res.json({ ok: true, id: meeting.id, teamsMeetingId: meeting.teamsMeetingId, isDemo: meeting.isDemo });

    // When Is Demo is switched ON, immediately try to analyze in background
    if (Boolean(isDemo) && meeting.analysisStatus !== "completed") {
      analyzeIsDemoMeetingInBackground(meeting).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
}

export async function toggleIsDemo(req, res, next) {
  try {
    const { meetingId } = req.params;
    if (!meetingId) throw badRequest("meetingId is required");

    const where = { id: meetingId };
    if (!canManageAllMeetings(req)) where.consultantId = req.user?.id;

    const meeting = await Meeting.findOne({ where });
    if (!meeting) {
      const err = new Error("Meeting not found");
      err.status = 404;
      throw err;
    }

    await meeting.update({ isDemo: Boolean(req.body.isDemo) });
    res.json({ ok: true, id: meeting.id, isDemo: meeting.isDemo });

    if (Boolean(req.body.isDemo) && meeting.analysisStatus !== "completed") {
      analyzeIsDemoMeetingInBackground(meeting).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
}

export async function deleteMeeting(req, res, next) {
  try {
    if (!["manager", "admin"].includes(req.user?.role)) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }

    const { meetingId } = req.params;
    if (!meetingId) throw badRequest("meetingId is required");

    const meeting = await Meeting.findOne({ where: { id: meetingId }, attributes: ["id"] });
    if (!meeting) {
      const err = new Error("Meeting not found");
      err.status = 404;
      throw err;
    }

    await Promise.all([
      Transcript.destroy({ where: { meetingId: meeting.id } }),
      AnalysisReport.destroy({ where: { meetingId: meeting.id } }),
      DemoScore.destroy({ where: { meetingId: meeting.id } })
    ]);
    await meeting.destroy();

    res.json({ ok: true, deletedMeetingId: meeting.id });
  } catch (err) {
    next(err);
  }
}

export async function listMeetings(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 1000);
    const where = {};

    if (req.user?.role === "consultant") {
      where.consultantId = req.user.id;
    } else if (req.query.consultantId) {
      where.consultantId = req.query.consultantId;
    }

    if (req.query.from) {
      where.startTime = where.startTime || {};
      where.startTime[Op.gte] = new Date(req.query.from);
    }
    if (req.query.to) {
      const toDate = new Date(req.query.to);
      toDate.setHours(23, 59, 59, 999);
      where.startTime = where.startTime || {};
      where.startTime[Op.lte] = toDate;
    }

    const [total, meetings] = await Promise.all([
      Meeting.count({ where }),
      Meeting.findAll({
        where,
        order: [["startTime", "DESC"]],
        limit,
        include: [{ model: User, as: "consultant", attributes: ["id", "name", "email", "role"] }]
      })
    ]);

    const meetingIds = meetings.map((m) => m.id);
    const scores = await DemoScore.findAll({ where: { meetingId: { [Op.in]: meetingIds } } });
    const scoreByMeetingId = new Map(scores.map((s) => [s.meetingId, s]));

    res.json({
      ok: true,
      total,
      meetings: meetings.map((m) => {
        const score = scoreByMeetingId.get(m.id);
        return {
          id: m.id,
          title: m.title,
          teamsMeetingId: m.teamsMeetingId,
          startTime: m.startTime,
          endTime: m.endTime,
          status: m.status,
          monitored: m.monitored || false,
          joinedFromSystem: Boolean(m.joinedFromSystem),
          joinedAt: m.joinedAt || null,
          transcriptStatus: m.transcriptStatus || "not_requested",
          analysisStatus: m.analysisStatus || "not_started",
          isDemo: m.isDemo || false,
          joinUrl: m.raw?.joinUrl || null,
          consultant: m.consultant
            ? { id: m.consultant.id, name: m.consultant.name, email: m.consultant.email, role: m.consultant.role }
            : null,
          score: score
            ? {
                discoveryScore: score.discoveryScore,
                rapportScore: score.rapportScore,
                demoScore: score.demoScore,
                objectionsScore: score.objectionsScore,
                engagementScore: score.engagementScore,
                closeScore: score.closeScore,
                riskDeduction: score.riskDeduction,
                totalScore: score.totalScore
              }
            : null
        };
      })
    });
  } catch (err) {
    next(err);
  }
}

export async function monitorMeeting(req, res, next) {
  try {
    const { title, teamsMeetingId, consultantId, startTime, endTime, participants, joinUrl } = req.body;
    if (!teamsMeetingId || !consultantId || !startTime || !endTime) {
      throw badRequest("Missing required fields for monitoring");
    }

    const existing = await Meeting.findOne({ where: { teamsMeetingId: String(teamsMeetingId), consultantId } });

    const payload = {
      title: title || "Teams Meeting",
      teamsMeetingId: String(teamsMeetingId),
      consultantId,
      participants: participants || [],
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: "scheduled",
      monitored: true,
      transcriptStatus: "pending",
      analysisStatus: "not_started",
      raw: { ...(existing?.raw || {}), joinUrl: joinUrl || null }
    };

    let m;
    if (existing) {
      await existing.update(payload);
      m = existing;
    } else {
      m = await Meeting.create(payload);
    }

    res.json({ ok: true, meeting: m });
  } catch (err) {
    next(err);
  }
}

export async function unmonitorMeeting(req, res, next) {
  try {
    const { meetingId } = req.params;
    if (!meetingId) throw badRequest("meetingId is required");

    const m = await Meeting.findOne({ where: { id: meetingId } });
    if (!m) throw badRequest("Meeting not found");

    await m.update({ monitored: false, transcriptStatus: "not_requested", analysisStatus: "not_started" });
    res.json({ ok: true, meeting: m });
  } catch (err) {
    next(err);
  }
}

export async function joinMeetingFromSystem(req, res, next) {
  try {
    const { meetingId } = req.params;
    if (!meetingId) throw badRequest("meetingId is required");

    const where = { id: meetingId };
    if (!canManageAllMeetings(req)) where.consultantId = req.user.id;

    const meeting = await Meeting.findOne({ where });
    if (!meeting) {
      const err = new Error("Meeting not found");
      err.status = 404;
      throw err;
    }

    const joinUrl = meeting.raw?.joinUrl || meeting.raw?.graphEvent?.onlineMeeting?.joinUrl || meeting.raw?.graphEvent?.onlineMeeting?.joinWebUrl;
    if (!joinUrl) {
      const err = new Error("Join URL is missing for this Teams meeting. Please sync again from calendar.");
      err.status = 400;
      throw err;
    }

    await meeting.update({
      monitored: true,
      joinedFromSystem: true,
      joinedAt: new Date(),
      status: "in_progress",
      transcriptStatus: "pending",
      analysisStatus: "pending",
      raw: {
        ...(meeting.raw || {}),
        joinUrl,
        monitoring: { ...(meeting.raw?.monitoring || {}), startedBy: "system_join", transcriptMode: "teams_auto", joinInitiatedAt: new Date().toISOString() }
      }
    });

    res.json({
      ok: true,
      joinUrl,
      meeting: {
        id: meeting.id,
        status: meeting.status,
        monitored: meeting.monitored,
        joinedFromSystem: meeting.joinedFromSystem,
        joinedAt: meeting.joinedAt,
        transcriptStatus: meeting.transcriptStatus,
        analysisStatus: meeting.analysisStatus
      },
      message: "Meeting marked as joined from system. After the call ends, transcript fetch and analysis will run automatically."
    });
  } catch (err) {
    next(err);
  }
}

export async function fetchMeetingTranscript(req, res, next) {
  try {
    const { meetingId } = req.params;
    if (!meetingId) throw badRequest("meetingId is required");

    const meeting = await Meeting.findOne({ where: { id: meetingId } });
    if (!meeting) throw badRequest("Meeting not found");

    const existingTranscript = await Transcript.findOne({ where: { meetingId: meeting.id } });
    if (existingTranscript?.transcriptText) {
      await meeting.update({ transcriptStatus: "ready" });
      return res.json({ ok: true, transcriptText: existingTranscript.transcriptText, source: "existing" });
    }

    const transcriptResult = await fetchTranscriptForMeetingResult(meeting);
    if (!transcriptResult.ok) {
      await meeting.update({ transcriptStatus: "failed" });
      return res.json({ ok: false, message: transcriptResult.message });
    }

    const { text: transcriptText, source } = transcriptResult;
    await Transcript.upsert({ meetingId: meeting.id, transcriptText });
    await meeting.update({ transcriptStatus: "ready" });

    try {
      const now = new Date();
      if (meeting.endTime && new Date(meeting.endTime) <= now) {
        await analyzeAndScoreMeeting(meeting, { transcriptText, source });
        await meeting.update({ analysisStatus: "completed" });
      }
    } catch (e) {
      await meeting.update({ analysisStatus: "failed" });
      console.warn("[fetchMeetingTranscript] analyzeAndScore failed:", e?.message || e);
    }

    res.json({ ok: true, transcriptText, source });
  } catch (err) {
    next(err);
  }
}
