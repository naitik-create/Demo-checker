import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { apiFetch } from "../api/client.js";

function thS(width, align) {
  return { padding: "10px 16px", textAlign: align, fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", width: width !== "auto" ? width : undefined, whiteSpace: "nowrap" };
}
function tdS(align) {
  return { padding: "13px 16px", textAlign: align, verticalAlign: "middle" };
}

function toDateStrUTC(d) {
  // Expect/produce YYYY-MM-DD in UTC (for consistent server filtering).
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().split("T")[0];
}

function sentimentLabel(s) {
  if (!s) return "—";
  if (s === "positive") return "Positive";
  if (s === "negative") return "Negative";
  return "Neutral";
}

function scoreColor(sc) {
  if (sc >= 80) return "var(--green)";
  if (sc >= 60) return "var(--accent)";
  if (sc >= 40) return "var(--orange)";
  return "#f87171";
}

function ScoreRing({ score, size = 88 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score || 0));
  const offset = circ - (pct / 100) * circ;
  const color = scoreColor(score || 0);
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle className="score-ring__bg" cx={size / 2} cy={size / 2} r={r} />
        <circle className="score-ring__fg" cx={size / 2} cy={size / 2} r={r} stroke={color} strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="score-ring__text" style={{ color }}>
        {Math.round(score || 0)}
        <div className="score-ring__label">/ 100</div>
      </div>
    </div>
  );
}

