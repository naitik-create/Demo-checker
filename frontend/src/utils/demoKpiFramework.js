const SCORE_GUIDE = {
  5: {
    label: "Excellent",
    definition: "Fully demonstrated, proactively and with depth",
    signal: "Strong buying signal, clear progress",
    action: "No action needed"
  },
  4: {
    label: "Good",
    definition: "Clearly addressed with minor gaps",
    signal: "Positive trajectory",
    action: "Light follow-up"
  },
  3: {
    label: "Average",
    definition: "Partially covered; some key points missed",
    signal: "Neutral, needs attention",
    action: "Coach and reinforce"
  },
  2: {
    label: "Below avg",
    definition: "Attempted but largely ineffective",
    signal: "Negative signal present",
    action: "Immediate coaching needed"
  },
  1: {
    label: "Poor",
    definition: "Not attempted or completely ineffective",
    signal: "Deal at risk",
    action: "Escalate / re-do call"
  }
};

const PRODUCT_PROFILES = {
  serviceops: {
    id: "serviceops",
    label: "ServiceOps",
    family: "ITSM",
    aliases: ["serviceops", "service ops", "itsm", "it service management", "service desk", "helpdesk"],
    summary:
      "ITSM demos should prove service desk maturity, process control, automation, visibility, and governance across incidents, requests, assets, changes, and SLAs.",
    executiveLens: [
      "Show business pain in terms of ticket volume, SLA misses, service bottlenecks, manual effort, and audit/compliance risk.",
      "Tie the demo to service desk workflows such as incident, request, change, problem, CMDB, asset, approval, and knowledge management.",
      "Demonstrate measurable outcomes like faster MTTR, better SLA attainment, automation, self-service adoption, and operational control."
    ],
    discoveryQuestions: [
      "How are incidents, requests, and approvals handled today across teams?",
      "Where are SLA breaches, escalations, or turnaround delays happening most often?",
      "How are CMDB, asset inventory, and service dependencies maintained today?",
      "Which workflows still depend on email, spreadsheets, or manual coordination?",
      "What reporting, governance, or audit visibility is missing for leadership?"
    ],
    demoProofPoints: [
      "Incident, request, problem, and change workflows tailored to the buyer's operating model.",
      "SLA policies, escalations, approvals, automations, and service catalog use cases.",
      "CMDB or asset-linked service context that improves resolution and governance.",
      "Dashboards and reports for service performance, compliance, and team productivity."
    ],
    successSignals: [
      "Buyer maps the platform to service desk modernization or governance outcomes.",
      "Stakeholders discuss rollout scope, teams, process ownership, or integration planning.",
      "There is interest in automation, self-service, SLA control, or ITIL-aligned workflow standardization."
    ],
    evidenceKeywords: [
      /\bincident\b/i,
      /\brequest\b/i,
      /\bchange\b/i,
      /\bproblem\b/i,
      /\bservice desk\b/i,
      /\bhelp ?desk\b/i,
      /\bcmdb\b/i,
      /\basset\b/i,
      /\bservice catalog\b/i,
      /\bsla\b/i,
      /\bescalation\b/i,
      /\bapproval\b/i,
      /\bknowledge base\b/i,
      /\bitil\b/i
    ],
    kpiOverrides: {
      pain_identification: {
        detail: "Were service desk pain points such as SLA misses, manual routing, backlog, audit gaps, or poor visibility clearly surfaced?",
        questionnaire: [
          "Did the consultant quantify ticketing pain, service delays, or operational inefficiency?",
          "Did the call uncover why current service processes are breaking for the customer?"
        ]
      },
      current_state_mapping: {
        detail: "Were current service workflows, tools, teams, CMDB/asset practices, and approval paths clearly mapped?",
        questionnaire: [
          "Was the current ITSM stack and process maturity understood?",
          "Did the consultant identify the buyer's workflow bottlenecks and ownership model?"
        ]
      },
      relevance_of_flow: {
        detail: "Did the demo flow match ITSM use cases like incidents, requests, change, asset, approvals, service catalog, and SLA governance?",
        questionnaire: [
          "Was the walkthrough centered on the buyer's actual support and service-management process?",
          "Did the consultant avoid a generic feature tour?"
        ]
      },
      value_articulation: {
        detail: "Was the value framed in terms of faster resolution, lower manual effort, SLA compliance, governance, and service productivity?",
        questionnaire: [
          "Did the consultant explain the business value of process standardization and automation?",
          "Was operational improvement articulated clearly for leadership?"
        ]
      },
      technical_questions: {
        detail: "Were integrations, CMDB, asset model, workflows, SSO, notifications, and reporting questions handled credibly?",
        questionnaire: [
          "Did the consultant answer ITSM architecture and implementation questions properly?",
          "Were integration and process-governance concerns handled well?"
        ]
      },
      use_case_confirmation: {
        detail: "Did the buyer connect the platform to service desk modernization, workflow governance, automation, or ITIL use cases?",
        questionnaire: [
          "Did the prospect relate ServiceOps to their own ticketing and support operation?",
          "Was there explicit confirmation of fit for service-management processes?"
        ]
      },
      feature_gaps: {
        detail: "Were missing workflow, CMDB, asset, service catalog, approval, or reporting capabilities raised as blockers?"
      }
    }
  },
  observeops: {
    id: "observeops",
    label: "ObserveOps",
    family: "AIOps",
    aliases: ["observeops", "observe ops", "aiops", "observability", "monitoring", "nms", "event correlation"],
    summary:
      "AIOps demos should prove monitoring depth, event intelligence, noise reduction, topology awareness, faster incident response, and operational observability at scale.",
    executiveLens: [
      "Show business pain in terms of alert noise, blind spots, downtime, MTTR, manual triage, and fragmented visibility.",
      "Tie the demo to monitoring, event correlation, topology, RCA, anomaly detection, automation, and war-room operations.",
      "Demonstrate outcomes such as fewer false alerts, faster root-cause identification, better coverage, and proactive operations."
    ],
    discoveryQuestions: [
      "What is the current alert volume, noise level, and on-call burden?",
      "How do teams identify root cause when incidents span infra, apps, and network layers?",
      "Which monitoring tools are already in place, and where are visibility gaps still present?",
      "How are events correlated, escalated, or routed today during major incidents?",
      "What would better observability or AIOps need to improve for leadership to care?"
    ],
    demoProofPoints: [
      "Unified monitoring visibility across infra, network, apps, logs, or services relevant to the customer.",
      "Event correlation, alert noise reduction, topology, RCA, anomaly detection, and operational dashboards.",
      "Automation or remediation flows that improve incident response and mean time to detect/resolve.",
      "Executive reporting on uptime, service health, and operational risk."
    ],
    successSignals: [
      "Buyer maps the platform to reducing alert fatigue, improving MTTR, or gaining unified observability.",
      "Stakeholders ask about integrations, scale, telemetry coverage, automation, or deployment design.",
      "There is interest in proactive operations, topology-aware RCA, and better decision support during incidents."
    ],
    evidenceKeywords: [
      /\balert\b/i,
      /\bnoise\b/i,
      /\bcorrelation\b/i,
      /\btopology\b/i,
      /\broot cause\b/i,
      /\brca\b/i,
      /\banomaly\b/i,
      /\bincident response\b/i,
      /\bobservability\b/i,
      /\bmonitoring\b/i,
      /\btelemetry\b/i,
      /\bwar room\b/i,
      /\bmttr\b/i,
      /\bservice health\b/i,
      /\boutage\b/i
    ],
    kpiOverrides: {
      pain_identification: {
        detail: "Were observability pain points such as alert noise, downtime, slow RCA, monitoring gaps, or tool sprawl clearly surfaced?",
        questionnaire: [
          "Did the consultant quantify monitoring pain, outage impact, or alert fatigue?",
          "Was the cost of poor observability made clear?"
        ]
      },
      current_state_mapping: {
        detail: "Were current monitoring tools, data sources, coverage gaps, NOC/SRE processes, and escalation flow clearly understood?",
        questionnaire: [
          "Was the current monitoring architecture and operating model mapped?",
          "Did the consultant understand where triage and RCA break today?"
        ]
      },
      relevance_of_flow: {
        detail: "Did the demo flow map to observability, correlation, RCA, anomaly detection, topology, and major-incident workflows?",
        questionnaire: [
          "Was the walkthrough based on the customer's monitoring and incident-response reality?",
          "Did the consultant connect features to operational pain instead of showing dashboards generically?"
        ]
      },
      value_articulation: {
        detail: "Was the value framed in terms of lower alert noise, faster RCA, reduced MTTR, proactive detection, and better service health visibility?",
        questionnaire: [
          "Did the consultant articulate operational and business impact clearly?",
          "Was the value of observability and AIOps explained beyond features?"
        ]
      },
      technical_questions: {
        detail: "Were questions on integrations, data ingestion, scale, topology, AI correlation, automation, and deployment answered credibly?",
        questionnaire: [
          "Did the consultant answer architecture and telemetry questions confidently?",
          "Were deployment, scale, and observability-depth questions handled well?"
        ]
      },
      use_case_confirmation: {
        detail: "Did the buyer connect the platform to alert reduction, RCA acceleration, uptime improvement, or NOC/SRE workflows?",
        questionnaire: [
          "Did the prospect map ObserveOps to their own monitoring or operations use cases?",
          "Was there clear confirmation of AIOps fit?"
        ]
      },
      feature_gaps: {
        detail: "Were missing observability, correlation, topology, ingestion, or automation capabilities raised as blockers?"
      }
    }
  }
};

