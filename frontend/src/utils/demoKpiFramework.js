const SCORE_GUIDE = {
  5: { label: "Excellent", definition: "Fully demonstrated, proactively and with depth", action: "No action needed" },
  4: { label: "Good", definition: "Clearly addressed with minor gaps", action: "Light follow-up" },
  3: { label: "Average", definition: "Partially covered; some key points missed", action: "Coach and reinforce" },
  2: { label: "Below avg", definition: "Attempted but largely ineffective", action: "Immediate coaching needed" },
  1: { label: "Poor", definition: "Not attempted or completely ineffective", action: "Escalate / re-do call" }
};

const PRODUCT_PROFILES = {
  serviceops: {
    id: "serviceops", label: "ServiceOps", family: "ITSM",
    aliases: ["serviceops", "service ops", "itsm", "it service management", "service desk", "helpdesk"],
    summary: "ITSM demos should prove service desk maturity, process control, automation, visibility, and governance.",
    executiveLens: ["Show business pain in terms of ticket volume, SLA misses, and manual effort.", "Tie the demo to service desk workflows."],
    discoveryQuestions: ["How are incidents, requests, and approvals handled today?", "Where are SLA breaches happening?"],
    demoProofPoints: ["Incident, request, problem, and change workflows.", "SLA policies and automations."],
    successSignals: ["Buyer maps the platform to service desk modernization.", "Stakeholders discuss rollout scope."],
    evidenceKeywords: [/\bincident\b/i, /\brequest\b/i, /\bchange\b/i, /\bproblem\b/i, /\bservice desk\b/i, /\bsla\b/i],
    kpiOverrides: {}
  },
  observeops: {
    id: "observeops", label: "ObserveOps", family: "AIOps",
    aliases: ["observeops", "observe ops", "aiops", "observability", "monitoring", "nms"],
    summary: "AIOps demos should prove monitoring depth, event intelligence, noise reduction, and RCA.",
    executiveLens: ["Show business pain in terms of alert noise and downtime.", "Tie the demo to monitoring and RCA."],
    discoveryQuestions: ["What is the current alert volume and noise level?", "How do teams identify root cause?"],
    demoProofPoints: ["Unified monitoring visibility.", "Event correlation and topology."],
    successSignals: ["Buyer maps the platform to reducing alert fatigue.", "Stakeholders ask about integrations."],
    evidenceKeywords: [/\balert\b/i, /\bnoise\b/i, /\bcorrelation\b/i, /\btopology\b/i, /\brca\b/i, /\bmonitoring\b/i],
    kpiOverrides: {}
  }
};

const DEFAULT_PRODUCT_PROFILE = {
  id: "generic", label: "Motadata Demo", family: "Presales",
  summary: "Standard evaluation focusing on discovery quality, product relevance, and next-step control.",
  executiveLens: ["Clarify the buyer's current pain and measurable outcome.", "Show the product through buyer-specific workflows."],
  discoveryQuestions: ["What is not working well today?", "Who will evaluate or approve the solution?"],
  demoProofPoints: ["Use-case-led walkthrough.", "Evidence of business value."],
  successSignals: ["Buyer connects solution to goals.", "Concrete next step agreed."],
  evidenceKeywords: [], kpiOverrides: {}
};

const KPI_DIMENSIONS = [
  {
    id: "discovery", label: "Discovery", subtitle: "Needs discovery", description: "Did the person uncover real pain?", tone: "#6366f1", weightMax: 75,
    kpis: [
      { id: "pain_identification", label: "Pain identification", weight: 5 },
      { id: "current_infra_mapping", label: "Current infra and state mapping", weight: 3 },
      { id: "stakeholder_mapping", label: "Stakeholder mapping", weight: 4 },
      { id: "competition_identification", label: "Competition identification", weight: 3 }
    ]
  },
  {
    id: "rapport", label: "Rapport", subtitle: "Opening & rapport", description: "First impressions and trust-building", tone: "#0f766e", weightMax: 70,
    kpis: [
      { id: "agenda_setting", label: "Agenda setting", weight: 3 },
      { id: "personalisation", label: "Personalisation", weight: 3 },
      { id: "active_listening_signals", label: "Active listening signals", weight: 4 },
      { id: "talk_listen_ratio", label: "Talk-to-listen ratio", weight: 4 }
    ]
  },
  {
    id: "demo", label: "Demo", subtitle: "Demo delivery", description: "Was the product shown effectively?", tone: "#b7791f", weightMax: 85,
    kpis: [
      { id: "relevance_of_flow", label: "Relevance of demo flow", weight: 5 },
      { id: "story_based_narrative", label: "Story-based narrative", weight: 4 },
      { id: "value_articulation", label: "Value articulation", weight: 5 },
      { id: "technical_questions", label: "Handling technical Qs", weight: 3 }
    ]
  },
  {
    id: "objections", label: "Objections", subtitle: "Objection handling", description: "How well were concerns addressed?", tone: "#b45309", weightMax: 70,
    kpis: [
      { id: "objection_recognition", label: "Objection recognition", weight: 4 },
      { id: "resolution_quality", label: "Resolution quality", weight: 4 },
      { id: "competitor_handling", label: "Competitor handling", weight: 3 },
      { id: "price_roi_discussion", label: "Price / ROI discussion", weight: 3 }
    ]
  },
  {
    id: "engagement", label: "Engagement", subtitle: "Prospect engagement", description: "Signals of genuine interest", tone: "#2563eb", weightMax: 80,
    kpis: [
      { id: "questions_asked", label: "Questions asked by prospect", weight: 4 },
      { id: "use_case_confirmation", label: "Use case confirmation", weight: 5 },
      { id: "sentiment_tone", label: "Sentiment tone", weight: 3 },
      { id: "internal_mention", label: "Internal mention", weight: 4 }
    ]
  },
  {
    id: "close", label: "Close", subtitle: "Next steps & close", description: "Did the call advance the deal?", tone: "#be185d", weightMax: 65,
    kpis: [
      { id: "clear_next_step", label: "Clear next step set", weight: 5 },
      { id: "timeline_established", label: "Timeline established", weight: 4 },
      { id: "mutual_action_plan", label: "Mutual action plan", weight: 4 }
    ]
  },
  {
    id: "risks", label: "Risks", subtitle: "Red flags & risks", description: "Negative signals that reduce overall score", tone: "#991b1b", risk: true,
    kpis: [
      { id: "feature_gaps", label: "Feature gaps raised" },
      { id: "budget_concerns", label: "Budget concern signals" },
      { id: "disengagement", label: "Disengagement moments" },
      { id: "unresolved_objections", label: "Unresolved objections" }
    ]
  }
];

