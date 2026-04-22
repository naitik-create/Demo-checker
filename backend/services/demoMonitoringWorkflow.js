import { Op } from "sequelize";
import { calculateDemoScores } from "./demoScoringEngine.js";
import { listMyScheduledTeamsMeetings, refreshAccessToken } from "./msGraphDelegatedService.js";
import {
  resolveOnlineMeetingByJoinUrls,
  getMeetingTranscripts,
  getTranscriptContent,
  getMeetingChatMessages,
  parseVttToPlainText
} from "./userGraphService.js";

import { Meeting, Transcript, AnalysisReport, DemoScore, User } from "../models/index.js";

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function toIso(d) { return new Date(d).toISOString(); }

function mapParticipantsFromEvent(evt) {
  const attendees = Array.isArray(evt?.attendees) ? evt.attendees : [];
  return attendees
    .map((a) => {
      const email = a?.emailAddress?.address || a?.email;
      const name = a?.emailAddress?.name || a?.name;
      if (!email && !name) return null;
      return { name, email };
    })
    .filter(Boolean);
}

function isDemoLikeSubject(subject) {
  return String(subject || "").toLowerCase().includes("demo");
}

async function syncMeetingsForAllConsultants() {
  const pastDays = Number(process.env.GRAPH_SYNC_DAYS_PAST || 30);
  const futureDays = Number(process.env.GRAPH_SYNC_DAYS_FUTURE || 30);
  const now = Date.now();
  const startDateTime = toIso(now - pastDays * 24 * 60 * 60 * 1000);
  const endDateTime = toIso(now + futureDays * 24 * 60 * 60 * 1000);

  const consultants = await User.findAll({
    where: { msRefreshToken: { [Op.ne]: null, [Op.ne]: "" } },
    attributes: ["id", "msRefreshToken", "msAccessToken", "msAccessTokenExpiresAt", "msUpn"]
  });

  let fetched = 0, upsertedMeetings = 0;

  for (const consultant of consultants) {
    const expiresAt = consultant.msAccessTokenExpiresAt ? new Date(consultant.msAccessTokenExpiresAt).getTime() : 0;
    if (!consultant.msAccessToken || Date.now() > expiresAt - 60_000) {
      try {
        const t = await refreshAccessToken(consultant.msRefreshToken);
        await consultant.update({
          msAccessToken: t.accessToken,
          msRefreshToken: t.refreshToken,
          msAccessTokenExpiresAt: new Date(Date.now() + t.expiresIn * 1000)
        });
      } catch { continue; }
    }
    if (!consultant.msAccessToken) continue;

    let events = [];
    try { events = await listMyScheduledTeamsMeetings(consultant.msAccessToken, { startDateTime, endDateTime }); } catch { continue; }
    fetched += events.length;

    for (const evt of events) {
      const joinUrl = evt?.onlineMeeting?.joinUrl || evt?.onlineMeeting?.joinWebUrl;
      const teamsMeetingId = evt?.onlineMeeting?.conferenceId || joinUrl || evt?.id;
      if (!teamsMeetingId) continue;

      const startTime = evt?.start?.dateTime ? new Date(evt.start.dateTime) : null;
      const endTime = evt?.end?.dateTime ? new Date(evt.end.dateTime) : null;
      if (!startTime || !endTime) continue;

      const autoMonitor = isDemoLikeSubject(evt?.subject || "Teams Meeting");
      const setPayload = {
        title: evt?.subject || "Teams Meeting",
        teamsMeetingId: String(teamsMeetingId),
        consultantId: consultant.id,
        participants: mapParticipantsFromEvent(evt),
        startTime,
        endTime,
        status: "scheduled",
        raw: { graphEvent: evt, joinUrl: joinUrl || null, organizerEmail: evt?.organizer?.emailAddress?.address || "" }
      };
      if (autoMonitor) setPayload.monitored = true;

      const existing = await Meeting.findOne({ where: { teamsMeetingId: String(teamsMeetingId), consultantId: consultant.id } });
      if (existing) {
        await existing.update(setPayload);
      } else {
        await Meeting.create(setPayload);
      }
      upsertedMeetings++;
    }
  }

  return { startDateTime, endDateTime, fetched, upsertedMeetings };
}

