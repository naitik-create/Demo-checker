import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { buildDemoKpiAssessment } from "./demoKpiFramework.js";

function safeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function lineItems(value) {
  if (Array.isArray(value)) return value.map(i => safeText(i)).filter(Boolean);
  return String(value || "").split(/\r?\n/).map(i => i.replace(/^\s*[-*]\s*/, "").trim()).filter(Boolean);
}

function addSectionTitle(doc, title, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  doc.text(title, 40, y);
  return y + 14;
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
  const kpiAssessment = buildDemoKpiAssessment(report);
  let y = 40;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(37, 99, 235);
  doc.text("Presales Demo Evaluation Report", 40, y);
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(`Framework: Authoritative 7-Dimension, 23-KPI Scoring · Generated: ${new Date().toLocaleString("en-IN")}`, 40, y);
  y += 28;

  // Meeting & Consultant Metadata
  y = addSectionTitle(doc, "Evaluation Context", y);
  autoTable(doc, {
    startY: y, theme: "grid", margin: { left: 40, right: 40 },
    body: [
      ["Meeting Title", safeText(meeting.title), "Consultant", safeText(consultant.name)],
      ["Client Name", safeText(report?.clientName), "Product", safeText(report?.productName)],
      ["Start Time", meeting.startTime ? new Date(meeting.startTime).toLocaleString("en-IN") : "-", "Verdict", kpiAssessment.verdict]
    ],
    styles: { fontSize: 9, cellPadding: 5 }
  });
  y = doc.lastAutoTable.finalY + 24;

  // Final Scoring Summary
  y = addSectionTitle(doc, "Executive Scoring Summary", y);
  autoTable(doc, {
    startY: y, theme: "grid", margin: { left: 40, right: 40 },
    head: [["Performance Metric", "Value", "Notes"]],
    body: [
      ["Final KPI Score", `${kpiAssessment.finalScore}/100`, "Normalized result (0-100%)"],
      ["Weighted Performance", `${kpiAssessment.weightedScore}/${kpiAssessment.weightedMax}`, "Total weighted points from all KPIs"],
      ["Risk Deductions", `-${kpiAssessment.riskDeductionPoints}`, `${kpiAssessment.riskCount} flag(s) identified @ -5 each`],
      ["Adjusted Total Points", String(kpiAssessment.adjustedScore), "Points after risk deduction"]
    ],
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 }
  });
  y = doc.lastAutoTable.finalY + 24;

  // Dimension Breakdown Table
  y = ensureSpace(doc, y, 150);
  y = addSectionTitle(doc, "Dimension-wise Breakdown", y);
  const scoredDimensions = kpiAssessment.dimensions.filter(d => !d.risk);
  const breakdownRows = [];
  scoredDimensions.forEach(dim => {
    dim.kpis.forEach((kpi, idx) => {
      breakdownRows.push([
        idx === 0 ? dim.label : "",
        kpi.label,
        String(kpi.weight),
        String(kpi.score),
        String(kpi.weightedScore),
        kpi.reason
      ]);
    });
  });

  autoTable(doc, {
    startY: y, theme: "striped", margin: { left: 40, right: 40 },
    head: [["Dimension", "KPI", "Weight", "Score", "Weighted", "Reason"]],
    body: breakdownRows,
    headStyles: { fillColor: [107, 114, 128], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    columnStyles: { 0: { fontStyle: "bold" }, 5: { cellWidth: 180 } }
  });
  y = doc.lastAutoTable.finalY + 24;

  // Risk Flags Table
  y = ensureSpace(doc, y, 120);
  y = addSectionTitle(doc, "Risk Flags Detected", y);
  const riskDimension = kpiAssessment.dimensions.find(d => d.risk);
  autoTable(doc, {
    startY: y, theme: "grid", margin: { left: 40, right: 40 },
    head: [["Risk Indicator", "Present", "Deduction", "Evidence Quote"]],
    body: riskDimension?.kpis.map(k => [
      k.label,
      k.present ? "TRUE" : "FALSE",
      k.present ? "-5" : "0",
      k.evidence
    ]),
    headStyles: { fillColor: [185, 28, 28], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    columnStyles: { 3: { cellWidth: 250 } }
  });
  y = doc.lastAutoTable.finalY + 24;

  // AI Summary & Detailed Analysis
  y = ensureSpace(doc, y, 100);
  y = addSectionTitle(doc, "Call Summary", y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const summaryLines = doc.splitTextToSize(safeText(report?.summary, "No summary available."), 515);
  doc.text(summaryLines, 40, y);
  y += summaryLines.length * 12 + 18;

  y = ensureSpace(doc, y, 120);
  y = addSectionTitle(doc, "Product Guidance", y);
  autoTable(doc, {
    startY: y, theme: "grid", margin: { left: 40, right: 40 },
    body: [
      ["Success Signals", kpiAssessment.productSummary.successSignals.join("\n")],
      ["Discovery Prompts", kpiAssessment.productSummary.discoveryQuestions.join("\n")]
    ],
    styles: { fontSize: 8.5, cellPadding: 5 }
  });
  y = doc.lastAutoTable.finalY + 24;

  // Final Transcript
  y = ensureSpace(doc, y, 100);
  y = addSectionTitle(doc, "Full Transcript", y);
  doc.setFontSize(8);
  const transcriptLines = doc.splitTextToSize(safeText(report?.transcript?.transcriptText, "Transcript not available."), 515);
  doc.text(transcriptLines, 40, y);

  const fileTitle = safeText(meeting.title, "demo-evaluation").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  doc.save(`${fileTitle}.pdf`);
}