const DEFAULT_PRODUCT_PROFILE = {
  id: "generic",
  label: "Motadata Demo",
  family: "Presales",
  summary:
    "Use the standard workbook framework when the product is not explicit, focusing on discovery quality, product relevance, engagement, objections, and next-step control.",
  executiveLens: [
    "Clarify the buyer's current pain, operating context, and measurable outcome.",
    "Show the product through buyer-specific workflows instead of a generic feature tour.",
    "Close with concrete stakeholder alignment, timeline, and next actions."
  ],
  discoveryQuestions: [
    "What is not working well in the current process or system today?",
    "Which teams are involved and who will evaluate or approve the solution?",
    "What outcome would make this evaluation successful for the buyer?"
  ],
  demoProofPoints: [
    "A clear use-case-led walkthrough tied to stated pain points.",
    "Evidence of business value, technical fit, and implementation realism.",
    "Strong next-step alignment and buying momentum."
  ],
  successSignals: [
    "Buyer connects the solution to their own workflow or goals.",
    "Stakeholders ask deeper questions and discuss practical rollout.",
    "A concrete next step or evaluation plan is agreed."
  ],
  evidenceKeywords: [],
  kpiOverrides: {}
};

const KPI_DIMENSIONS = [
  {
    id: "discovery",
    label: "Discovery",
    subtitle: "Needs discovery",
    description: "Did the person uncover real pain?",
    tone: "#6366f1",
    kpis: [
      { id: "pain_identification", label: "Pain identification", detail: "Was the core business problem clearly surfaced?", priority: 5 },
      { id: "current_state_mapping", label: "Current infra and state mapping", detail: "Existing tools, workflows, gaps, and current setup identified", priority: 3 },
      { id: "stakeholder_mapping", label: "Stakeholder mapping", detail: "Decision-maker, champion, and blockers named?", priority: 4 },
      { id: "competition_identification", label: "Competition identification", detail: "Was greenfield vs brownfield / competitor context understood?", priority: 3 }
    ]
  },
  {
    id: "rapport",
    label: "Rapport",
    subtitle: "Opening & rapport",
    description: "First impressions and trust-building",
    tone: "#0f766e",
    kpis: [
      { id: "agenda_setting", label: "Agenda setting", detail: "Clear agenda shared and confirmed upfront", priority: 3 },
      { id: "personalisation", label: "Personalisation", detail: "Used prospect name, company, and context", priority: 3 },
      { id: "active_listening", label: "Active listening signals", detail: "Acknowledgements, follow-up questions, and visible listening", priority: 4 },
      { id: "talk_listen_ratio", label: "Talk-to-listen ratio", detail: "Prospect should speak meaningfully during the meeting", priority: 4 }
    ]
  },
  {
    id: "demo",
    label: "Demo",
    subtitle: "Demo delivery",
    description: "Was the product shown effectively?",
    tone: "#b7791f",
    kpis: [
      { id: "relevance_of_flow", label: "Relevance of demo flow", detail: "Showed features mapped to stated pain points", priority: 5 },
      { id: "story_narrative", label: "Story-based narrative", detail: "Used a scenario / use case, not just a feature tour", priority: 4 },
      { id: "value_articulation", label: "Value articulation", detail: "Clearly explained why this matters to the buyer", priority: 5 },
      { id: "technical_questions", label: "Handling technical Qs", detail: "Answered technical questions confidently and credibly", priority: 3 }
    ]
  },
  {
    id: "objections",
    label: "Objections",
    subtitle: "Objection handling",
    description: "How well were concerns addressed?",
    tone: "#b45309",
    kpis: [
      { id: "objection_recognition", label: "Objection recognition", detail: "Concerns were surfaced and acknowledged properly", priority: 4 },
      { id: "resolution_quality", label: "Resolution quality", detail: "Provided evidence, case study, or logic", priority: 4 },
      { id: "competitor_handling", label: "Competitor handling", detail: "Responded to competitor mentions professionally", priority: 3 },
      { id: "price_roi_discussion", label: "Price / ROI discussion", detail: "Cost justified through value or ROI framing", priority: 3 }
    ]
  },
  {
    id: "engagement",
    label: "Engagement",
    subtitle: "Prospect engagement",
    description: "Signals of genuine interest",
    tone: "#2563eb",
    kpis: [
      { id: "questions_asked", label: "Questions asked by prospect", detail: "Count and depth of inbound questions", priority: 4 },
      { id: "use_case_confirmation", label: "Use case confirmation", detail: "Prospect connected product to their own work", priority: 5 },
      { id: "sentiment_tone", label: "Sentiment tone", detail: "Positive, neutral, or negative language used", priority: 3 },
      { id: "internal_mention", label: "Internal mention", detail: "Did they reference sharing with colleagues?", priority: 4 }
    ]
  },
  {
    id: "close",
    label: "Close",
    subtitle: "Next steps & close",
    description: "Did the call advance the deal?",
    tone: "#be185d",
    kpis: [
      { id: "clear_next_step", label: "Clear next step set", detail: "Specific follow-up action with owner and date", priority: 5 },
      { id: "timeline_established", label: "Timeline established", detail: "Decision timeline confirmed or scoped", priority: 4 },
      { id: "mutual_action_plan", label: "Mutual action plan", detail: "Both sides agreed on steps to evaluate or buy", priority: 4 }
    ]
  },
  {
    id: "risks",
    label: "Risks",
    subtitle: "Red flags & risks",
    description: "Negative signals that reduce overall score",
    tone: "#991b1b",
    risk: true,
    kpis: [
      { id: "feature_gaps", label: "Feature gaps raised", detail: "Prospect mentioned missing features or blockers", priority: 1 },
      { id: "budget_concerns", label: "Budget concern signals", detail: "Price hesitation or procurement friction", priority: 1 },
      { id: "disengagement", label: "Disengagement moments", detail: "Silence, short replies, or off-topic drift", priority: 1 },
      { id: "unresolved_objections", label: "Unresolved objections", detail: "Concerns raised but never fully closed", priority: 1 }
    ]
  }
];