const TRANSCRIPT_MIN_CHARS = 15;

function collectJoinUrlCandidates(meeting) {
  const raw = meeting.raw || {};
  const ge = raw.graphEvent || {};
  const om = ge.onlineMeeting || {};
  const urls = [
    raw.joinUrl, om.joinUrl, om.joinWebUrl,
    typeof meeting.teamsMeetingId === "string" && meeting.teamsMeetingId.startsWith("http") ? meeting.teamsMeetingId : null
  ].filter(Boolean);
  return [...new Set(urls.map((u) => String(u).trim()))];
}

export async function fetchTranscriptForMeetingResult(meeting) {
  const fail = (message) => ({ ok: false, message });

  const consultant = await User.findOne({
    where: { id: meeting.consultantId },
    attributes: ["id", "msRefreshToken", "msAccessToken", "msAccessTokenExpiresAt"]
  });
  if (!consultant?.msRefreshToken) return fail("Consultant has not connected Microsoft Teams (no refresh token).");

  const expiresAt = consultant.msAccessTokenExpiresAt ? new Date(consultant.msAccessTokenExpiresAt).getTime() : 0;
  if (!consultant.msAccessToken || Date.now() > expiresAt - 60_000) {
    try {
      const t = await refreshAccessToken(consultant.msRefreshToken);
      await consultant.update({
        msAccessToken: t.accessToken,
        msRefreshToken: t.refreshToken,
        msAccessTokenExpiresAt: new Date(Date.now() + t.expiresIn * 1000)
      });
    } catch (e) {
      return fail(`Could not refresh Microsoft token: ${e.message || "reconnect Teams"}.`);
    }
  }

  const userId = consultant.id;
  const joinCandidates = collectJoinUrlCandidates(meeting);

  let onlineMeetingId = meeting.raw?.onlineMeetingId || null;
  let chatThreadId = meeting.raw?.chatThreadId || meeting.raw?.graphEvent?.onlineMeeting?.chatInfo?.threadId || null;

  if (!onlineMeetingId && joinCandidates.length) {
    const { onlineMeeting: om, matchedJoinUrl } = await resolveOnlineMeetingByJoinUrls(userId, joinCandidates);
    if (om?.id) {
      onlineMeetingId = om.id;
      chatThreadId = chatThreadId || om.chatInfo?.threadId || null;
      const newRaw = { ...(meeting.raw || {}), onlineMeetingId: om.id, chatThreadId, ...(matchedJoinUrl ? { joinUrl: matchedJoinUrl } : {}) };
      await meeting.update({ raw: newRaw });
      meeting.raw = newRaw;
    }
  }

  let lastTranscriptHint = "";

  if (onlineMeetingId) {
    try {
      const transcripts = await getMeetingTranscripts(userId, onlineMeetingId);
      if (transcripts.length > 0) {
        const latest = transcripts.sort((a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime))[0];
        const contentUrl =
          latest.transcriptContentUrl ||
          latest["@microsoft.graph.transcriptContentUrl"] ||
          `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/transcripts/${latest.id}/content`;

        if (contentUrl) {
          const vttContent = await getTranscriptContent(userId, contentUrl);
          if (vttContent) {
            let plain = parseVttToPlainText(vttContent);
            if (plain.length < TRANSCRIPT_MIN_CHARS) plain = vttContent.replace(/WEBVTT[\s\S]*?\n\n/, "").trim();
            if (plain.length >= TRANSCRIPT_MIN_CHARS) return { ok: true, text: plain, source: "teams_transcript" };
            lastTranscriptHint = "Teams returned transcript data but it was too short.";
          } else {
            lastTranscriptHint = "Could not download transcript content from Microsoft Graph.";
          }
        }
      } else {
        lastTranscriptHint = "No transcript is published for this meeting in Graph yet.";
      }
    } catch (err) {
      console.warn("[workflow] transcript list/content failed:", err.message);
      lastTranscriptHint = err.response?.data?.error?.message || err.message || "Transcript API failed.";
    }
  }

  if (!joinCandidates.length) return fail("No Teams join link is stored for this meeting. Re-sync calendar or monitor it again.");
  if (!onlineMeetingId) return fail("Could not resolve the Teams online meeting from the join link.");

  try {
    const thread = chatThreadId || meeting.raw?.chatThreadId;
    if (thread) {
      const messages = await getMeetingChatMessages(userId, thread);
      if (messages.length > 0) {
        const chatText = messages.map((m) => `${m.from}: ${m.text}`).join("\n");
        if (chatText.length >= TRANSCRIPT_MIN_CHARS) return { ok: true, text: chatText, source: "chat_messages" };
      }
    }
  } catch (err) {
    console.warn("[workflow] chat fallback failed:", err.message);
  }

  const tail = "Ensure the meeting has ended, transcription was enabled in Teams, and the app has transcript permissions.";
  return fail(lastTranscriptHint ? `${lastTranscriptHint} ${tail}` : `No transcript or usable meeting chat was found. ${tail}`);
}