function safeText(value) { return String(value || "").trim(); }

function fullText(report) {
  return [
    report?.summary, report?.demoQualityEvaluation, report?.clientName, report?.productName,
    ...(Array.isArray(report?.pros) ? report.pros : []),
    ...(Array.isArray(report?.cons) ? report.cons : []),
    ...(Array.isArray(report?.tips) ? report.tips : []),
    report?.transcript?.transcriptText
  ].map(safeText).filter(Boolean).join("\n").toLowerCase();
}

function normalizeProductName(productName, text) {
  const explicit = safeText(productName).toLowerCase();
  for (const profile of Object.values(PRODUCT_PROFILES)) {
    if (profile.aliases.some(a => explicit.includes(a))) return profile;
  }
  for (const profile of Object.values(PRODUCT_PROFILES)) {
    if (profile.evidenceKeywords.filter(p => p.test(text)).length >= 2) return profile;
  }
  return DEFAULT_PRODUCT_PROFILE;
}

function scoreStatus(score) {
  if (score >= 5) return "excellent";
  if (score >= 4) return "good";
  if (score >= 3) return "average";
  if (score >= 2) return "below-average";
  return "poor";
}

export function buildDemoKpiAssessment(report) {
  const text = fullText(report);
  const productProfile = normalizeProductName(report?.productName, text);
  const aiDetails = report?.structuredDetails || {};
  const aiRisks = report?.riskFlags || {};

  let totalWeightedScore = 0;
  const weightedMaxTotal = 445;

  const dimensions = KPI_DIMENSIONS.map((baseDim) => {
    const kpis = baseDim.kpis.map((kpi) => {
      if (baseDim.risk) {
        const aiRisk = aiRisks[kpi.label] || {};
        const present = aiRisk.present_boolean === true;
        return {
          ...kpi, present,
          evidence: aiRisk.evidence_quote || (present ? "Detected" : "Not detected"),
          status: present ? "risk-present" : "risk-clear"
        };
      }

      const aiKpi = aiDetails[kpi.label] || aiDetails[kpi.label.trim()] || {};
      const score = Number(aiKpi.score_1_to_5 || aiKpi.score || 1);
      const weighted = score * (kpi.weight || 0);
      totalWeightedScore += weighted;

      return {
        ...kpi, score,
        reason: aiKpi.reason || aiKpi.reasoning || "Refer to transcript.",
        evidence: aiKpi.evidence_quote || aiKpi.evidence || "N/A",
        weightedScore: weighted,
        status: scoreStatus(score)
      };
    });

    const dimWeighted = baseDim.risk ? 0 : kpis.reduce((sum, k) => sum + k.weightedScore, 0);
    
    return {
      ...baseDim,
      weightedScore: dimWeighted,
      kpis,
      averageScore: baseDim.risk ? 0 : Number((kpis.reduce((sum, k) => sum + k.score, 0) / kpis.length).toFixed(1)),
      percentage: baseDim.risk ? 0 : Math.round((dimWeighted / baseDim.weightMax) * 100)
    };
  });

  const riskCount = dimensions.find(d => d.risk)?.kpis.filter(k => k.present).length || 0;
  const riskDeductionPoints = riskCount * 5;
  const adjustedScore = totalWeightedScore - riskDeductionPoints;
  const finalScore100 = Math.max(0, Math.min(100, Math.round((adjustedScore / weightedMaxTotal) * 100)));

  let verdict = "Average";
  if (finalScore100 >= 80) verdict = "Excellent";
  else if (finalScore100 >= 65) verdict = "Good";
  else if (finalScore100 >= 50) verdict = "Average";
  else if (finalScore100 >= 35) verdict = "Below Average";
  else verdict = "Deal at Risk";

  return {
    productProfile,
    productSummary: {
      title: `${productProfile.label} Evaluation Report`,
      family: productProfile.family,
      summary: productProfile.summary,
      executiveLens: productProfile.executiveLens,
      discoveryQuestions: productProfile.discoveryQuestions,
      demoProofPoints: productProfile.demoProofPoints,
      successSignals: productProfile.successSignals
    },
    dimensions,
    weightedScore: totalWeightedScore,
    weightedMax: weightedMaxTotal,
    riskDeductionPoints,
    adjustedScore,
    finalScore: finalScore100,
    verdict,
    riskCount,
    scoredKpis: dimensions.filter(d => !d.risk).reduce((sum, d) => sum + d.kpis.length, 0),
    positiveDimensionCount: dimensions.filter(d => !d.risk).length
  };
}
