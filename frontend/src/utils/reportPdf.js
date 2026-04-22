import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { buildDemoKpiAssessment } from "./demoKpiFramework.js";

function safeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function lineItems(value) {
  if (Array.isArray(value)) {
    return value.map((item) => safeText(item)).filter(Boolean);
  }
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function sentimentLabel(sentiment) {
  const value = String(sentiment || "").toLowerCase();
  if (value === "positive") return "Positive";
  if (value === "negative") return "Negative";
  return "Neutral";
}

function addSectionTitle(doc, title, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, 40, y);
  return y + 12;
}

function addWrappedText(doc, text, y, opts = {}) {
  const {
    maxWidth = 515,
    fontSize = 10,
    lineHeight = 14,
    fallback = "-"
  } = opts;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(safeText(text, fallback), maxWidth);
  doc.text(lines, 40, y);
  return y + lines.length * lineHeight;
}

function ensureSpace(doc, y, neededHeight = 40) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + neededHeight <= pageHeight - 40) return y;
  doc.addPage();
  return 40;
}

export function downloadMeetingReportPdf(report) {
  const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const meeting = report?.meeting || {};
  const consultant = report?.consultant || {};
  const scores = report?.scores || {};
  const kpiAssessment = buildDemoKpiAssessment(report);
  let y = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Demo Analysis Report", 40, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated on ${new Date().toLocaleString("en-IN")}`, 40, y);
  y += 22;

  y = addSectionTitle(doc, "Meeting Details", y);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    margin: { left: 40, right: 40 },
    head: [["Field", "Value"]],
    body: [
      ["Title", safeText(meeting.title)],
      ["Start", meeting.startTime ? new Date(meeting.startTime).toLocaleString("en-IN") : "-"],
      ["End", meeting.endTime ? new Date(meeting.endTime).toLocaleString("en-IN") : "-"],
      ["Status", safeText(meeting.status)],
      ["Consultant", safeText(consultant.name)],
      ["Consultant Email", safeText(consultant.email)],
      ["Client", safeText(report?.clientName)],
      ["Product", safeText(report?.productName)]
    ],
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 10 },
    styles: { fontSize: 10, cellPadding: 5 }
  });
  y = doc.lastAutoTable.finalY + 18;

  y = ensureSpace(doc, y, 180);
  y = addSectionTitle(doc, `${kpiAssessment.productSummary.title}`, y);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    margin: { left: 40, right: 40 },
    head: [["Area", "Details"]],
    body: [
      ["Product family", safeText(kpiAssessment.productSummary.family)],
      ["Manager lens", kpiAssessment.productSummary.executiveLens.join("\n")],
      ["Discovery questions", kpiAssessment.productSummary.discoveryQuestions.join("\n")],
      ["Expected proof points", kpiAssessment.productSummary.demoProofPoints.join("\n")],
      ["Success signals", kpiAssessment.productSummary.successSignals.join("\n")]
    ],
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 10 },
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 395 }
    }
  });
  y = doc.lastAutoTable.finalY + 18;

  y = ensureSpace(doc, y, 180);
  y = addSectionTitle(doc, "Demo & Discovery KPI Framework", y);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    margin: { left: 40, right: 40 },
    head: [["Metric", "Value"]],
    body: [
      ["Dimensions", "7"],
      ["Scored KPIs", String(kpiAssessment.scoredKpis)],
      ["Risk Checks", String(kpiAssessment.totalKpis - kpiAssessment.scoredKpis)],
      ["Raw KPI Score", `${kpiAssessment.rawScore}/${kpiAssessment.rawMax}`],
      ["Weighted Performance", `${kpiAssessment.weightedPerformance}/100 (${kpiAssessment.weightedScore}/${kpiAssessment.weightedMax})`],
      ["Risk Deduction", `-${kpiAssessment.riskDeductionPoints} (${kpiAssessment.riskCount} flag(s) x 5)`],
      ["Executive KPI Rating", `${kpiAssessment.finalScore}/100`],
      ["Active Risk Flags", String(kpiAssessment.riskCount)]
    ],
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 10 },
    styles: { fontSize: 10, cellPadding: 5 }
  });
  y = doc.lastAutoTable.finalY + 18;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    margin: { left: 40, right: 40 },
    head: [["Dimension", "Theme", "Average", "Weighted Result"]],
    body: kpiAssessment.dimensions.map((dimension) => [
      dimension.label,
      dimension.subtitle,
      dimension.risk ? `${dimension.riskPresentCount} flag(s)` : `${dimension.averageScore}/5`,
      dimension.risk ? `${dimension.riskPresentCount}/${dimension.kpis.length} triggered` : `${dimension.weightedScore}/${dimension.weightedMax}`
    ]),
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 10 },
    styles: { fontSize: 9, cellPadding: 5 }
  });
  y = doc.lastAutoTable.finalY + 18;

  y = ensureSpace(doc, y, 140);
  y = addSectionTitle(doc, "KPI Scores", y);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    margin: { left: 40, right: 40 },
    head: [["Metric", "Score"]],
    body: [
      ["Communication", scores.communicationScore ?? "-"],
      ["Engagement", scores.engagementScore ?? "-"],
      ["Structure", scores.structureScore ?? "-"],
      ["Technical", scores.technicalScore ?? "-"],
      ["Q&A", scores.qaScore ?? "-"],
      ["Total", scores.totalScore ?? "-"],
      ["Sentiment", sentimentLabel(report?.sentiment)],
      ["Questions Count", report?.questionsCount ?? 0]
    ],
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 10 },
    styles: { fontSize: 10, cellPadding: 5 }
  });
  y = doc.lastAutoTable.finalY + 18;

  for (const dimension of kpiAssessment.dimensions) {
    y = ensureSpace(doc, y, 180);
    y = addSectionTitle(doc, `${dimension.label} KPI Detail`, y);
    autoTable(doc, {
      startY: y,
      theme: "grid",
      margin: { left: 40, right: 40 },
      head: [["KPI", "Priority", "Score", "Why This Score", "Proper vs Not Proper", "Not Covered / Gap"]],
      body: dimension.kpis.map((kpi) => [
        `${kpi.label}\n${kpi.detail}`,
        `x${kpi.priority}`,
        dimension.risk ? (kpi.present ? "Present" : "Clear") : `${kpi.score}/5`,
        [
          safeText(kpi.rationale),
          kpi.guide ? `${kpi.guide.label}: ${kpi.guide.definition}` : "",
          kpi.guide ? `Signal: ${kpi.guide.signal}` : "",
          kpi.guide ? `Action: ${kpi.guide.action}` : "",
          ...(Array.isArray(kpi.covered) ? kpi.covered.map((item) => `Covered: ${item}`) : [])
        ].filter(Boolean).join("\n"),
        [
          safeText(kpi.proper),
          "",
          safeText(kpi.improper),
          ...(Array.isArray(kpi.questionnaire) ? kpi.questionnaire.map((item) => `Manager check: ${item}`) : [])
        ].filter(Boolean).join("\n"),
        Array.isArray(kpi.missing) && kpi.missing.length
          ? kpi.missing.map((item) => `Gap: ${item}`).join("\n")
          : "No major gap flagged"
      ]),
      headStyles: {
        fillColor: dimension.risk ? [153, 27, 27] : [15, 118, 110],
        textColor: 255,
        fontSize: 9
      },
      styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 95 },
        1: { cellWidth: 42 },
        2: { cellWidth: 42 },
        3: { cellWidth: 110 },
        4: { cellWidth: 120 },
        5: { cellWidth: 126 }
      }
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  y = ensureSpace(doc, y, 90);
  y = addSectionTitle(doc, "Summary", y);
  y = addWrappedText(doc, report?.summary, y, { fallback: "No summary available." }) + 8;

  const listSections = [
    ["Pros", report?.pros, "No pros captured."],
    ["Cons", report?.cons, "No cons captured."],
    ["Actionable Tips", report?.tips, "No tips captured."],
    ["Questions Detected", report?.questionsDetected, "No explicit questions captured."]
  ];

  for (const [title, values, fallback] of listSections) {
    y = ensureSpace(doc, y, 90);
    y = addSectionTitle(doc, title, y);
    const items = lineItems(values);
    if (!items.length) {
      y = addWrappedText(doc, fallback, y) + 8;
      continue;
    }
    autoTable(doc, {
      startY: y,
      theme: "grid",
      margin: { left: 40, right: 40 },
      body: items.map((item) => [item]),
      styles: { fontSize: 10, cellPadding: 5 },
      columnStyles: { 0: { cellWidth: 515 } }
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  y = ensureSpace(doc, y, 80);
  y = addSectionTitle(doc, "Demo Quality Evaluation", y);
  y = addWrappedText(doc, report?.demoQualityEvaluation, y, { fallback: "No evaluation available." }) + 8;

  const qaPairs = Array.isArray(report?.qaPairs) ? report.qaPairs.filter((pair) => pair?.question || pair?.answer || pair?.tip) : [];
  if (qaPairs.length) {
    y = ensureSpace(doc, y, 120);
    y = addSectionTitle(doc, "Client Q&A", y);
    autoTable(doc, {
      startY: y,
      theme: "grid",
      margin: { left: 40, right: 40 },
      head: [["Question", "Answer", "Tip"]],
      body: qaPairs.map((pair) => [
        safeText(pair.question),
        safeText(pair.answer),
        safeText(pair.tip)
      ]),
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 10 },
      styles: { fontSize: 9, cellPadding: 5 }
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  y = ensureSpace(doc, y, 100);
  y = addSectionTitle(doc, "Transcript", y);
  addWrappedText(doc, report?.transcript?.transcriptText, y, {
    fallback: "Transcript is not available for this report.",
    lineHeight: 12
  });

  const fileTitle = safeText(meeting.title, "demo-analysis-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "demo-analysis-report";

  doc.save(`${fileTitle}.pdf`);
}