const RISK_DEDUCTION_PER_FLAG = 5;

function safeText(value) {
  return String(value || "").trim();
}

function fullText(report) {
  return [
    report?.summary,
    report?.demoQualityEvaluation,
    report?.clientName,
    report?.productName,
    ...(Array.isArray(report?.pros) ? report.pros : []),
    ...(Array.isArray(report?.cons) ? report.cons : []),
    ...(Array.isArray(report?.tips) ? report.tips : []),
    ...(Array.isArray(report?.questionsDetected) ? report.questionsDetected : []),
    ...(Array.isArray(report?.qaPairs) ? report.qaPairs.flatMap((pair) => [pair?.question, pair?.answer, pair?.tip]) : []),
    report?.transcript?.transcriptText
  ]
    .map(safeText)
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function toRatingFrom20(score20, fallback = 3) {
  if (typeof score20 !== "number") return fallback;
  return clamp(Math.round(score20 / 4), 1, 5);
}

function sentimentRating(sentiment) {
  const value = String(sentiment || "").toLowerCase();
  if (value === "positive") return 5;
  if (value === "negative") return 2;
  return 3;
}

function sentimentLabel(sentiment) {
  const value = String(sentiment || "").toLowerCase();
  if (value === "positive") return "Positive";
  if (value === "negative") return "Negative";
  return "Neutral";
}

function scoreStatus(score) {
  if (score >= 5) return "excellent";
  if (score >= 4) return "good";
  if (score >= 3) return "average";
  if (score >= 2) return "below-average";
  return "poor";
}

function riskStatus(present) {
  return present ? "risk-present" : "risk-clear";
}

function normalizeProductName(productName, text) {
  const explicit = safeText(productName).toLowerCase();
  if (explicit) {
    for (const profile of Object.values(PRODUCT_PROFILES)) {
      if (profile.aliases.some((alias) => explicit.includes(alias))) {
        return profile;
      }
    }
  }

  for (const profile of Object.values(PRODUCT_PROFILES)) {
    const hits = profile.evidenceKeywords.filter((pattern) => pattern.test(text)).length;
    if (hits >= 2) return profile;
  }

  return DEFAULT_PRODUCT_PROFILE;
}

function signalFlags(report, text, productProfile) {
  const questionsCount = Number(report?.questionsCount || 0);
  const qaCount = Array.isArray(report?.qaPairs) ? report.qaPairs.length : 0;
  const productEvidenceCount = productProfile.evidenceKeywords.filter((pattern) => pattern.test(text)).length;

  return {
    questionsCount,
    qaCount,
    hasNextStep: hasAny(text, [/\bnext step\b/i, /\bfollow[- ]?up\b/i, /\bproposal\b/i, /\bschedule\b/i, /\baction plan\b/i]),
    hasTimeline: hasAny(text, [/\btimeline\b/i, /\bdeadline\b/i, /\bnext week\b/i, /\bthis week\b/i, /\bmonth\b/i, /\bquarter\b/i, /\bdate\b/i]),
    hasBudget: hasAny(text, [/\bbudget\b/i, /\bcost\b/i, /\bprice\b/i, /\broi\b/i, /\bcommercial\b/i, /\bprocurement\b/i]),
    hasPain: hasAny(text, [/\bpain\b/i, /\bproblem\b/i, /\bchallenge\b/i, /\bissue\b/i, /\bgap\b/i]),
    hasStakeholder: hasAny(text, [/\bstakeholder\b/i, /\bdecision\b/i, /\bbuyer\b/i, /\bchampion\b/i, /\bprocurement\b/i, /\blegal\b/i]),
    hasCurrentState: hasAny(text, [/\bcurrent\b/i, /\btoday\b/i, /\bexisting\b/i, /\bworkflow\b/i, /\btool\b/i, /\bprocess\b/i, /\binfra\b/i]),
    hasUseCase: hasAny(text, [/\buse case\b/i, /\bscenario\b/i, /\bworkflow\b/i, /\bjourney\b/i, /\bexample\b/i]),
    hasValue: hasAny(text, [/\bvalue\b/i, /\boutcome\b/i, /\bimpact\b/i, /\bbenefit\b/i, /\bsave\b/i, /\breduce\b/i, /\bincrease\b/i]),
    hasAgenda: hasAny(text, [/\bagenda\b/i, /\btoday we\b/i, /\bwe will cover\b/i, /\bwalk through\b/i, /\boverview\b/i]),
    hasIntegration: hasAny(text, [/\bintegration\b/i, /\bapi\b/i, /\bwebhook\b/i, /\bsso\b/i, /\boauth\b/i, /\bsecurity\b/i, /\btechnical\b/i]),
    hasObjection: hasAny(text, [/\bobjection\b/i, /\bconcern\b/i, /\brisk\b/i, /\bhesitation\b/i, /\bblocker\b/i]),
    hasCompetitor: hasAny(text, [/\bcompetitor\b/i, /\balternative\b/i, /\bcompare\b/i, /\bcurrently using\b/i, /\bbrownfield\b/i, /\bgreenfield\b/i]),
    internalSignals: hasAny(text, [/\bteam\b/i, /\bcolleague\b/i, /\bmanager\b/i, /\bleadership\b/i, /\bshare internally\b/i]),
    featureGapSignals: hasAny(text, [/\bmissing feature\b/i, /\bfeature gap\b/i, /\bnot supported\b/i, /\bdoesn'?t have\b/i, /\broadmap\b/i]),
    disengagementSignals: hasAny(text, [/\bnot sure\b/i, /\bmaybe later\b/i, /\boff-topic\b/i, /\bsilence\b/i, /\bshort answer\b/i]),
    unresolvedSignals: hasAny(text, [/\bfollow up later\b/i, /\bneed to check\b/i, /\bunclear\b/i, /\bnot answered\b/i, /\bopen question\b/i]),
    productEvidenceCount,
    productSignalsPresent: productEvidenceCount >= 2
  };
}

function kpiScoring(kpiId, report, flags) {
  const scoreMap = report?.scores || {};
  switch (kpiId) {
    case "pain_identification":
      return clamp((flags.hasPain ? 2 : 0) + (flags.questionsCount >= 3 ? 1 : 0) + (flags.productSignalsPresent ? 1 : 0) + toRatingFrom20(scoreMap.communicationScore, 2), 1, 5);
    case "current_state_mapping":
      return clamp(2 + (flags.hasCurrentState ? 2 : 0) + (flags.productSignalsPresent ? 1 : 0), 1, 5);
    case "stakeholder_mapping":
      return clamp(2 + (flags.hasStakeholder ? 2 : 0) + (flags.internalSignals ? 1 : 0), 1, 5);
    case "competition_identification":
      return clamp(2 + (flags.hasCompetitor ? 2 : 0) + (flags.hasCurrentState ? 1 : 0), 1, 5);
    case "agenda_setting":
      return clamp(2 + (flags.hasAgenda ? 2 : 0) + (toRatingFrom20(scoreMap.structureScore, 3) >= 4 ? 1 : 0), 1, 5);
    case "personalisation":
      return clamp(2 + (safeText(report?.clientName) ? 1 : 0) + (safeText(report?.productName) ? 1 : 0) + (flags.hasUseCase ? 1 : 0), 1, 5);
    case "active_listening":
      return clamp(2 + (flags.questionsCount >= 3 ? 1 : 0) + (flags.qaCount >= 2 ? 1 : 0) + toRatingFrom20(scoreMap.communicationScore, 3) - (flags.disengagementSignals ? 1 : 0), 1, 5);
    case "talk_listen_ratio":
      return clamp(2 + (flags.questionsCount >= 4 ? 2 : flags.questionsCount >= 2 ? 1 : 0) + (flags.qaCount >= 3 ? 1 : 0), 1, 5);
    case "relevance_of_flow":
      return clamp(1 + (flags.hasPain ? 1 : 0) + (flags.hasUseCase ? 1 : 0) + (flags.hasValue ? 1 : 0) + (flags.productSignalsPresent ? 1 : 0) + toRatingFrom20(scoreMap.technicalScore, 3), 1, 5);
    case "story_narrative":
      return clamp(2 + (flags.hasUseCase ? 2 : 0) + (flags.productSignalsPresent ? 1 : 0), 1, 5);
    case "value_articulation":
      return clamp(2 + (flags.hasValue ? 2 : 0) + (flags.hasBudget ? 1 : 0) + toRatingFrom20(scoreMap.communicationScore, 3), 1, 5);
    case "technical_questions":
      return clamp(2 + (flags.qaCount >= 2 ? 1 : 0) + (flags.hasIntegration ? 1 : 0) + (flags.productSignalsPresent ? 1 : 0), 1, 5);
    case "objection_recognition":
      return clamp(2 + (flags.hasObjection ? 2 : 0) + (Array.isArray(report?.cons) && report.cons.length >= 3 ? 1 : 0), 1, 5);
    case "resolution_quality":
      return clamp(2 + (flags.qaCount >= 2 ? 1 : 0) + (Array.isArray(report?.tips) && report.tips.length >= 4 ? 1 : 0) + toRatingFrom20(scoreMap.qaScore, 3), 1, 5);
    case "competitor_handling":
      return clamp(2 + (flags.hasCompetitor ? 2 : 0) + (flags.hasValue ? 1 : 0), 1, 5);
    case "price_roi_discussion":
      return clamp(1 + (flags.hasBudget ? 2 : 0) + (flags.hasValue ? 1 : 0) + hasAny(fullText(report), [/\broi\b/i, /\breturn\b/i]), 1, 5);
    case "questions_asked":
      return clamp(1 + Math.min(4, Math.round(flags.questionsCount / 2)), 1, 5);
    case "use_case_confirmation":
      return clamp(2 + (flags.hasUseCase ? 2 : 0) + (flags.productSignalsPresent ? 1 : 0), 1, 5);
    case "sentiment_tone":
      return sentimentRating(report?.sentiment);
    case "internal_mention":
      return clamp(2 + (flags.internalSignals ? 2 : 0) + (flags.hasStakeholder ? 1 : 0), 1, 5);
    case "clear_next_step":
      return clamp(1 + (flags.hasNextStep ? 3 : 0) + (flags.hasTimeline ? 1 : 0), 1, 5);
    case "timeline_established":
      return clamp(1 + (flags.hasTimeline ? 3 : 0) + (flags.hasNextStep ? 1 : 0), 1, 5);
    case "mutual_action_plan":
      return clamp(1 + (flags.hasNextStep ? 2 : 0) + (flags.hasTimeline ? 1 : 0) + (flags.hasStakeholder ? 1 : 0), 1, 5);
    default:
      return 3;
  }
}

function riskPresent(kpiId, flags) {
  switch (kpiId) {
    case "feature_gaps":
      return flags.featureGapSignals;
    case "budget_concerns":
      return flags.hasBudget;
    case "disengagement":
      return flags.disengagementSignals || flags.questionsCount === 0;
    case "unresolved_objections":
      return flags.unresolvedSignals || (flags.hasObjection && !flags.hasNextStep);
    default:
      return false;
  }
}

function kpiGuidance(kpiId) {
  const map = {
    pain_identification: {
      proper: "Proper: The consultant clearly uncovers the buyer's business pain and why it matters now.",
      improper: "Not proper: The conversation stays generic and the real business problem is never clearly surfaced."
    },
    current_state_mapping: {
      proper: "Proper: The consultant understands the current environment, workflow, tools, and process gaps before pitching.",
      improper: "Not proper: The current state is vague, so the solution is not anchored to the buyer's actual environment."
    },
    stakeholder_mapping: {
      proper: "Proper: Stakeholders, decision-makers, blockers, and champions are identified clearly.",
      improper: "Not proper: The call focuses on one contact and never maps the broader buying group."
    },
    competition_identification: {
      proper: "Proper: The consultant understands whether the account is greenfield or replacing an incumbent and captures competitor context early.",
      improper: "Not proper: Competitive context is ignored, so positioning and risk understanding stay weak."
    },
    agenda_setting: {
      proper: "Proper: The meeting opens with a clear agenda, intent, and alignment on what will be covered.",
      improper: "Not proper: The meeting begins without structure, creating a reactive or rushed tone."
    },
    personalisation: {
      proper: "Proper: The language, use cases, and examples clearly reflect the buyer's account and context.",
      improper: "Not proper: The meeting sounds generic and could have been used for any prospect."
    },
    active_listening: {
      proper: "Proper: The consultant acknowledges inputs, asks follow-up questions, and adapts based on buyer responses.",
      improper: "Not proper: The consultant dominates the conversation and does not reflect or probe what the buyer says."
    },
    talk_listen_ratio: {
      proper: "Proper: The buyer meaningfully participates and the consultant creates space for discovery and dialogue.",
      improper: "Not proper: The consultant talks most of the time and the buyer contributes very little."
    },
    relevance_of_flow: {
      proper: "Proper: The demo flow maps directly to the buyer's pain points and priorities.",
      improper: "Not proper: The demo turns into a feature tour with weak connection to buyer needs."
    },
    story_narrative: {
      proper: "Proper: The consultant uses a business scenario or workflow narrative instead of isolated feature explanation.",
      improper: "Not proper: The demo lacks a buyer story and feels like disconnected product showing."
    },
    value_articulation: {
      proper: "Proper: The consultant explains why the capability matters and what business value it creates.",
      improper: "Not proper: Features are described without connecting them to buyer outcomes."
    },
    technical_questions: {
      proper: "Proper: Technical questions are answered confidently, accurately, and with clear next steps where needed.",
      improper: "Not proper: Technical questions are vague, avoided, or over-promised."
    },
    objection_recognition: {
      proper: "Proper: Concerns are surfaced early, acknowledged respectfully, and treated as valid buying signals.",
      improper: "Not proper: Concerns are ignored, brushed aside, or never explicitly recognized."
    },
    resolution_quality: {
      proper: "Proper: Objections are answered with evidence, logic, examples, or a credible follow-up path.",
      improper: "Not proper: Answers stay shallow and leave the buyer unconvinced."
    },
    competitor_handling: {
      proper: "Proper: Competitive comparisons are handled professionally with clear differentiation tied to buyer priorities.",
      improper: "Not proper: Competitive questions are handled defensively, vaguely, or emotionally."
    },
    price_roi_discussion: {
      proper: "Proper: Cost is framed through value, ROI, or business payoff rather than treated only as a number.",
      improper: "Not proper: Pricing concerns remain unresolved because value is not clearly justified."
    },
    questions_asked: {
      proper: "Proper: The buyer asks meaningful questions that indicate curiosity, evaluation, and intent.",
      improper: "Not proper: There is little or no buyer interaction, suggesting low relevance or weak engagement."
    },
    use_case_confirmation: {
      proper: "Proper: The buyer explicitly connects the product to their own process, workflow, or team use case.",
      improper: "Not proper: The solution never gets tied back to the buyer's real-world environment."
    },
    sentiment_tone: {
      proper: "Proper: The call tone is positive, confident, and moving forward.",
      improper: "Not proper: The call tone is hesitant, guarded, or signals friction."
    },
    internal_mention: {
      proper: "Proper: The buyer references sharing internally or involving additional stakeholders.",
      improper: "Not proper: There is no sign of internal momentum or wider organizational interest."
    },
    clear_next_step: {
      proper: "Proper: The call ends with a concrete next action, clear owner, and timing.",
      improper: "Not proper: The call ends vaguely without a committed follow-up."
    },
    timeline_established: {
      proper: "Proper: Decision timing, evaluation timing, or project timing is clearly discussed.",
      improper: "Not proper: Timing remains vague, reducing urgency and deal control."
    },
    mutual_action_plan: {
      proper: "Proper: Both sides leave the call with agreed responsibilities and aligned next actions.",
      improper: "Not proper: Only one side owns the follow-up or next steps are informal and unclear."
    },
    feature_gaps: {
      proper: "Proper: Any feature gap is identified clearly and handled transparently with mitigation or follow-up.",
      improper: "Not proper: Feature gaps create silent risk because they are not acknowledged or managed."
    },
    budget_concerns: {
      proper: "Proper: Budget risk is surfaced early and managed through value framing or buying-process clarity.",
      improper: "Not proper: Cost hesitation remains unresolved and weakens the deal."
    },
    disengagement: {
      proper: "Proper: The buyer stays responsive, attentive, and involved throughout the call.",
      improper: "Not proper: Silence, drift, or minimal replies show the meeting is losing the buyer."
    },
    unresolved_objections: {
      proper: "Proper: Concerns raised in the call are addressed and closed before the meeting ends.",
      improper: "Not proper: Objections stay open, deferred, or only partially answered."
    }
  };
  return map[kpiId] || {
    proper: "Proper: The KPI is demonstrated clearly with strong transcript evidence.",
    improper: "Not proper: The KPI lacks clear evidence or remains only partially covered."
  };
}

function kpiDiagnostics(kpiId, report, flags, score, present, productProfile) {
  const covered = [];
  const missing = [];

  switch (kpiId) {
    case "pain_identification":
      if (flags.hasPain) covered.push("Pain point or challenge language was detected");
      if (flags.productSignalsPresent) covered.push(`${productProfile.label} use-case language was detected in the transcript`);
      if (!flags.hasPain) missing.push("Core pain point was not clearly surfaced");
      break;
    case "current_state_mapping":
      if (flags.hasCurrentState) covered.push("Current process, tool, or environment references were found");
      if (flags.productSignalsPresent) covered.push(`Current-state discussion included ${productProfile.label} relevant signals`);
      if (!flags.hasCurrentState) missing.push("Current-state workflow was not clearly mapped");
      break;
    case "stakeholder_mapping":
      if (flags.hasStakeholder || flags.internalSignals) covered.push("Stakeholder or internal buying-group signals were present");
      if (!flags.hasStakeholder) missing.push("Decision-maker, champion, or blocker was not clearly identified");
      break;
    case "competition_identification":
      if (flags.hasCompetitor) covered.push("Competitor / brownfield / alternative context was detected");
      if (!flags.hasCompetitor) missing.push("Competitive or replacement context was not clearly covered");
      break;
    case "agenda_setting":
      if (flags.hasAgenda) covered.push("Agenda or structured opening language was visible");
      if (!flags.hasAgenda) missing.push("Clear agenda setup was not visible");
      break;
    case "personalisation":
      if (safeText(report?.clientName)) covered.push("Client-specific account context was identified");
      if (!safeText(report?.clientName)) missing.push("Buyer context remained generic");
      break;
    case "active_listening":
      if (flags.questionsCount >= 3 || flags.qaCount >= 2) covered.push("Two-way dialogue signals were present");
      if (flags.questionsCount < 3) missing.push("Follow-up questioning depth looked limited");
      break;
    case "talk_listen_ratio":
      if (flags.questionsCount >= 2) covered.push("Buyer participation suggests some airtime balance");
      if (flags.questionsCount < 2) missing.push("Buyer participation evidence was limited");
      break;
    case "relevance_of_flow":
      if (flags.hasPain || flags.hasUseCase) covered.push("Demo content appears linked to buyer pain or workflow");
      if (flags.productSignalsPresent) covered.push(`${productProfile.label} specific proof points were discussed`);
      if (!flags.hasPain && !flags.hasUseCase) missing.push("Feature-to-pain mapping was not explicit enough");
      if (!flags.productSignalsPresent) missing.push(`${productProfile.label} specific use cases were not strongly visible`);
      break;
    case "story_narrative":
      if (flags.hasUseCase) covered.push("Scenario or workflow narrative was present");
      if (!flags.hasUseCase) missing.push("Demo looked more feature-led than story-led");
      break;
    case "value_articulation":
      if (flags.hasValue) covered.push("Business value or impact language was present");
      if (!flags.hasValue) missing.push("Why this matters to the buyer was not clearly articulated");
      break;
    case "technical_questions":
      if (flags.qaCount >= 2 || flags.hasIntegration) covered.push("Technical clarification signals were present");
      if (flags.productSignalsPresent) covered.push(`Technical discussion included ${productProfile.label} relevant concepts`);
      if (flags.qaCount < 2 && !flags.hasIntegration) missing.push("Technical-answer evidence was limited");
      break;
    case "objection_recognition":
      if (flags.hasObjection) covered.push("Concerns or objections were explicitly surfaced");
      if (!flags.hasObjection) missing.push("Objections were not clearly acknowledged");
      break;
    case "resolution_quality":
      if (flags.qaCount >= 2) covered.push("Q&A flow provided evidence of objection handling");
      if (flags.qaCount < 2) missing.push("Evidence-led objection resolution was not strongly visible");
      break;
    case "competitor_handling":
      if (flags.hasCompetitor) covered.push("Competitor or alternative references were present");
      if (!flags.hasCompetitor) missing.push("No competitor-handling evidence was found");
      break;
    case "price_roi_discussion":
      if (flags.hasBudget) covered.push("Commercial or ROI discussion was present");
      if (!flags.hasBudget) missing.push("Price / ROI discussion was limited or deferred");
      break;
    case "questions_asked":
      if (flags.questionsCount > 0) covered.push(`${flags.questionsCount} buyer question(s) were detected`);
      if (flags.questionsCount === 0) missing.push("No explicit buyer questions were detected");
      break;
    case "use_case_confirmation":
      if (flags.hasUseCase) covered.push("Buyer connected the product to a use case or workflow");
      if (flags.productSignalsPresent) covered.push(`The transcript showed ${productProfile.label} specific alignment`);
      if (!flags.hasUseCase) missing.push("Prospect did not clearly connect the product to their own work");
      break;
    case "sentiment_tone":
      covered.push(`Overall tone was assessed as ${sentimentLabel(report?.sentiment).toLowerCase()}`);
      if (report?.sentiment !== "positive") missing.push("Stronger positive commitment signals were not consistently visible");
      break;
    case "internal_mention":
      if (flags.internalSignals) covered.push("Internal sharing or colleague involvement was referenced");
      if (!flags.internalSignals) missing.push("No clear internal-sharing or wider-team signal was found");
      break;
    case "clear_next_step":
      if (flags.hasNextStep) covered.push("A specific next-step signal was present");
      if (!flags.hasNextStep) missing.push("No clear owner / action / next-step commitment was visible");
      break;
    case "timeline_established":
      if (flags.hasTimeline) covered.push("Timeline or date references were present");
      if (!flags.hasTimeline) missing.push("Decision or evaluation timeline was not clearly established");
      break;
    case "mutual_action_plan":
      if (flags.hasNextStep && flags.hasTimeline) covered.push("Forward plan had action and timing");
      if (!(flags.hasNextStep && flags.hasTimeline)) missing.push("A clear mutual action plan was not visible");
      break;
    case "feature_gaps":
      if (present) covered.push("Feature-gap or blocker language was detected");
      else covered.push("No explicit feature-gap blocker was detected");
      break;
    case "budget_concerns":
      if (present) covered.push("Budget or pricing sensitivity was visible");
      else covered.push("No strong budget-risk language was detected");
      break;
    case "disengagement":
      if (present) covered.push("Engagement risk indicators were present");
      else covered.push("No strong disengagement pattern was detected");
      break;
    case "unresolved_objections":
      if (present) covered.push("Some concerns appear deferred or unresolved");
      else covered.push("No strong unresolved-objection signal was found");
      break;
    default:
      break;
  }

  if (!covered.length && score >= 4) covered.push("Transcript evidence for this KPI was reasonably strong");
  if (!missing.length && !present && score <= 3) missing.push("Some expected evidence for this KPI was limited or not clearly covered");

  return {
    covered: unique(covered),
    missing: unique(missing)
  };
}

function mergeKpiProfile(kpi, productProfile) {
  const override = productProfile.kpiOverrides?.[kpi.id] || {};
  const guidance = kpiGuidance(kpi.id);
  return {
    ...kpi,
    detail: override.detail || kpi.detail,
    questionnaire: override.questionnaire || [],
    proper: override.proper || guidance.proper,
    improper: override.improper || guidance.improper
  };
}

function buildDimensionCopy(dimension, productProfile) {
  if (dimension.id === "demo") {
    return {
      ...dimension,
      description: `${dimension.description} For ${productProfile.label}, the flow should reflect the product's real operating use cases.`
    };
  }
  if (dimension.id === "discovery") {
    return {
      ...dimension,
      description: `${dimension.description} Discovery should surface ${productProfile.family} specific pain, process context, and decision triggers.`
    };
  }
  return dimension;
}

export function buildDemoKpiAssessment(report) {
  const text = fullText(report);
  const productProfile = normalizeProductName(report?.productName, text);
  const flags = signalFlags(report, text, productProfile);
  let rawScore = 0;
  let weightedScore = 0;
  let weightedMax = 0;

  const dimensions = KPI_DIMENSIONS.map((baseDimension) => {
    const dimension = buildDimensionCopy(baseDimension, productProfile);
    const kpis = dimension.kpis.map((rawKpi) => {
      const kpi = mergeKpiProfile(rawKpi, productProfile);

      if (dimension.risk) {
        const present = riskPresent(kpi.id, flags);
        return {
          ...kpi,
          present,
          score: present ? 1 : 0,
          guide: null,
          rationale: present ? "Risk signal detected from transcript and analysis evidence." : "No strong risk signal detected for this area.",
          weightedScore: 0,
          status: riskStatus(present),
          ...kpiDiagnostics(kpi.id, report, flags, present ? 1 : 0, present, productProfile)
        };
      }

      const score = kpiScoring(kpi.id, report, flags);
      const itemWeightedScore = score * kpi.priority;
      rawScore += score;
      weightedScore += itemWeightedScore;
      weightedMax += kpi.priority * 5;

      return {
        ...kpi,
        present: false,
        score,
        guide: SCORE_GUIDE[score] || null,
        rationale: `${(SCORE_GUIDE[score] || SCORE_GUIDE[3]).definition}. ${(SCORE_GUIDE[score] || SCORE_GUIDE[3]).signal}.`,
        weightedScore: itemWeightedScore,
        status: scoreStatus(score),
        ...kpiDiagnostics(kpi.id, report, flags, score, false, productProfile)
      };
    });

    return {
      ...dimension,
      averageScore: dimension.risk
        ? 0
        : Number((kpis.reduce((sum, item) => sum + item.score, 0) / Math.max(1, kpis.length)).toFixed(1)),
      weightedScore: dimension.risk ? 0 : kpis.reduce((sum, item) => sum + item.weightedScore, 0),
      weightedMax: dimension.risk ? 0 : kpis.reduce((sum, item) => sum + item.priority * 5, 0),
      riskPresentCount: dimension.risk ? kpis.filter((item) => item.present).length : 0,
      status: dimension.risk
        ? (kpis.some((item) => item.present) ? "risk-present" : "risk-clear")
        : scoreStatus(Math.round(kpis.reduce((sum, item) => sum + item.score, 0) / Math.max(1, kpis.length))),
      kpis
    };
  });

  const riskDimension = dimensions.find((item) => item.risk);
  const riskCount = riskDimension?.riskPresentCount || 0;
  const riskDeductionPoints = riskCount * RISK_DEDUCTION_PER_FLAG;
  const weightedPerformance = weightedMax ? Number(((weightedScore / weightedMax) * 100).toFixed(1)) : 0;
  const finalScore = clamp(Number((weightedPerformance - riskDeductionPoints).toFixed(1)), 0, 100);

  return {
    productProfile,
    productSummary: {
      title: `${productProfile.label} KPI Lens`,
      family: productProfile.family,
      summary: productProfile.summary,
      executiveLens: productProfile.executiveLens,
      discoveryQuestions: productProfile.discoveryQuestions,
      demoProofPoints: productProfile.demoProofPoints,
      successSignals: productProfile.successSignals
    },
    dimensions,
    rawScore,
    rawMax: KPI_DIMENSIONS.filter((item) => !item.risk).reduce((sum, item) => sum + item.kpis.length * 5, 0),
    weightedScore,
    weightedMax,
    weightedPerformance,
    riskDeductionPoints,
    finalScore,
    positiveDimensionCount: dimensions.filter((item) => !item.risk).length,
    totalKpis: KPI_DIMENSIONS.reduce((sum, item) => sum + item.kpis.length, 0),
    scoredKpis: KPI_DIMENSIONS.filter((item) => !item.risk).reduce((sum, item) => sum + item.kpis.length, 0),
    riskCount
  };
}