export async function fetchTranscriptForMeeting(meeting) {
  const r = await fetchTranscriptForMeetingResult(meeting);
  if (r.ok) return { text: r.text, source: r.source };
  return null;
}

async function analyzeWithAiService(transcriptText) {
  const baseUrl = process.env.AI_SERVICE_URL || "http://localhost:7000";
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: transcriptText })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || "AI service analysis failed");
    err.status = 502;
    throw err;
  }
  return json?.analysis || {};
}

function scoreFromAnalysis(analysis) {
  const sentiment = analysis?.sentiment || "neutral";
  const questionsCount = Number(analysis?.questionsCount || 0);
  const prosCount = Array.isArray(analysis?.pros) ? analysis.pros.length : 0;
  const consCount = Array.isArray(analysis?.cons) ? analysis.cons.length : 0;
  const tipsCount = Array.isArray(analysis?.tips) ? analysis.tips.length : 0;
  const summary = `${analysis?.summary || ""} ${analysis?.demoQualityEvaluation || ""}`;
  const hasNextSteps = /next\s+step|follow[-\s]?up|proposal|pilot|poc|trial|timeline/i.test(summary);
  const hasPricing = /pricing|price|cost|budget|roi/i.test(summary);
  const hasObjections = /concern|risk|security|compliance|competitor|unclear/i.test(summary);

  return calculateDemoScores({
    communicationScore: clamp(10 + (sentiment === "positive" ? 5 : sentiment === "negative" ? -2 : 2) + clamp(prosCount, 0, 6) * 0.8 - clamp(consCount, 0, 6) * 0.4, 0, 20),
    engagementScore: clamp(8 + clamp(questionsCount, 0, 12) * 0.9 + (hasObjections ? 1.5 : 0), 0, 20),
    structureScore: clamp(10 + (hasNextSteps ? 5 : 0) + (analysis?.clientName ? 1 : 0) + clamp(tipsCount, 0, 8) * 0.3, 0, 20),
    technicalScore: clamp(10 + (hasPricing ? 1.5 : 0) + (hasObjections ? 2 : 0), 0, 20),
    qaScore: clamp(7 + clamp(questionsCount, 0, 14) * 0.85 + (consCount > 3 ? 1 : 0), 0, 20)
  });
}

