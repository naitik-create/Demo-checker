import { AnalysisReport, Meeting, Transcript, DemoScore } from "../models/index.js";
import { calculateDemoScores } from "../services/demoScoringEngine.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export async function saveAnalysisReport(req, res, next) {
  try {
    const {
      meetingId,
      summary = "",
      pros = [],
      cons = [],
      sentiment = "neutral",
      questionsDetected = [],
      questionsCount = 0,
      demoQualityEvaluation = "",
      productName = "",
      qaPairs = []
    } = req.body || {};

    if (!meetingId) throw badRequest("meetingId is required");

    const meetingExists = await Meeting.findOne({ where: { id: meetingId }, attributes: ["id"] });
    if (!meetingExists) {
      const err = new Error("Meeting not found");
      err.status = 404;
      throw err;
    }

    const [doc] = await AnalysisReport.upsert({
      meetingId,
      clientName: String(req.body?.clientName || ""),
      productName: String(productName || ""),
      summary: String(summary || ""),
      pros: Array.isArray(pros) ? pros.map(String) : [],
      cons: Array.isArray(cons) ? cons.map(String) : [],
      tips: Array.isArray(req.body?.tips) ? req.body.tips.map(String) : [],
      sentiment,
      questionsDetected: Array.isArray(questionsDetected) ? questionsDetected.map(String) : [],
      questionsCount: Number.isFinite(Number(questionsCount)) ? Number(questionsCount) : 0,
      qaPairs: Array.isArray(qaPairs) ? qaPairs : [],
      demoQualityEvaluation: String(demoQualityEvaluation || "")
    }, { returning: true });

    res.status(201).json({
      ok: true,
      analysisReport: {
        id: doc.id,
        meetingId: doc.meetingId,
        clientName: doc.clientName,
        productName: doc.productName,
        summary: doc.summary,
        pros: doc.pros,
        cons: doc.cons,
        tips: doc.tips,
        sentiment: doc.sentiment,
        questionsCount: doc.questionsCount,
        questionsDetected: doc.questionsDetected,
        qaPairs: doc.qaPairs || [],
        demoQualityEvaluation: doc.demoQualityEvaluation,
        createdAt: doc.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function handleManualScript(req, res, next) {
  try {
    const { script, consultantId, title, productName = "" } = req.body || {};
    if (!script) throw badRequest("script is required");

    let targetUserId = consultantId;
    if (!targetUserId) targetUserId = req.user?.id;
    if (!targetUserId) throw badRequest("consultantId is required");

    const meeting = await Meeting.create({
      title: String(title || "Manual Script Analysis").slice(0, 120),
      teamsMeetingId: "manual_" + Date.now() + "_" + Math.random().toString(36).substring(7),
      consultantId: targetUserId,
      startTime: new Date(),
      endTime: new Date(),
      status: "completed"
    });

    const { runManualTranscriptAnalysis } = await import("../services/manualTranscriptAnalysisService.js");
    const result = await runManualTranscriptAnalysis({ meetingId: meeting.id, transcriptText: script, productName });

    res.status(201).json({
      ok: true,
      meeting: { id: meeting.id, title: meeting.title },
      analysis: result.analysis,
      scores: result.scores
    });
  } catch (err) {
    next(err);
  }
}

export async function handleVideoUpload(req, res, next) {
  try {
    const { consultantId } = req.body || {};
    if (!consultantId) throw badRequest("consultantId is required");
    if (!req.file) throw badRequest("video/audio file is required");

    const aiBaseUrl = process.env.AI_SERVICE_URL || "http://localhost:7000";

    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname || "upload.mp4",
      contentType: req.file.mimetype || "video/mp4"
    });

    const transcribeRes = await fetch(`${aiBaseUrl}/transcribe`, {
      method: "POST",
      body: form,
      headers: form.getHeaders ? form.getHeaders() : {}
    });
    if (!transcribeRes.ok) {
      const errJson = await transcribeRes.json().catch(() => ({}));
      const err = new Error(errJson?.error || "Transcription failed");
      err.status = 502;
      throw err;
    }
    const transcribeData = await transcribeRes.json();
    const transcriptText = transcribeData?.transcript || "";

    const analyzeRes = await fetch(`${aiBaseUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: transcriptText })
    });
    if (!analyzeRes.ok) {
      const errJson = await analyzeRes.json().catch(() => ({}));
      const err = new Error(errJson?.error || "Analysis failed");
      err.status = 502;
      throw err;
    }
    const analyzeData = await analyzeRes.json();
    const analysis = analyzeData?.analysis || {};

    const meeting = await Meeting.create({
      title: `Video Upload Analysis — ${req.file.originalname || "upload"}`,
      teamsMeetingId: "video_" + Date.now() + "_" + Math.random().toString(36).substring(7),
      consultantId,
      startTime: new Date(),
      endTime: new Date(),
      status: "completed"
    });

    await Transcript.upsert({ meetingId: meeting.id, transcriptText });

    const { runManualTranscriptAnalysis } = await import("../services/manualTranscriptAnalysisService.js");
    const result = await runManualTranscriptAnalysis({ meetingId: meeting.id, transcriptText });

    res.status(201).json({
      ok: true,
      meeting: { id: meeting.id, title: meeting.title },
      transcript: transcriptText,
      analysis: result.analysis,
      scores: result.scores
    });
  } catch (err) {
    next(err);
  }
}