function StatBar({ label, value, color = "blue", max = 10 }) {
  const safe = typeof value === "number" ? value : 0;
  const pct = Math.round((safe / max) * 100);
  return (
    <div className="stat-bar">
      <div className="stat-bar__top">
        <span className="stat-bar__label">{label}</span>
        <span className="stat-bar__value">{safe}/{max}</span>
      </div>
      <div className="stat-bar__track">
        <div className={`stat-bar__fill stat-bar__fill--${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function PresalesCompleteReportPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateStrUTC(d);
  });
  const [to, setTo] = useState(() => toDateStrUTC(new Date()));

  const [state, setState] = useState({ loading: false, error: "", report: null });
  const [selectedConsultantId, setSelectedConsultantId] = useState("");

  const department = state.report?.department || null;
  const consultants = state.report?.consultants || [];
  const selectedConsultant = useMemo(
    () => consultants.find((c) => (c.consultant?.id || "") === selectedConsultantId) || null,
    [consultants, selectedConsultantId]
  );
  const departmentWidget = useMemo(() => {
    let total = 0;
    let sumDisc = 0, sumRapp = 0, sumDemo = 0, sumObj = 0, sumEng = 0, sumClose = 0;
    const sentiments = { positive: 0, neutral: 0, negative: 0 };
    for (const c of consultants) {
      const n = c.totalDemos || 0;
      if (!n) continue;
      total += n;
      const d = c.dimensionAverages || {};
      if (typeof d.discoveryScore === "number") sumDisc += d.discoveryScore * n;
      if (typeof d.rapportScore === "number") sumRapp += d.rapportScore * n;
      if (typeof d.demoScore === "number") sumDemo += d.demoScore * n;
      if (typeof d.objectionsScore === "number") sumObj += d.objectionsScore * n;
      if (typeof d.engagementScore === "number") sumEng += d.engagementScore * n;
      if (typeof d.closeScore === "number") sumClose += d.closeScore * n;
      const sc = c.sentimentCounts || {};
      sentiments.positive += sc.positive || 0;
      sentiments.neutral += sc.neutral || 0;
      sentiments.negative += sc.negative || 0;
    }
    const avg = (sum, max) => (total ? Number(((sum / total) / (max / 10)).toFixed(1)) : null);
    
    return { 
      discovery: avg(sumDisc, 75),
      rapport: avg(sumRapp, 70),
      demo: avg(sumDemo, 85),
      objections: avg(sumObj, 70),
      engagement: avg(sumEng, 80),
      close: avg(sumClose, 65),
      sentimentScore: (sentiments.positive + sentiments.neutral + sentiments.negative) > 0
        ? Number(((sentiments.positive * 10 + sentiments.neutral * 7 + sentiments.negative * 4) / (sentiments.positive + sentiments.neutral + sentiments.negative)).toFixed(1))
        : null, 
      sentiments 
    };
  }, [consultants]);

  const deptAvgScore10 = useMemo(() => {
    if (!department?.averageScore && department?.averageScore !== 0) return null;
    return Number((department.averageScore / 10).toFixed(1));
  }, [department?.averageScore]);

  async function downloadPdf() {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const reportRes = await apiFetch(
        `/api/presales-reports/complete?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { auth: true }
      );
      const report = reportRes;

      const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });

      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 40;

      // Header
      doc.setFontSize(16);
      doc.text("Presales Complete Report", 40, y);
      y += 18;
      doc.setFontSize(10);
      doc.text(`Window: ${from} to ${to}`, 40, y);
      y += 14;

      doc.setFontSize(11);
      doc.text(
        `Department Total Demos: ${department?.totalDemos ?? report?.department?.totalDemos ?? 0}`,
        40,
        y
      );
      y += 14;
      doc.text(
        `Department Avg Score: ${report?.department?.averageScore ?? "—"} / 100 ${
          report?.department?.averageScore != null
            ? `(${Number((report.department.averageScore / 10).toFixed(1))} / 10)`
            : ""
        }`,
        40,
        y
      );
      y += 18;

      // Department sentiment counts
      if (report?.department?.sentimentCounts) {
        const sc = report.department.sentimentCounts;
        doc.setFontSize(10);
        doc.text(
          `Sentiment: Positive ${sc.positive ?? 0} | Neutral ${sc.neutral ?? 0} | Negative ${sc.negative ?? 0}`,
          40,
          y
        );
        y += 18;
      }

      // Separator line
      doc.setDrawColor(220);
      doc.line(40, y, pageWidth - 40, y);
      y += 18;

      const consultantsSorted = [...(report?.consultants || [])].sort((a, b) => {
        const aa = a?.averageScore ?? -1;
        const bb = b?.averageScore ?? -1;
        return bb - aa;
      });

      for (let i = 0; i < consultantsSorted.length; i++) {
        const c = consultantsSorted[i];
        const name = c?.consultant?.name || "Consultant";
        const email = c?.consultant?.email ? ` (${c.consultant.email})` : "";
        const avg = c?.averageScore;
        const avg10 = avg != null ? Number((avg / 10).toFixed(1)) : null;

        doc.setFontSize(12);
        doc.text(`${name}${email}`, 40, y);
        y += 14;
        doc.setFontSize(10);
        doc.text(
          `Total Demos: ${c?.totalDemos ?? 0} | Avg Score: ${avg ?? "—"} / 100 ${
            avg10 != null ? `(${avg10} / 10)` : ""
          }`,
          40,
          y
        );
        y += 12;

        const rows = (c?.demos || []).map((d) => [
          d.title || "—",
          d.startTime ? new Date(d.startTime).toLocaleDateString("en-GB") : "—",
          typeof d.totalScore === "number" ? String(d.totalScore) : "—",
          sentimentLabel(d.sentiment)
        ]);

        autoTable(doc, {
          startY: y,
          head: [["Demo", "Date", "Score", "Sentiment"]],
          body: rows,
          theme: "grid",
          headStyles: { fillColor: [82, 56, 236], textColor: 255, fontSize: 9 },
          styles: { fontSize: 9, cellPadding: 4 },
          columnStyles: {
            0: { cellWidth: 220 },
            1: { cellWidth: 70 },
            2: { cellWidth: 60 },
            3: { cellWidth: 90 }
          },
          margin: { left: 40, right: 40 }
        });

        y = doc.lastAutoTable.finalY + 18;

        if (y > doc.internal.pageSize.getHeight() - 60) {
          doc.addPage();
          y = 40;
        }

        if (i < consultantsSorted.length - 1) {
          doc.setDrawColor(230);
          doc.line(40, y - 8, pageWidth - 40, y - 8);
          y += 6;
        }
      }

      const fileName = `presales-complete-report_${from}_to_${to}.pdf`;
      doc.save(fileName);
      setState((s) => ({ ...s, loading: false, report }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || "Failed to generate PDF" }));
    }
  }

  async function downloadConsultantPdf() {
    if (!selectedConsultantId) return;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const report = await apiFetch(
        `/api/presales-reports/complete?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&consultantId=${encodeURIComponent(selectedConsultantId)}`,
        { auth: true }
      );
      const c = (report.consultants || [])[0];
      if (!c) throw new Error("No consultant report data found for this range.");

      const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
      let y = 40;
      doc.setFontSize(18);
      doc.text("Consultant Performance Report", 40, y);
      y += 18;
      doc.setFontSize(11);
      doc.text(`${c.consultant?.name || "Consultant"} (${c.consultant?.email || "—"})`, 40, y);
      y += 14;
      doc.text(`Window: ${from} to ${to}`, 40, y);
      y += 18;

      const avg10 = c.averageScore != null ? Number((c.averageScore / 10).toFixed(1)) : null;
      doc.text(`Total demos: ${c.totalDemos ?? 0}`, 40, y);
      y += 14;
      doc.text(`Overall score: ${c.averageScore ?? "—"} / 100 ${avg10 != null ? `(${avg10} / 10)` : ""}`, 40, y);
      y += 20;

      const dims = c.dimensionAverages || {};
      autoTable(doc, {
        startY: y,
        head: [["Dimension", "Value (/10)"]],
        body: [
          ["Discovery", dims.discoveryScore != null ? Number((dims.discoveryScore / 7.5).toFixed(1)) : "—"],
          ["Rapport", dims.rapportScore != null ? Number((dims.rapportScore / 7).toFixed(1)) : "—"],
          ["Demo Delivery", dims.demoScore != null ? Number((dims.demoScore / 8.5).toFixed(1)) : "—"],
          ["Objections", dims.objectionsScore != null ? Number((dims.objectionsScore / 7).toFixed(1)) : "—"],
          ["Engagement", dims.engagementScore != null ? Number((dims.engagementScore / 8).toFixed(1)) : "—"],
          ["Closing", dims.closeScore != null ? Number((dims.closeScore / 6.5).toFixed(1)) : "—"],
          ["Customer Sentiment", c.sentimentCounts ? ((c.sentimentCounts.positive * 10 + c.sentimentCounts.neutral * 7 + c.sentimentCounts.negative * 4) / Math.max(1, c.sentimentCounts.positive + c.sentimentCounts.neutral + c.sentimentCounts.negative)).toFixed(1) : "—"]
        ],
        theme: "grid",
        headStyles: { fillColor: [82, 56, 236], textColor: 255, fontSize: 10 },
        styles: { fontSize: 10, cellPadding: 5 },
        margin: { left: 40, right: 40 }
      });

      y = doc.lastAutoTable.finalY + 18;
      autoTable(doc, {
        startY: y,
        head: [["Demo", "Date", "Client", "Disc", "Rapp", "Demo", "Obj", "Eng", "Close", "Total"]],
        body: (c.demos || []).map((d) => [
          d.title || "—",
          d.startTime ? new Date(d.startTime).toLocaleDateString("en-GB") : "—",
          d.clientName || "—",
          d.discoveryScore ?? "—",
          d.rapportScore ?? "—",
          d.demoScore ?? "—",
          d.objectionsScore ?? "—",
          d.engagementScore ?? "—",
          d.closeScore ?? "—",
          typeof d.totalScore === "number" ? String(d.totalScore) : "—"
        ]),
        theme: "grid",
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 4 },
        margin: { left: 40, right: 40 }
      });

      doc.save(`consultant-report_${(c.consultant?.name || "consultant").replace(/\s+/g, "-")}_${from}_to_${to}.pdf`);
      setState((s) => ({ ...s, loading: false, report }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || "Failed to generate consultant report PDF" }));
    }
  }

  useEffect(() => {
    // Load a preview table (optional) so user sees KPI immediately.
    let alive = true;
    async function loadPreview() {
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const report = await apiFetch(
          `/api/presales-reports/complete?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { auth: true }
        );
        if (!alive) return;
        setState((s) => ({ ...s, loading: false, report }));
      } catch (e) {
        if (!alive) return;
        setState((s) => ({ ...s, loading: false, error: e.message || "Failed to load preview" }));
      }
    }
    loadPreview();
    return () => {
      alive = false;
    };
  }, [from, to]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Presales Complete Report</h1>
        <p>Download group-wise PDF with consultant demo scores.</p>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}

      <div className="card">
        <div className="card__head" style={{ flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="field__label">From</span>
              <input type="date" className="input" style={{ width: 200 }} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="field__label">To</span>
              <input type="date" className="input" style={{ width: 200 }} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select className="input" style={{ width: 260 }} value={selectedConsultantId} onChange={(e) => setSelectedConsultantId(e.target.value)}>
              <option value="">Select consultant for individual report</option>
              {consultants.map((c) => (
                <option key={c.consultant?.id || c.consultant?.email} value={c.consultant?.id || ""}>
                  {c.consultant?.name || "—"} ({c.consultant?.email || "—"})
                </option>
              ))}
            </select>
            <button className="btn btn--green" type="button" onClick={downloadConsultantPdf} disabled={state.loading || !selectedConsultantId}>
              {state.loading ? "Generating..." : "Download Consultant PDF"}
            </button>
            <button className="btn" type="button" onClick={downloadPdf} disabled={state.loading}>
              {state.loading ? "Generating PDF..." : "Download PDF"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 10 }}>
          <div className="kpi kpi--purple">
            <div className="kpi__label">Department Avg Score</div>
            <div className="kpi__value kpi__value--purple">
              {state.loading ? "—" : department?.averageScore ?? "—"}
            </div>
            <div className="kpi__hint">{deptAvgScore10 != null ? `${deptAvgScore10} / 10` : "—"}</div>
          </div>
          <div className="kpi kpi--blue">
            <div className="kpi__label">Total Demos</div>
            <div className="kpi__value kpi__value--blue">{state.loading ? "—" : department?.totalDemos ?? 0}</div>
            <div className="kpi__hint">in selected window</div>
          </div>
          <div className="kpi kpi--green">
            <div className="kpi__label">Consultants</div>
            <div className="kpi__value kpi__value--green">{state.loading ? "—" : consultants.length}</div>
            <div className="kpi__hint">group-wise sections</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--card-border)" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>Preview</h2>
            <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>Ranked by average score — matches PDF structure</p>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.06)", border: "1px solid var(--card-border)", borderRadius: 99, padding: "3px 12px" }}>
            {consultants.length} consultant{consultants.length !== 1 ? "s" : ""}
          </span>
        </div>

        {state.loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Loading report data…</div>
        ) : consultants.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No demo scores found for the selected date window.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.87rem" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--card-border)" }}>
                <th style={thS("52px", "center")}>#</th>
                <th style={thS("auto", "left")}>Consultant</th>
                <th style={thS("110px", "center")}>Total Demos</th>
                <th style={thS("130px", "center")}>Avg Score</th>
                <th style={thS("auto", "left")}>Top Demo</th>
              </tr>
            </thead>
            <tbody>
              {[...consultants]
                .sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1))
                .map((c, idx) => {
                  const rank = idx + 1;
                  const sc = c.averageScore ?? null;
                  const top = (c.demos || [])[0];
                  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
                  const initials = (c.consultant?.name || "?")[0].toUpperCase();
                  const hue = (c.consultant?.name?.charCodeAt(0) || 0) * 15;
                  return (
                    <tr key={c.consultant?.id || c.consultant?.email || idx}
                      style={{ borderBottom: "1px solid var(--card-border)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.04)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {/* Rank */}
                      <td style={tdS("center")}>
                        {medal ? (
                          <span style={{ fontSize: "1.2rem" }}>{medal}</span>
                        ) : (
                          <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-muted)" }}>{rank}</span>
                        )}
                      </td>

                      {/* Consultant */}
                      <td style={tdS("left")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: `hsl(${hue},55%,38%)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem", color: "#fff" }}>
                            {initials}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.consultant?.name || "—"}</div>
                            <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.consultant?.email || ""}</div>
                          </div>
                        </div>
                      </td>

                      {/* Total Demos */}
                      <td style={tdS("center")}>
                        <span style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--card-border)", borderRadius: 99, padding: "3px 12px", fontWeight: 600 }}>
                          {c.totalDemos ?? 0}
                        </span>
                      </td>

                      {/* Avg Score */}
                      <td style={tdS("center")}>
                        {sc != null ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <span style={{ fontWeight: 800, fontSize: "1rem", color: scoreColor(sc), background: scoreColor(sc) + "18", border: "1px solid " + scoreColor(sc) + "40", borderRadius: 99, padding: "3px 14px" }}>
                              {sc}
                            </span>
                            <div style={{ width: 80, height: 4, borderRadius: 99, background: "var(--card-border)", overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 99, width: `${sc}%`, background: scoreColor(sc) }} />
                            </div>
                          </div>
                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>

                      {/* Top Demo */}
                      <td style={tdS("left")}>
                        {top ? (
                          <div>
                            <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>{top.title}</div>
                            {top.startTime && (
                              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{new Date(top.startTime).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                            )}
                          </div>
                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <h2>Department KPI Widgets</h2>
          <span className="muted">Date-range presales KPI visual summary</span>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 210, flex: "0 0 210px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div className="muted" style={{ fontSize: "0.8rem" }}>Overall rating</div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: scoreColor(department?.averageScore || 0) }}>
                  {department?.averageScore != null ? Number((department.averageScore / 10).toFixed(1)) : "—"}
                  <span style={{ fontSize: "1rem", marginLeft: 6 }}>/10</span>
                </div>
              </div>
              <ScoreRing score={department?.averageScore || 0} size={86} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <span className="badge badge--green">Positive {departmentWidget.sentiments.positive || 0}</span>
              <span className="badge">Neutral {departmentWidget.sentiments.neutral || 0}</span>
              <span className="badge badge--red">Negative {departmentWidget.sentiments.negative || 0}</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <StatBar label="Discovery" value={departmentWidget.discovery} color="blue" />
              <StatBar label="Rapport" value={departmentWidget.rapport} color="green" />
              <StatBar label="Demo Delivery" value={departmentWidget.demo} color="purple" />
              <StatBar label="Objections" value={departmentWidget.objections} color="orange" />
              <StatBar label="Engagement" value={departmentWidget.engagement} color="purple" />
              <StatBar label="Closing" value={departmentWidget.close} color="green" />
              <div style={{ gridColumn: "1 / -1" }}>
                <StatBar label="Customer Sentiment" value={departmentWidget.sentimentScore} color="orange" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedConsultant ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card__head">
            <h2>Consultant KPI Widgets</h2>
            <span className="muted">{selectedConsultant.consultant?.name || "Consultant"} overview for selected range</span>
          </div>
          {(() => {
            const dims = selectedConsultant.dimensionAverages || {};
            const d = (val, max) => (val != null ? Number((val / (max / 10)).toFixed(1)) : null);
            
            const disc = d(dims.discoveryScore, 75);
            const rapp = d(dims.rapportScore, 70);
            const demo = d(dims.demoScore, 85);
            const obj = d(dims.objectionsScore, 70);
            const eng = d(dims.engagementScore, 80);
            const close = d(dims.closeScore, 65);

            const counts = selectedConsultant.sentimentCounts || { positive: 0, neutral: 0, negative: 0 };
            const sentimentScore =
              (counts.positive + counts.neutral + counts.negative) > 0
                ? Number(((counts.positive * 10 + counts.neutral * 7 + counts.negative * 4) / (counts.positive + counts.neutral + counts.negative)).toFixed(1))
                : null;
            return (
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: 210, flex: "0 0 210px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div className="muted" style={{ fontSize: "0.8rem" }}>Overall rating</div>
                      <div style={{ fontSize: "2rem", fontWeight: 800, color: scoreColor(selectedConsultant.averageScore || 0) }}>
                        {selectedConsultant.averageScore != null ? Number((selectedConsultant.averageScore / 10).toFixed(1)) : "—"}
                        <span style={{ fontSize: "1rem", marginLeft: 6 }}>/10</span>
                      </div>
                    </div>
                    <ScoreRing score={selectedConsultant.averageScore || 0} size={86} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <span className="badge badge--green">Positive {counts.positive || 0}</span>
                    <span className="badge">Neutral {counts.neutral || 0}</span>
                    <span className="badge badge--red">Negative {counts.negative || 0}</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <StatBar label="Discovery" value={disc} color="blue" />
                    <StatBar label="Rapport" value={rapp} color="green" />
                    <StatBar label="Demo Delivery" value={demo} color="purple" />
                    <StatBar label="Objections" value={obj} color="orange" />
                    <StatBar label="Engagement" value={eng} color="purple" />
                    <StatBar label="Closing" value={close} color="green" />
                    <div style={{ gridColumn: "1 / -1" }}>
                      <StatBar label="Customer Sentiment" value={sentimentScore} color="orange" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {selectedConsultant ? (
        <div className="card" style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--card-border)" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>Detailed Scores</h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>{selectedConsultant.consultant?.name || "Consultant"} — all dimensions per demo</p>
            </div>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.06)", border: "1px solid var(--card-border)", borderRadius: 99, padding: "3px 12px" }}>
              {(selectedConsultant.demos || []).length} demo{(selectedConsultant.demos || []).length !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem", minWidth: 700 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--card-border)" }}>
                  <th style={thS("auto", "left")}>Demo Title</th>
                  <th style={thS("110px", "center")}>Date</th>
                  <th style={thS("70px", "center")}>Disc</th>
                  <th style={thS("70px", "center")}>Rapp</th>
                  <th style={thS("70px", "center")}>Demo</th>
                  <th style={thS("70px", "center")}>Obj</th>
                  <th style={thS("70px", "center")}>Eng</th>
                  <th style={thS("70px", "center")}>Close</th>
                  <th style={thS("90px", "center")}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(selectedConsultant.demos || []).map((d) => {
                  const sc = d.totalScore ?? null;
                  const dimCell = (val) => (
                    <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{val ?? "—"}</span>
                  );
                  return (
                    <tr key={d.meetingId} style={{ borderBottom: "1px solid var(--card-border)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.04)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ ...tdS("left"), maxWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title || "—"}</div>
                        {d.clientName && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{d.clientName}</div>}
                      </td>
                      <td style={tdS("center")}>
                        <span style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                          {d.startTime ? new Date(d.startTime).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </span>
                      </td>
                      <td style={tdS("center")}>{dimCell(d.discoveryScore)}</td>
                      <td style={tdS("center")}>{dimCell(d.rapportScore)}</td>
                      <td style={tdS("center")}>{dimCell(d.demoScore)}</td>
                      <td style={tdS("center")}>{dimCell(d.objectionsScore)}</td>
                      <td style={tdS("center")}>{dimCell(d.engagementScore)}</td>
                      <td style={tdS("center")}>{dimCell(d.closeScore)}</td>
                      <td style={tdS("center")}>
                        {sc != null ? (
                          <span style={{ fontWeight: 800, color: scoreColor(sc), background: scoreColor(sc) + "18", border: "1px solid " + scoreColor(sc) + "40", borderRadius: 99, padding: "3px 10px", fontSize: "0.85rem" }}>
                            {sc}
                          </span>
                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