export async function analyzeAndScoreMeeting(meeting, { transcriptText, source = "unknown" }) {
  const analysis = await analyzeWithAiService(transcriptText);

  await AnalysisReport.upsert({
    meetingId: meeting.id,
    clientName: analysis.clientName || "",
    productName: analysis.productName || "",
    summary: analysis.summary || "",
    pros: Array.isArray(analysis.pros) ? analysis.pros : [],
    cons: Array.isArray(analysis.cons) ? analysis.cons : [],
    tips: Array.isArray(analysis.tips) ? analysis.tips : [],
    sentiment: analysis.sentiment || "neutral",
    questionsDetected: Array.isArray(analysis.questionsDetected) ? analysis.questionsDetected : [],
    questionsCount: Number(analysis.questionsCount || 0),
    qaPairs: Array.isArray(analysis.qaPairs) ? analysis.qaPairs : [],
    demoQualityEvaluation: analysis.demoQualityEvaluation || ""
  });

  const scores = scoreFromAnalysis(analysis);
  await DemoScore.upsert({ meetingId: meeting.id, ...scores });

  const now = new Date();
  if (meeting.endTime && new Date(meeting.endTime) <= now) {
    const newRaw = { ...(meeting.raw || {}), workflow: { processedAt: new Date().toISOString(), transcriptSource: source } };
    await meeting.update({ status: "completed", transcriptStatus: "ready", analysisStatus: "completed", raw: newRaw });
  }

  return { analysis, scores };
}

export async function runDemoMonitoringWorkflow({ maxMeetingsToProcess = 10 } = {}) {
  const syncResult = await syncMeetingsForAllConsultants();

  const now = new Date();
  const candidates = await Meeting.findAll({
    where: {
      monitored: true,
      endTime: { [Op.lte]: now },
      status: { [Op.ne]: "completed" },
      autoAnalyzedAt: null
    },
    order: [["endTime", "DESC"]],
    limit: maxMeetingsToProcess
  });

  const processed = [], skipped = [];

  for (const meeting of candidates) {
    try {
      const transcriptResult = await fetchTranscriptForMeeting(meeting);
      if (!transcriptResult?.text) {
        await meeting.update({ transcriptStatus: "failed", analysisStatus: "failed" });
        skipped.push({ meetingId: meeting.id, reason: "No transcript or chat messages available." });
        continue;
      }

      const { text: transcriptText, source } = transcriptResult;
      await meeting.update({ transcriptStatus: "ready", analysisStatus: "pending" });
      await Transcript.upsert({ meetingId: meeting.id, transcriptText });

      const analysis = await analyzeWithAiService(transcriptText);
      await AnalysisReport.upsert({
        meetingId: meeting.id,
        clientName: analysis.clientName || "",
        productName: analysis.productName || "",
        summary: analysis.summary || "",
        pros: Array.isArray(analysis.pros) ? analysis.pros : [],
        cons: Array.isArray(analysis.cons) ? analysis.cons : [],
        tips: Array.isArray(analysis.tips) ? analysis.tips : [],
        sentiment: analysis.sentiment || "neutral",
        questionsDetected: Array.isArray(analysis.questionsDetected) ? analysis.questionsDetected : [],
        questionsCount: Number(analysis.questionsCount || 0),
        qaPairs: Array.isArray(analysis.qaPairs) ? analysis.qaPairs : [],
        demoQualityEvaluation: analysis.demoQualityEvaluation || ""
      });

      const scores = scoreFromAnalysis(analysis);
      await DemoScore.upsert({ meetingId: meeting.id, ...scores });

      const newRaw = { ...(meeting.raw || {}), workflow: { processedAt: new Date().toISOString(), transcriptSource: source } };
      await meeting.update({ status: "completed", transcriptStatus: "ready", analysisStatus: "completed", autoAnalyzedAt: new Date(), raw: newRaw });

      processed.push({ meetingId: meeting.id, transcriptSource: source, totalScore: scores.totalScore });
    } catch (err) {
      await meeting.update({ transcriptStatus: "failed", analysisStatus: "failed" });
      skipped.push({ meetingId: meeting.id, reason: err?.message || "Processing failed" });
    }
  }

  return { sync: { ...syncResult }, detectedCompletedMeetings: candidates.length, processed, skipped };
}
