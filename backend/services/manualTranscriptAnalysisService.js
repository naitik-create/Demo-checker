import { Transcript, AnalysisReport, DemoScore } from "../models/index.js";
import { calculateDemoScores } from "./demoScoringEngine.js";

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

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
  const summary = String(analysis?.summary || "");
  const evalText = String(analysis?.demoQualityEvaluation || "");
  const hasNextSteps = /next\s+step|follow[-\s]?up|send\s+(a\s+)?proposal|pilot|poc|trial|timeline|implementation/i.test(`${summary}\n${evalText}`);
  const hasPricing = /pricing|price|cost|budget|roi|expensive/i.test(`${summary}\n${evalText}`);
  const hasObjections = /concern|risk|security|compliance|migration|alternative|competitor|unclear/i.test(`${summary}\n${evalText}`);

  return calculateDemoScores({
    communicationScore: clamp(10 + (sentiment === "positive" ? 5 : sentiment === "negative" ? -2 : 2) + clamp(prosCount, 0, 6) * 0.8 - clamp(consCount, 0, 6) * 0.4, 0, 20),
    engagementScore: clamp(8 + clamp(questionsCount, 0, 12) * 0.9 + (hasObjections ? 1.5 : 0), 0, 20),
    structureScore: clamp(10 + (hasNextSteps ? 5 : 0) + (analysis?.clientName ? 1 : 0) + clamp(tipsCount, 0, 8) * 0.3, 0, 20),
    technicalScore: clamp(10 + (hasPricing ? 1.5 : 0) + (hasObjections ? 2 : 0), 0, 20),
    qaScore: clamp(7 + clamp(questionsCount, 0, 14) * 0.85 + (consCount > 3 ? 1 : 0), 0, 20)
  });
}

export async function runManualTranscriptAnalysis({ meetingId, transcriptText, productName = "" }) {
  await Transcript.upsert({ meetingId, transcriptText });

  const analysis = await analyzeWithAiService(transcriptText);
  const scores = scoreFromAnalysis(analysis);

  const [analysisDoc] = await AnalysisReport.upsert({
    meetingId,
    clientName: analysis.clientName || "",
    productName: productName || analysis.productName || "",
    summary: analysis.summary || "",
    pros: Array.isArray(analysis.pros) ? analysis.pros : [],
    cons: Array.isArray(analysis.cons) ? analysis.cons : [],
    tips: Array.isArray(analysis.tips) ? analysis.tips : [],
    sentiment: analysis.sentiment || "neutral",
    questionsDetected: Array.isArray(analysis.questionsDetected) ? analysis.questionsDetected : [],
    questionsCount: Number(analysis.questionsCount || 0),
    qaPairs: Array.isArray(analysis.qaPairs) ? analysis.qaPairs : [],
    demoQualityEvaluation: analysis.demoQualityEvaluation || ""
  }, { returning: true });

  const [scoreDoc] = await DemoScore.upsert({ meetingId, ...scores }, { returning: true });

  return { analysis: analysisDoc, scores: scoreDoc };
}
