import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ManagerSubNav from "../components/ManagerSubNav.jsx";
import { downloadMeetingReportPdf } from "../utils/reportPdf.js";
import { buildDemoKpiAssessment } from "../utils/demoKpiFramework.js";

function splitBulletLike(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  return t
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .map((line) => line.replace(/\*\*/g, ""))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function splitSentences(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  return t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sentimentMeta(sentiment) {
  const s = String(sentiment || "").toLowerCase();
  if (s === "positive") return { emoji: ":)", label: "Positive", color: "#4ade80", score: 82 };
  if (s === "negative") return { emoji: ":(", label: "Negative", color: "#f87171", score: 36 };
  return { emoji: ":|", label: "Neutral", color: "#fbbf24", score: 58 };
}

function scoreBand(score) {
  if (score >= 5) return { label: "Excellent", color: "var(--green)" };
  if (score >= 4) return { label: "Good", color: "var(--accent)" };
  if (score >= 3) return { label: "Average", color: "var(--orange)" };
  if (score >= 2) return { label: "Below Avg", color: "#f97316" };
  return { label: "Poor", color: "#ef4444" };
}

function DetailList({ items, emptyText }) {
  if (!items?.length) return <div className="muted">{emptyText}</div>;
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function KpiPill({ children, color, borderColor, background }) {
  return (
    <span
      className="badge"
      style={{
        color,
        borderColor,
        background
      }}
    >
      {children}
    </span>
  );
}

export default function MeetingReportPage() {
  const { meetingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const autoTranscriptAttemptsRef = useRef(0);
  const autoTranscriptTimerRef = useRef(null);
  const [state, setState] = useState({
    loading: true,
    error: "",
    report: null,
    fetchingTranscript: false,
    transcriptError: "",
    downloadingPdf: false,
    showTranscript: false
  });

  useEffect(() => {
    let alive = true;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: "", report: null }));
      try {
        const res = await apiFetch(`/api/meetings/report/${meetingId}`, { auth: true });
        if (!alive) return;
        setState((s) => ({ ...s, loading: false, error: "", report: res }));
      } catch (e) {
        if (!alive) return;
        setState((s) => ({ ...s, loading: false, error: e.message || "Failed to load report", report: null }));
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [meetingId]);

  useEffect(() => {
    let alive = true;

    async function autoFetch() {
      const report = state.report;
      if (!report) return;
      if (report.transcript?.transcriptText) return;
      if (state.fetchingTranscript) return;
      if (autoTranscriptAttemptsRef.current >= 5) return;
      if (!["manager", "admin", "consultant"].includes(user?.role)) return;

      autoTranscriptAttemptsRef.current += 1;
      setState((s) => ({ ...s, fetchingTranscript: true, transcriptError: "" }));
      try {
        const res = await apiFetch(`/api/meetings/${meetingId}/fetch-transcript`, {
          method: "POST",
          auth: true
        });
        if (!alive) return;
        if (res.ok) {
          const refreshed = await apiFetch(`/api/meetings/report/${meetingId}`, { auth: true });
          if (!alive) return;
          setState((s) => ({
            ...s,
            fetchingTranscript: false,
            report: refreshed,
            transcriptError: ""
          }));
        } else {
          setState((s) => ({
            ...s,
            fetchingTranscript: false,
            transcriptError: res.message || "Could not load transcript from Teams."
          }));
        }
      } catch (err) {
        if (!alive) return;
        setState((s) => ({
          ...s,
          fetchingTranscript: false,
          transcriptError: err.message || "Failed to fetch transcript"
        }));
      }
    }

    autoFetch();
    return () => {
      alive = false;
    };
  }, [state.report, state.fetchingTranscript, meetingId, user?.role]);

  useEffect(() => {
    if (autoTranscriptTimerRef.current) {
      clearTimeout(autoTranscriptTimerRef.current);
      autoTranscriptTimerRef.current = null;
    }

    const report = state.report;
    if (!report) return;
    if (report.transcript?.transcriptText) return;
    if (!state.transcriptError) return;
    if (autoTranscriptAttemptsRef.current >= 5) return;

    const shouldRetry = /not available yet|try again|meeting has ended|transcript|resolve the Teams online meeting/i.test(
      String(state.transcriptError || "")
    );
    if (!shouldRetry) return;

    const delayMs = Math.min(120_000, 20_000 + autoTranscriptAttemptsRef.current * 20_000);
    autoTranscriptTimerRef.current = setTimeout(() => {
      setState((s) => ({ ...s, transcriptError: "" }));
    }, delayMs);

    return () => {
      if (autoTranscriptTimerRef.current) {
        clearTimeout(autoTranscriptTimerRef.current);
        autoTranscriptTimerRef.current = null;
      }
    };
  }, [state.report, state.transcriptError]);

  const r = state.report;
  const sMeta = sentimentMeta(r?.sentiment);
  const summaryBullets = splitBulletLike(r?.summary);
  const qualitySentences = splitSentences(r?.demoQualityEvaluation);
  const clientNeeds = summaryBullets.filter((b) =>
    /(need|pain|problem|challenge|requirement|goal|objective|risk|concern)/i.test(b)
  );
  const contextPoints = summaryBullets.filter((b) =>
    /(context|discussion|demo|technical|integration|security|pricing|next step|engagement|value)/i.test(b)
  );
  const sentimentTimeline = qualitySentences.filter((s) =>
    /(timeline|start|middle|end|positive|neutral|negative|score)/i.test(s)
  );

  function parseLabelValue(bullet) {
    const s = String(bullet || "").trim();
    const idx = s.indexOf(":");
    if (idx > 0) {
      const label = s.slice(0, idx).trim();
      const value = s.slice(idx + 1).trim();
      if (label && value) return { label, value };
    }
    return { label: "", value: s };
  }

  const allowedSummaryLabels = new Set([
    "Context",
    "Client needs",
    "Client Need",
    "Value",
    "Technical fit",
    "Risk & compliance",
    "Commercials",
    "Engagement",
    "Next steps",
    "Momentum & next steps"
  ]);

  const completeAnalysisItems = summaryBullets
    .map((b) => parseLabelValue(b))
    .filter((it) => it.value)
    .filter((it) => !it.label || allowedSummaryLabels.has(it.label));

  const isManager = user?.role === "manager" || user?.role === "admin";
  const kpiAssessment = useMemo(() => (r ? buildDemoKpiAssessment(r) : null), [r]);

  function handleDownloadPdf() {
    if (!r) return;
    setState((s) => ({ ...s, downloadingPdf: true, error: "" }));
    try {
      downloadMeetingReportPdf(r);
    } catch (err) {
      setState((s) => ({ ...s, error: err?.message || "Failed to generate PDF report" }));
    } finally {
      setState((s) => ({ ...s, downloadingPdf: false }));
    }
  }

  async function handleReAnalyze() {
    if (!r) return;
    if (!window.confirm("This will overwrite existing scores and reasoning using the latest AI prompt. Continue?")) return;

    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const res = await apiFetch(`/api/meetings/${meetingId}/re-analyze`, {
        method: "POST",
        auth: true
      });
      if (res.ok) {
        // Reload report data
        const refreshed = await apiFetch(`/api/meetings/report/${meetingId}`, { auth: true });
        setState((s) => ({ ...s, loading: false, report: refreshed, error: "" }));
        alert("Re-analysis completed successfully!");
      } else {
        throw new Error(res.message || "Re-analysis failed");
      }
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err?.message || "Failed to re-analyze transcript" }));
    }
  }

  // Parse dimension-prefixed items like "Discovery: ..." into { dim, text }
  function parseDimPrefixed(items) {
    const dimNames = ["Discovery", "Rapport", "Demo", "Objections", "Engagement", "Close", "Risks"];
    return (items || []).map((item) => {
      const s = String(item || "").trim();
      for (const d of dimNames) {
        if (s.toLowerCase().startsWith(d.toLowerCase() + ":")) {
          return { dim: d, text: s.slice(d.length + 1).trim() };
        }
      }
      return { dim: "General", text: s };
    });
  }

  function renderScoreBasis() {
    if (!kpiAssessment) return null;
    const scoredDims = kpiAssessment.dimensions.filter((d) => !d.risk);
    return (
      <div className="card">
        <div className="card__head">
          <div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800 }}>How This Score Was Calculated</h2>
            <p className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
              Each dimension contributes weighted KPI points to the final score
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--accent)" }}>{kpiAssessment.finalScore}/100</div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>Final Score</div>
          </div>
        </div>

        {/* Dimension contribution table */}
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--card-border)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>Dimension</th>
                <th style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-muted)", fontWeight: 600 }}>Earned</th>
                <th style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-muted)", fontWeight: 600 }}>Max</th>
                <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, minWidth: 140 }}>Performance</th>
                <th style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-muted)", fontWeight: 600 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {scoredDims.map((dim) => {
                const pct = Math.round((dim.weightedScore / dim.weightMax) * 100);
                const color = pct >= 70 ? "#4ade80" : pct >= 45 ? "#fbbf24" : "#f87171";
                return (
                  <tr key={dim.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontWeight: 700, color: dim.tone }}>{dim.label}</span>
                      <div style={{ fontSize: "0.73rem", color: "var(--text-muted)" }}>{dim.description}</div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: dim.tone }}>{dim.weightedScore}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)" }}>{dim.weightMax}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden", minWidth: 100 }}>
                        <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: color, transition: "width 0.5s" }} />
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color }}>{pct}%</td>
                  </tr>
                );
              })}
              {/* Risk deduction row */}
              <tr style={{ borderBottom: "1px solid var(--card-border)", background: kpiAssessment.riskDeductionPoints > 0 ? "rgba(239,68,68,0.05)" : "transparent" }}>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ fontWeight: 700, color: "#ef4444" }}>Risk Deductions</span>
                  <div style={{ fontSize: "0.73rem", color: "var(--text-muted)" }}>{kpiAssessment.riskCount} flag(s) × −5 pts each</div>
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#ef4444" }}>−{kpiAssessment.riskDeductionPoints}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)" }}>0</td>
                <td style={{ padding: "10px 12px" }} />
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#ef4444" }}>{kpiAssessment.riskDeductionPoints > 0 ? `−${kpiAssessment.riskDeductionPoints}` : "0"}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--card-border)" }}>
                <td style={{ padding: "10px 12px", fontWeight: 800 }}>Total</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: "var(--accent)", fontSize: "1.05rem" }}>{kpiAssessment.adjustedScore}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)", fontWeight: 700 }}>445</td>
                <td style={{ padding: "10px 12px" }} />
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: "var(--accent)", fontSize: "1.05rem" }}>{kpiAssessment.finalScore}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: "0.8rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 14px", border: "1px solid var(--card-border)" }}>
          Formula: ({kpiAssessment.weightedScore} weighted pts − {kpiAssessment.riskDeductionPoints} risk deduction) ÷ 445 × 100 = <strong style={{ color: "var(--text-main)" }}>{kpiAssessment.finalScore}/100</strong>
        </div>
      </div>
    );
  }

  function renderCriticalGaps() {
    if (!kpiAssessment) return null;
    const scoredDims = kpiAssessment.dimensions.filter((d) => !d.risk);

    const allGapKpis = [];
    scoredDims.forEach((dim) => {
      dim.kpis.filter((k) => k.score <= 3).forEach((kpi) => {
        allGapKpis.push({ ...kpi, dimLabel: dim.label, dimTone: dim.tone });
      });
    });

    allGapKpis.sort((a, b) => a.score - b.score);

    if (allGapKpis.length === 0) return (
      <div className="card" style={{ borderLeft: "4px solid #4ade80" }}>
        <h2 style={{ color: "#4ade80" }}>No Critical Gaps</h2>
        <p className="muted">All KPIs scored above the improvement threshold.</p>
      </div>
    );

    const criticalKpis = allGapKpis.filter((k) => k.score <= 1);
    const weakKpis    = allGapKpis.filter((k) => k.score === 2);
    const partialKpis = allGapKpis.filter((k) => k.score === 3);

    const severityGroups = [
      { label: "Missing", sublabel: "Score 1 — Not attempted at all", color: "#ef4444", bg: "rgba(239,68,68,0.07)", border: "rgba(239,68,68,0.25)", kpis: criticalKpis },
      { label: "Weak",    sublabel: "Score 2 — Attempted but ineffective", color: "#f97316", bg: "rgba(249,115,22,0.07)", border: "rgba(249,115,22,0.25)", kpis: weakKpis },
      { label: "Partial", sublabel: "Score 3 — Partially done, key elements missed", color: "#fbbf24", bg: "rgba(251,191,36,0.07)", border: "rgba(251,191,36,0.2)", kpis: partialKpis },
    ].filter((g) => g.kpis.length > 0);

    return (
      <div className="card">
        {/* Header */}
        <div className="card__head" style={{ marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f97316" }}>Critical Gaps & What Was Missing</h2>
            <p className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>KPIs scoring 3 or below — grouped by severity</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {criticalKpis.length > 0 && <span style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 99, padding: "3px 12px", fontSize: "0.78rem", fontWeight: 700 }}>{criticalKpis.length} Missing</span>}
            {weakKpis.length > 0    && <span style={{ background: "rgba(249,115,22,0.15)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 99, padding: "3px 12px", fontSize: "0.78rem", fontWeight: 700 }}>{weakKpis.length} Weak</span>}
            {partialKpis.length > 0 && <span style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 99, padding: "3px 12px", fontSize: "0.78rem", fontWeight: 700 }}>{partialKpis.length} Partial</span>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {severityGroups.map((group) => (
            <div key={group.label}>
              {/* Severity header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: group.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 800, color: group.color, fontSize: "0.95rem" }}>{group.label}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{group.sublabel}</span>
                <div style={{ flex: 1, height: 1, background: group.border }} />
              </div>

              {/* KPI cards grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {group.kpis.map((kpi) => (
                  <div key={kpi.id} style={{ borderRadius: 12, border: "1px solid " + group.border, background: group.bg, overflow: "hidden" }}>
                    {/* Card top strip */}
                    <div style={{ height: 3, background: "linear-gradient(90deg, " + group.color + "80, " + group.color + ")" }} />
                    <div style={{ padding: "12px 14px" }}>
                      {/* Dimension tag + score */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: kpi.dimTone, background: kpi.dimTone + "18", border: "1px solid " + kpi.dimTone + "35", borderRadius: 99, padding: "2px 8px" }}>
                          {kpi.dimLabel}
                        </span>
                        {/* Score dots */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {[1,2,3,4,5].map((dot) => (
                            <div key={dot} style={{ width: 7, height: 7, borderRadius: "50%", background: dot <= kpi.score ? group.color : "rgba(255,255,255,0.12)" }} />
                          ))}
                          <span style={{ marginLeft: 4, fontSize: "0.75rem", fontWeight: 800, color: group.color }}>{kpi.score}/5</span>
                        </div>
                      </div>

                      {/* KPI name */}
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 8, lineHeight: 1.3 }}>{kpi.label}</div>

                      {/* Reason */}
                      {kpi.reason && kpi.reason !== "Refer to transcript." && (
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.55, marginBottom: 8 }}>
                          <span style={{ color: group.color, fontWeight: 600 }}>Gap: </span>{kpi.reason}
                        </div>
                      )}

                      {/* Evidence quote — only for score 2/3 and with cleaned evidence */}
                      {kpi.score >= 2 && kpi.evidence && kpi.evidence !== "N/A" && kpi.evidence !== "None" && !(/meeting recording/i).test(kpi.evidence) && !(/started transc/i).test(kpi.evidence) && !"0123456789".includes(kpi.evidence.trim()[0]) && kpi.evidence.trim().length > 15 && (
                        <div style={{ fontSize: "0.72rem", fontStyle: "italic", color: "var(--text-muted)", borderLeft: "2px solid " + group.color + "50", paddingLeft: 8, lineHeight: 1.5, opacity: 0.85 }}>
                          &ldquo;{kpi.evidence}&rdquo;
                        </div>
                      )}
                      {/* What Was Missing bullets from AI kpiGaps */}
                      {r?.kpiGaps?.[kpi.label]?.whatWasMissing?.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: group.color, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>What Was Missing</div>
                          <ul style={{ margin: 0, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 3 }}>
                            {r.kpiGaps[kpi.label].whatWasMissing.map((item, i) => (
                              <li key={i} style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderImprovementPlan() {
    if (!kpiAssessment) return null;
    const scoredDims = kpiAssessment.dimensions.filter((d) => !d.risk);

    // Parse Claude's cons and tips by dimension (object tips handled separately via kpiTipMap)
    const parsedCons = parseDimPrefixed((r?.cons || []).filter((c) => typeof c === "string"));
    const parsedTips = parseDimPrefixed((r?.tips || []).filter((t) => typeof t === "string"));

    // Build KPI-to-tip map: new object format { kpi, actions, evidence } or old "KPI Label: ..." strings
    const allKpiLabels = scoredDims.flatMap((d) => d.kpis.map((k) => k.label));
    const kpiTipMap = {};
    (r?.tips || []).forEach((tip) => {
      if (tip && typeof tip === "object" && tip.kpi) {
        kpiTipMap[tip.kpi.toLowerCase()] = { actions: tip.actions || [], evidence: tip.evidence || "" };
      } else if (typeof tip === "string") {
        const s = tip.trim();
        for (const label of allKpiLabels) {
          if (s.toLowerCase().startsWith(label.toLowerCase() + ":")) {
            kpiTipMap[label.toLowerCase()] = { actions: [s.slice(label.length + 1).trim()], evidence: "" };
            break;
          }
        }
      }
    });

    // Sort dimensions by performance (worst first)
    const dimsSorted = [...scoredDims].sort((a, b) => a.percentage - b.percentage);

    // Only show dimensions that have at least one KPI < 5 or a cons/tip entry
    const actionableDims = dimsSorted.filter((dim) => {
      const hasWeakKpi = dim.kpis.some((k) => k.score < 5);
      const hasCons = parsedCons.some((c) => c.dim.toLowerCase() === dim.label.toLowerCase())
        || (r?.cons || []).some((c) => c && typeof c === "object" && c.dimension?.toLowerCase() === dim.label.toLowerCase());
      const hasTips = parsedTips.some((t) => t.dim.toLowerCase() === dim.label.toLowerCase())
        || (r?.tips || []).some((t) => t && typeof t === "object" && dim.kpis.some((k) => k.label.toLowerCase() === (t.kpi || "").toLowerCase()));
      return hasWeakKpi || hasCons || hasTips;
    });

    if (actionableDims.length === 0) return null;

    const pctColor = (pct) => pct >= 70 ? "#4ade80" : pct >= 45 ? "#fbbf24" : "#f87171";

    return (
      <div className="card">
        <div className="card__head">
          <div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#38bdf8" }}>Improvement Plan</h2>
            <p className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
              Dimension-by-dimension coaching plan — lowest performing first
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 12 }}>
          {actionableDims.map((dim) => {
            const dimCons = parsedCons.filter((c) => c.dim.toLowerCase() === dim.label.toLowerCase());
            const dimObjCons = (r?.cons || []).filter((c) => c && typeof c === "object" && c.dimension?.toLowerCase() === dim.label.toLowerCase());
            const dimTips = parsedTips.filter((t) => t.dim.toLowerCase() === dim.label.toLowerCase());
            const weakKpis = dim.kpis.filter((k) => k.score <= 3).sort((a, b) => a.score - b.score);
            const pct = dim.percentage;
            const col = pctColor(pct);

            return (
              <div key={dim.id} style={{ borderRadius: 12, border: `1px solid ${dim.tone}30`, overflow: "hidden" }}>
                {/* Dimension header */}
                <div style={{ padding: "12px 16px", background: `${dim.tone}10`, borderLeft: `4px solid ${dim.tone}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: "0.98rem", color: dim.tone }}>{dim.label}</span>
                    <span className="muted" style={{ marginLeft: 8, fontSize: "0.78rem" }}>{dim.description}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ height: 6, width: 80, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: col }} />
                    </div>
                    <span style={{ fontWeight: 800, color: col, fontSize: "0.85rem" }}>{pct}%</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>({dim.weightedScore}/{dim.weightMax} pts)</span>
                  </div>
                </div>

                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* What went wrong (cons for this dimension) */}
                  {(dimObjCons.length > 0 || dimCons.length > 0) && (
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#f87171", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>What Went Wrong</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {dimObjCons.map((c, i) => (
                          <div key={i} style={{ borderRadius: 6, border: "1px solid rgba(248,113,113,0.15)", overflow: "hidden" }}>
                            <div style={{ padding: "6px 10px", background: "rgba(248,113,113,0.05)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ color: "#f87171", fontWeight: 800, fontSize: "0.85rem", flexShrink: 0 }}>&#10007;</span>
                              {c.kpi && <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-main)" }}>{c.kpi}</span>}
                            </div>
                            <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                              {c.explanation && <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{c.explanation}</div>}
                              {c.quote && (
                                <div style={{ fontSize: "0.75rem", fontStyle: "italic", color: "var(--text-muted)", borderLeft: "2px solid rgba(248,113,113,0.3)", paddingLeft: 8, lineHeight: 1.5, opacity: 0.85 }}>
                                  &ldquo;{c.quote}&rdquo;
                                </div>
                              )}
                              {c.suggestion && (
                                <div style={{ fontSize: "0.78rem", color: "#38bdf8", background: "rgba(56,189,248,0.05)", borderRadius: 5, padding: "5px 8px", border: "1px solid rgba(56,189,248,0.12)", lineHeight: 1.5 }}>
                                  <span style={{ fontWeight: 700 }}>Suggestion: </span>{c.suggestion}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {dimCons.length > 0 && (
                          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                            {dimCons.map((c, i) => (
                              <li key={i} style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.55 }}>{c.text}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}

                  {/* KPI-level gaps with inline improvement tips */}
                  {weakKpis.length > 0 && (
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fbbf24", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>KPI Gaps in This Dimension</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {weakKpis.map((kpi) => (
                          <div key={kpi.id} style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--card-border)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: "0.86rem" }}>{kpi.label}</span>
                              <span style={{ fontSize: "0.72rem", color: kpi.score <= 1 ? "#ef4444" : kpi.score <= 2 ? "#f97316" : "#fbbf24", background: "rgba(255,255,255,0.05)", borderRadius: 99, padding: "1px 8px", border: "1px solid rgba(255,255,255,0.08)", fontWeight: 700 }}>
                                {kpi.score}/5
                              </span>
                            </div>
                            {kpi.reason && kpi.reason !== "Refer to transcript." && (
                              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: kpiTipMap[kpi.label.toLowerCase()]?.actions?.length > 0 ? 6 : 0 }}>{kpi.reason}</div>
                            )}
                            {kpiTipMap[kpi.label.toLowerCase()]?.actions?.length > 0 && (
                              <div style={{ fontSize: "0.8rem", color: "#38bdf8", lineHeight: 1.55, background: "rgba(56,189,248,0.06)", borderRadius: 6, padding: "8px 10px", border: "1px solid rgba(56,189,248,0.15)" }}>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>How to improve:</div>
                                <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                                  {kpiTipMap[kpi.label.toLowerCase()].actions.map((action, ai) => (
                                    <li key={ai} style={{ fontSize: "0.79rem", lineHeight: 1.55 }}>{action.replace(/^\d+\.\s*/, "")}</li>
                                  ))}
                                </ol>
                                {kpiTipMap[kpi.label.toLowerCase()].evidence && (
                                  <div style={{ marginTop: 6, fontSize: "0.75rem", fontStyle: "italic", color: "#38bdf8", opacity: 0.75, borderLeft: "2px solid rgba(56,189,248,0.3)", paddingLeft: 8, lineHeight: 1.5 }}>
                                    &ldquo;{kpiTipMap[kpi.label.toLowerCase()].evidence}&rdquo;
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* How to improve — dimension-level tips not already shown in KPI cards */}
                  {dimTips.length > 0 && (
                    <div style={{ background: "rgba(56,189,248,0.06)", borderRadius: 8, padding: "12px 14px", border: "1px solid rgba(56,189,248,0.15)" }}>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#38bdf8", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>How to Improve</div>
                      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                        {dimTips.map((t, i) => (
                          <li key={i} style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>{t.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* General (unmatched) tips — exclude any already shown as KPI-specific inline tips */}
          {(() => {
            const generalTips = parsedTips.filter((t) => t.dim === "General" && !allKpiLabels.some((label) => t.text.toLowerCase().startsWith(label.toLowerCase() + ":")));
            if (!generalTips.length) return null;
            return (
              <div style={{ borderRadius: 12, border: "1px solid rgba(56,189,248,0.2)", overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", background: "rgba(56,189,248,0.06)", borderLeft: "4px solid #38bdf8" }}>
                  <span style={{ fontWeight: 800, color: "#38bdf8" }}>Overall Coaching Tips</span>
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                    {generalTips.map((t, i) => (
                      <li key={i} style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>{t.text}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  function renderKpiShowcase() {
    if (!kpiAssessment) return null;

    const scoredDimensions = kpiAssessment.dimensions.filter((d) => !d.risk);
    const riskDimension = kpiAssessment.dimensions.find((d) => d.risk);

    return (
      <>
        {/* Authoritative KPI Lens Overview */}
        <div className="card" style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.05))" }}>
          <div className="card__head">
            <div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 800 }}>{kpiAssessment.productSummary.title}</h2>
              <p className="muted" style={{ marginTop: 4 }}>Authoritative 7-Dimension, 23-KPI Scoring Framework</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--accent)" }}>{kpiAssessment.finalScore}/100</div>
              <div className="badge badge--purple">{kpiAssessment.verdict}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 20 }}>
            <div className="kpi kpi--blue">
              <div className="kpi__label">Weighted Performance</div>
              <div className="kpi__value">{kpiAssessment.weightedScore} / {kpiAssessment.weightedMax}</div>
              <div className="kpi__hint">Total of all KPI scores x weights</div>
            </div>
            <div className="kpi kpi--orange">
              <div className="kpi__label">Risk Deductions</div>
              <div className="kpi__value">-{kpiAssessment.riskDeductionPoints}</div>
              <div className="kpi__hint">{kpiAssessment.riskCount} flags x 5 points each</div>
            </div>
            <div className="kpi kpi--green">
              <div className="kpi__label">Adjusted Total</div>
              <div className="kpi__value">{kpiAssessment.adjustedScore}</div>
              <div className="kpi__hint">Final weighted points before normalization</div>
            </div>
          </div>

          <div className="alert" style={{ marginTop: 20, background: "rgba(255,255,255,0.03)", border: "1px solid var(--card-border)" }}>
            <strong>Calculation Logic:</strong> (({kpiAssessment.weightedScore} - {kpiAssessment.riskDeductionPoints}) / 445) x 100 = <strong>{kpiAssessment.finalScore}%</strong>
          </div>
        </div>

        {/* Dimension-wise Breakdown Cards */}
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>Detailed Performance Breakdown</h2>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.06)", borderRadius: 99, padding: "3px 12px", border: "1px solid var(--card-border)" }}>
              {scoredDimensions.length} dimensions
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {scoredDimensions.map((dim) => {
              const pct = Math.round((dim.weightedScore / dim.weightMax) * 100);
              return (
                <div
                  key={dim.id}
                  style={{
                    borderRadius: 16, overflow: "hidden",
                    border: `1px solid ${dim.tone}28`,
                    background: "rgba(255,255,255,0.01)",
                    display: "flex", flexDirection: "column"
                  }}
                >
                  {/* Dimension header */}
                  <div style={{
                    padding: "14px 18px",
                    background: `${dim.tone}12`,
                    borderBottom: `1px solid ${dim.tone}22`,
                    borderLeft: `4px solid ${dim.tone}`
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: "1rem", color: dim.tone }}>{dim.label}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {dim.description}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: "1.3rem", fontWeight: 900, color: dim.tone, lineHeight: 1 }}>
                          {dim.weightedScore}<span style={{ fontSize: "0.78rem", opacity: 0.6, fontWeight: 600 }}>/{dim.weightMax}</span>
                        </div>
                        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 1 }}>pts</div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ marginTop: 10, height: 5, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 99, width: `${pct}%`,
                        background: `linear-gradient(90deg, ${dim.tone}80, ${dim.tone})`,
                        transition: "width 0.6s ease"
                      }} />
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 4, textAlign: "right" }}>{pct}%</div>
                  </div>

                  {/* KPI rows */}
                  <div style={{ flex: 1 }}>
                    {dim.kpis.map((kpi, kIdx) => {
                      const band = scoreBand(kpi.score);
                      return (
                        <div
                          key={kpi.id}
                          style={{
                            padding: "12px 18px",
                            borderBottom: kIdx === dim.kpis.length - 1 ? "none" : "1px solid var(--card-border)"
                          }}
                        >
                          {/* KPI header row */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                              <span style={{ fontWeight: 700, fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{kpi.label}</span>
                              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: "1px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>Wt:{kpi.weight}</span>
                            </div>
                            <span style={{
                              padding: "3px 10px", borderRadius: 99, fontWeight: 800, fontSize: "0.8rem",
                              background: band.color + "20", color: band.color,
                              border: `1px solid ${band.color}40`, whiteSpace: "nowrap", flexShrink: 0
                            }}>
                              {kpi.score}/5
                            </span>
                          </div>
                          {/* Score mini-bar */}
                          <div style={{ height: 3, borderRadius: 99, background: "rgba(255,255,255,0.05)", marginBottom: 8, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 99, width: `${(kpi.score / 5) * 100}%`, background: band.color, opacity: 0.7 }} />
                          </div>
                          {/* Reason */}
                          <div style={{ fontSize: "0.8rem", lineHeight: 1.5, color: "var(--text-muted)", marginBottom: kpi.evidence && kpi.evidence !== "N/A" ? 6 : 0 }}>
                            {kpi.reason}
                          </div>
                          {/* Evidence quote */}
                          {kpi.evidence && kpi.evidence !== "N/A" && (
                            <div style={{
                              fontSize: "0.75rem", fontStyle: "italic", color: "var(--text-muted)",
                              paddingLeft: 10, borderLeft: `2px solid ${dim.tone}50`, opacity: 0.85
                            }}>
                              "{kpi.evidence}"
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Risk Flags Table */}
        <div className="card">
          <div className="card__head">
            <h2 style={{ color: "var(--orange)" }}>Risk Flags Detected</h2>
            <span className="muted">Critical blockers or red flags impacting deal success</span>
          </div>
          <div className="table-container" style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid var(--card-border)" }}>
                  <th style={{ padding: "12px 8px" }}>Risk Indicator</th>
                  <th style={{ padding: "12px 8px", textAlign: "center" }}>Present</th>
                  <th style={{ padding: "12px 8px", textAlign: "center" }}>Deduction</th>
                  <th style={{ padding: "12px 8px" }}>Evidence Quote</th>
                </tr>
              </thead>
              <tbody>
                {riskDimension?.kpis.map((kpi) => (
                  <tr key={kpi.id} style={{ borderBottom: "1px solid var(--card-border)", background: kpi.present ? "rgba(239,68,68,0.05)" : "transparent" }}>
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>{kpi.label}</td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      {kpi.present ? (
                        <span style={{ color: "#ef4444", fontWeight: 800 }}>TRUE</span>
                      ) : (
                        <span className="muted">FALSE</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      {kpi.present ? <span style={{ color: "#ef4444", fontWeight: 700 }}>-5</span> : <span className="muted">0</span>}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {kpi.present ? (
                        <div style={{ fontStyle: "italic", fontSize: "0.85rem" }}>"{kpi.evidence}"</div>
                      ) : (
                        <span className="muted">No risk evidence detected.</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, textAlign: "right" }}>
            <div className="muted" style={{ fontSize: "0.9rem" }}>
              Total Risk Deduction: <strong>-{kpiAssessment.riskDeductionPoints} points</strong>
            </div>
          </div>
        </div>


      </>
    );
  }

  return (
    <div className="page">
      {isManager ? <ManagerSubNav /> : null}
      <div className="header">
        <h1>Report</h1>
        <p>
          Summary, scores, and analysis. Transcript text appears here only after it is fetched from Teams (or was already stored for this demo).
        </p>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            className="link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "inherit" }}
            onClick={() => navigate(-1)}
          >
            Back
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {r?.transcript?.transcriptText ? (
              <button
                className="btn btn--orange btn--sm"
                type="button"
                onClick={handleReAnalyze}
                disabled={state.loading}
              >
                {state.loading ? "Analyzing..." : "Re-analyze Transcript"}
              </button>
            ) : null}
            {r ? (
              <button className="btn btn--green btn--sm" type="button" onClick={handleDownloadPdf} disabled={state.downloadingPdf}>
                {state.downloadingPdf ? "Generating PDF..." : "Download PDF"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {state.loading ? <div className="card">Loading...</div> : null}
      {state.error ? <div className="alert">{state.error}</div> : null}

      {r?.meeting ? (
        <>
          <div className="grid grid--2">
            <div className="card">
              <h2>Meeting</h2>
              <div className="kv">
                <div className="kv__k">Title</div>
                <div className="kv__v">{r.meeting.title}</div>
                <div className="kv__k">Start</div>
                <div className="kv__v">{new Date(r.meeting.startTime).toLocaleString()}</div>
                <div className="kv__k">End</div>
                <div className="kv__v">{new Date(r.meeting.endTime).toLocaleString()}</div>
                <div className="kv__k">Status</div>
                <div className="kv__v">
                  <span className="pill">{r.meeting.status}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <h2>Consultant</h2>
              {r.consultant ? (
                <div className="kv">
                  <div className="kv__k">Name</div>
                  <div className="kv__v">{r.consultant.name}</div>
                  <div className="kv__k">Email</div>
                  <div className="kv__v">{r.consultant.email}</div>
                  <div className="kv__k">Role</div>
                  <div className="kv__v">{r.consultant.role}</div>
                </div>
              ) : (
                <div className="muted">No consultant assigned.</div>
              )}
            </div>
          </div>

          {r.summary ? (
            <div className="card" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(17,24,39,0.5))", borderLeft: "4px solid var(--accent)" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 800, marginBottom: 12, color: "var(--accent)" }}>Meeting Summary</h2>
              <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.75, color: "var(--text-main)" }}>
                {r.summary.replace(/\*\*/g, "").replace(/^\s*[-–]\s*/gm, "").replace(/\s+/g, " ").trim()}
              </p>
            </div>
          ) : null}

          {renderKpiShowcase()}
          {renderScoreBasis()}
          {renderCriticalGaps()}
          {renderImprovementPlan()}

          {/* Pros & Cons — dimension-labeled */}
          <div className="grid grid--2">
            <div className="card">
              <h2 style={{ marginBottom: 14 }}>What Went Well</h2>
              {r.pros?.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {parseDimPrefixed(r.pros).map((item, idx) => {
                    // Parse inline quote: "Dimension: title — 'quote'"
                    const quoteMatch = item.text.match(/^(.*?)\s+[—–-]+\s+'(.+)'$/);
                    const title = quoteMatch ? quoteMatch[1].trim() : item.text;
                    const quote = quoteMatch ? quoteMatch[2].trim() : null;
                    return (
                      <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ color: "#4ade80", fontWeight: 800, fontSize: "1rem", lineHeight: 1.4, flexShrink: 0 }}>&#10003;</span>
                        <div style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "var(--text-muted)" }}>
                          {item.dim !== "General" && (
                            <span style={{ fontWeight: 700, color: "var(--text-main)", marginRight: 4 }}>{item.dim}:</span>
                          )}
                          {title}
                          {quote && (
                            <div style={{ marginTop: 4, fontSize: "0.77rem", fontStyle: "italic", color: "var(--text-muted)", borderLeft: "2px solid rgba(74,222,128,0.4)", paddingLeft: 8, lineHeight: 1.5, opacity: 0.85 }}>
                              &ldquo;{quote}&rdquo;
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="muted">No pros recorded.</div>}
            </div>
            <div className="card">
              <h2 style={{ marginBottom: 14 }}>What Went Wrong</h2>
              {r.cons?.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {r.cons.map((item, idx) => {
                    // New object format
                    if (item && typeof item === "object") {
                      return (
                        <div key={idx} style={{ borderRadius: 8, border: "1px solid rgba(248,113,113,0.18)", overflow: "hidden" }}>
                          <div style={{ padding: "8px 12px", background: "rgba(248,113,113,0.06)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ color: "#f87171", fontWeight: 800, fontSize: "0.95rem", flexShrink: 0 }}>&#10007;</span>
                            {item.dimension && <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.12)", borderRadius: 99, padding: "2px 8px", border: "1px solid rgba(248,113,113,0.25)" }}>{item.dimension}</span>}
                            {item.kpi && <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-main)" }}>{item.kpi}</span>}
                          </div>
                          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                            {item.explanation && <div style={{ fontSize: "0.84rem", color: "var(--text-muted)", lineHeight: 1.55 }}>{item.explanation}</div>}
                            {item.quote && (
                              <div style={{ fontSize: "0.77rem", fontStyle: "italic", color: "var(--text-muted)", borderLeft: "2px solid rgba(248,113,113,0.35)", paddingLeft: 8, lineHeight: 1.5, opacity: 0.85 }}>
                                &ldquo;{item.quote}&rdquo;
                              </div>
                            )}
                            {item.suggestion && (
                              <div style={{ fontSize: "0.8rem", color: "#38bdf8", background: "rgba(56,189,248,0.06)", borderRadius: 6, padding: "6px 10px", border: "1px solid rgba(56,189,248,0.15)", lineHeight: 1.5 }}>
                                <span style={{ fontWeight: 700 }}>Suggestion: </span>{item.suggestion}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    // Backward-compat string format
                    const parsed = parseDimPrefixed([item])[0];
                    return (
                      <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ color: "#f87171", fontWeight: 800, fontSize: "1rem", lineHeight: 1.4, flexShrink: 0 }}>&#10007;</span>
                        <div style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "var(--text-muted)" }}>
                          {parsed.dim !== "General" && <span style={{ fontWeight: 700, color: "var(--text-main)", marginRight: 4 }}>{parsed.dim}:</span>}
                          {parsed.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="muted">No cons recorded.</div>}
            </div>
          </div>

          {/* Complete Analysis */}
          <div className="card">
            <div className="card__head">
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 800 }}>Complete Analysis</h2>
                <p className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>Overall deal summary and momentum assessment</p>
              </div>
              <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Sentiment</div>
                  <div style={{ fontWeight: 800, color: sMeta.color }}>{sMeta.label}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Questions</div>
                  <div style={{ fontWeight: 800 }}>{r.questionsCount ?? 0}</div>
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: "0.93rem", lineHeight: 1.75, color: "var(--text-main)" }}>
              {(r.demoQualityEvaluation || r.summary || "").split("**").join("").trim()}
            </p>
          </div>

                    <div className="card">
            <div className="card__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Transcript</h2>
              <button 
                className="btn btn--sm" 
                onClick={() => setState(s => ({ ...s, showTranscript: !s.showTranscript }))}
              >
                {state.showTranscript ? "Hide Full Transcript" : "Show Full Transcript"}
              </button>
            </div>
            {r.transcript?.transcriptText ? (
              state.showTranscript ? (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    background: "var(--surface-1)",
                    padding: 16,
                    borderRadius: 8,
                    marginTop: 12,
                    fontSize: "0.9rem",
                    lineHeight: 1.6
                  }}
                >
                  {r.transcript.transcriptText}
                </pre>
              ) : (
                <div className="muted" style={{ marginTop: 8 }}>
                  Transcript is available but hidden. Click "Show Full Transcript" to view it.
                </div>
              )
            ) : (
              <>
                <p className="muted" style={{ marginTop: 8 }}>
                  Transcript is not stored for this demo yet. If transcription was enabled in Teams, the system will fetch it automatically after the meeting ends and generate the full analysis.
                </p>
                {state.fetchingTranscript ? (
                  <div className="muted" style={{ marginTop: 12 }}>
                    Fetching transcript automatically...
                  </div>
                ) : null}
              </>
            )}
            {state.transcriptError ? (
              <div className="alert" style={{ marginTop: 12 }}>
                {state.transcriptError}
              </div>
            ) : null}
          </div>

          {Array.isArray(r.qaPairs) && r.qaPairs.length ? (
            <div className="card">
              <div className="card__head">
                <h2>Client Q&A</h2>
                <span className="muted">Questions with consultant answers and tips</span>
              </div>

              <div className="grid" style={{ gap: 14 }}>
                {r.qaPairs.map((qa, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: "1px solid var(--card-border)",
                      borderRadius: 16,
                      padding: 16,
                      background: "var(--surface-1)"
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <div className="pill" style={{ color: "var(--text-main)" }}>
                        Q{idx + 1}
                      </div>
                      <div style={{ fontWeight: 700 }}>{qa?.question || "-"}</div>
                    </div>
                    <div className="muted" style={{ marginTop: 10 }}>
                      <span style={{ fontWeight: 700, color: "var(--text-main)" }}>Answer: </span>
                      {qa?.answer || "-"}
                    </div>
                    {qa?.tip ? (
                      <div className="muted" style={{ marginTop: 10 }}>
                        <span style={{ fontWeight: 700, color: "var(--text-main)" }}>Tip: </span>
                        {qa.tip}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}


        </>
      ) : null}
    </div>
  );
}
