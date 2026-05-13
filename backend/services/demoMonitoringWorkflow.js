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
  const kpis = analysis?.structuredDetails || {};
  const risks = analysis?.riskFlags || {};

  const getKPI = (name, weight) => Number(kpis[name]?.score_1_to_5 || 1) * weight;

  // Discovery — max 30
  const discoveryScore = getKPI("Pain identification", 4) +
                         getKPI("Current infra and state mapping", 2);

  // Opening & Rapport — max 40
  const rapportScore = getKPI("Active listening signals", 4) +
                       getKPI("Talk-to-listen ratio", 4);

  // Demo Delivery — max 70
  const demoScore = getKPI("Handling technical Qs", 5) +
                    getKPI("Relevance of demo flow", 4) +
                    getKPI("Value articulation", 3) +
                    getKPI("Story-based narrative", 2);

  // Objection Handling — max 50
  const objectionsScore = getKPI("Resolution quality", 4) +
                          getKPI("Competitor handling", 4) +
                          getKPI("Price / ROI discussion", 2);

  // Prospect Engagement — max 55
  const engagementScore = getKPI("Sentiment tone", 5) +
                          getKPI("Questions asked by prospect", 4) +
                          getKPI("Use case confirmation", 2);

  // Next Steps & Close — max 45
  const closeScore = getKPI("Clear next step set", 5) +
                     getKPI("Mutual action plan", 4);

  const riskCount = Object.values(risks).filter(r => r.present_boolean === true).length;
  const riskDeduction = riskCount * 5;
  const sentiment = analysis?.sentiment || "neutral";
  const questionsCount = Number(analysis?.questionsCount || 0);
  const qaPairsCount = Array.isArray(analysis?.qaPairs) ? analysis.qaPairs.length : 0;
  const allQuestionsAnswered = questionsCount > 0 && qaPairsCount >= questionsCount;

  return calculateDemoScores({ discoveryScore, rapportScore, demoScore, objectionsScore, engagementScore, closeScore, riskDeduction, sentiment, allQuestionsAnswered });
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
    demoQualityEvaluation: analysis.demoQualityEvaluation || "",
    structuredDetails: analysis.structuredDetails || {},
    riskFlags: analysis.riskFlags || {},
    kpiGaps: analysis.kpiGaps || {}
  });

  const scores = await scoreFromAnalysis(analysis);
  await DemoScore.upsert({ meetingId: meeting.id, ...scores });

  const now = new Date();
  if (meeting.endTime && new Date(meeting.endTime) <= now) {
    const newRaw = { ...(meeting.raw || {}), workflow: { processedAt: new Date().toISOString(), transcriptSource: source } };
    await meeting.update({ status: "completed", transcriptStatus: "ready", analysisStatus: "completed", raw: newRaw });
  }

  return { analysis, scores };
}

export async function runDemoMonitoringWorkflow({ maxMeetingsToProcess = 50 } = {}) {
  const syncResult = await syncMeetingsForAllConsultants();

  const now = new Date();
  // Pick any meeting marked Is Demo that has ended and hasn't been successfully analyzed yet
  const candidates = await Meeting.findAll({
    where: {
      isDemo: true,
      endTime: { [Op.lte]: now },
      analysisStatus: { [Op.notIn]: ["completed", "pending"] }
    },
    order: [["endTime", "DESC"]],
    limit: maxMeetingsToProcess
  });

  const processed = [], skipped = [];

  for (const meeting of candidates) {
    try {
      // Use existing DB transcript first; fall back to fetching from Teams
      const existing = await Transcript.findOne({ where: { meetingId: meeting.id } });
      let transcriptText, source;

      if (existing?.transcriptText) {
        transcriptText = existing.transcriptText;
        source = "db";
      } else {
        const transcriptResult = await fetchTranscriptForMeeting(meeting);
        if (!transcriptResult?.text) {
          await meeting.update({ transcriptStatus: "failed", analysisStatus: "failed" });
          skipped.push({ meetingId: meeting.id, reason: "No transcript available." });
          continue;
        }
        transcriptText = transcriptResult.text;
        source = transcriptResult.source;
        await Transcript.upsert({ meetingId: meeting.id, transcriptText });
      }

      await meeting.update({ transcriptStatus: "ready", analysisStatus: "pending" });
      const { scores } = await analyzeAndScoreMeeting(meeting, { transcriptText, source });
      await meeting.update({ autoAnalyzedAt: new Date() });

      processed.push({ meetingId: meeting.id, transcriptSource: source, totalScore: scores.totalScore });
    } catch (err) {
      await meeting.update({ analysisStatus: "failed" });
      skipped.push({ meetingId: meeting.id, reason: err?.message || "Processing failed" });
    }
  }

  return { sync: { ...syncResult }, detectedCompletedMeetings: candidates.length, processed, skipped };
}

export async function analyzeIsDemoMeetingInBackground(meeting) {
  try {
    const now = new Date();
    if (!meeting.endTime || new Date(meeting.endTime) > now) return;
    if (meeting.analysisStatus === "completed") return;

    const existing = await Transcript.findOne({ where: { meetingId: meeting.id } });
    let transcriptText, source;

    if (existing?.transcriptText) {
      transcriptText = existing.transcriptText;
      source = "db";
    } else {
      const result = await fetchTranscriptForMeeting(meeting);
      if (!result?.text) {
        await meeting.update({ analysisStatus: "failed" });
        return;
      }
      transcriptText = result.text;
      source = result.source;
      await Transcript.upsert({ meetingId: meeting.id, transcriptText });
    }

    await meeting.update({ transcriptStatus: "ready", analysisStatus: "pending" });
    await analyzeAndScoreMeeting(meeting, { transcriptText, source });
    await meeting.update({ autoAnalyzedAt: new Date() });
  } catch {
    await meeting.update({ analysisStatus: "failed" }).catch(() => {});
  }
}
