import { Transcript, AnalysisReport, DemoScore } from "../models/index.js";
import { calculateDemoScores } from "./demoScoringEngine.js";

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

async function analyzeWithAiService(transcriptText) {
  const baseUrl = process.env.AI_SERVICE_URL || "http://localhost:7000";
  const url = `${baseUrl.replace(/\/$/, "")}/analyze`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: transcriptText })
    });
  } catch (networkErr) {
    const err = new Error(`AI service is not reachable at ${url}. Please start the Python AI service and try again.`);
    err.status = 503;
    throw err;
  }
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

  const getKPI = (name, weight) => (Number(kpis[name]?.score_1_to_5 || 1) * weight);

  const discoveryScore = getKPI("Pain identification", 5) +
                       getKPI("Current infra and state mapping", 3) +
                       getKPI("Stakeholder mapping", 4) +
                       getKPI("Competition identification", 3);

  const rapportScore = getKPI("Agenda setting", 3) +
                     getKPI("Personalisation", 3) +
                     getKPI("Active listening signals", 4) +
                     getKPI("Talk-to-listen ratio", 4);

  const demoScore = getKPI("Relevance of demo flow", 5) +
                  getKPI("Story-based narrative", 4) +
                  getKPI("Value articulation", 5) +
                  getKPI("Handling technical Qs", 3);

  const objectionsScore = getKPI("Objection recognition", 4) +
                        getKPI("Resolution quality", 4) +
                        getKPI("Competitor handling", 3) +
                        getKPI("Price / ROI discussion", 3);

  const engagementScore = getKPI("Questions asked by prospect", 4) +
                        getKPI("Use case confirmation", 5) +
                        getKPI("Sentiment tone", 3) +
                        getKPI("Internal mention", 4);

  const closeScore = getKPI("Clear next step set", 5) +
                   getKPI("Timeline established", 4) +
                   getKPI("Mutual action plan", 4);

  const riskCount = Object.values(risks).filter(r => r.present_boolean === true).length;
  const riskDeduction = riskCount * 5;

  return {
    discoveryScore,
    rapportScore,
    demoScore,
    objectionsScore,
    engagementScore,
    closeScore,
    riskDeduction
  };
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
    demoQualityEvaluation: analysis.demoQualityEvaluation || "",
    structuredDetails: analysis.structuredDetails || {},
    riskFlags: analysis.riskFlags || {}
  }, { returning: true });

  const [scoreDoc] = await DemoScore.upsert({ meetingId, ...scores }, { returning: true });

  return { analysis: analysisDoc, scores: scoreDoc };
}
