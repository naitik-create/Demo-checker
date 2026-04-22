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
    downloadingPdf: false
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

  function renderKpiShowcase() {
    if (!kpiAssessment) return null;

    const scoredDimensions = kpiAssessment.dimensions.filter((dimension) => !dimension.risk);
    const riskDimension = kpiAssessment.dimensions.find((dimension) => dimension.risk);
    const scoredKpis = scoredDimensions.flatMap((dimension) =>
      dimension.kpis.map((kpi) => ({ ...kpi, dimensionLabel: dimension.label, dimensionTone: dimension.tone }))
    );
    const topStrengths = [...scoredKpis]
      .sort((a, b) => b.score * b.priority - a.score * a.priority)
      .filter((kpi) => kpi.score >= 4)
      .slice(0, 4);
    const topGaps = [...scoredKpis]
      .sort((a, b) => a.score * a.priority - b.score * b.priority)
      .filter((kpi) => kpi.score <= 3)
      .slice(0, 4);
    const activeRisks = riskDimension?.kpis.filter((kpi) => kpi.present) || [];

    return (
      <>
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, rgba(37,99,235,0.14), rgba(124,58,237,0.09) 55%, rgba(15,118,110,0.08))"
          }}
        >
          <div className="card__head">
            <div>
              <h2>{kpiAssessment.productSummary.title}</h2>
              <div className="muted" style={{ marginTop: 6 }}>
                {kpiAssessment.productSummary.summary}
              </div>
            </div>
            <span className="badge badge--purple">{kpiAssessment.productSummary.family}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
            <div className="kpi kpi--blue">
              <div className="kpi__label">Scored Dimensions</div>
              <div className="kpi__value kpi__value--blue">{kpiAssessment.positiveDimensionCount}</div>
              <div className="kpi__hint">Discovery, Rapport, Demo, Objections, Engagement, Close</div>
            </div>
            <div className="kpi kpi--purple">
              <div className="kpi__label">Scored KPIs</div>
              <div className="kpi__value kpi__value--purple">{kpiAssessment.scoredKpis}</div>
              <div className="kpi__hint">Each scored on a 1 to 5 scale</div>
            </div>
            <div className="kpi kpi--green">
              <div className="kpi__label">Weighted Score</div>
              <div className="kpi__value kpi__value--green">{kpiAssessment.weightedScore}</div>
              <div className="kpi__hint">Out of {kpiAssessment.weightedMax} possible weighted points</div>
            </div>
            <div className={`kpi ${kpiAssessment.riskCount ? "kpi--orange" : "kpi--green"}`}>
              <div className="kpi__label">Risk Flags</div>
              <div className="kpi__value" style={{ color: kpiAssessment.riskCount ? "var(--orange)" : "var(--green)" }}>
                {kpiAssessment.riskCount}
              </div>
              <div className="kpi__hint">Each active risk deducts 5 points</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16 }}>
            <div
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 18,
                padding: 18,
                background: "rgba(255,255,255,0.03)"
              }}
            >
              <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Final KPI Score
              </div>
              <div style={{ display: "flex", alignItems: "end", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: "3rem", fontWeight: 800, lineHeight: 1 }}>{kpiAssessment.finalScore}/100</div>
                <KpiPill
                  color={kpiAssessment.finalScore >= 80 ? "var(--green)" : kpiAssessment.finalScore >= 60 ? "var(--accent)" : "var(--orange)"}
                  borderColor={kpiAssessment.finalScore >= 80 ? "rgba(5,150,105,0.35)" : kpiAssessment.finalScore >= 60 ? "rgba(37,99,235,0.35)" : "rgba(245,158,11,0.35)"}
                  background={kpiAssessment.finalScore >= 80 ? "rgba(5,150,105,0.12)" : kpiAssessment.finalScore >= 60 ? "rgba(37,99,235,0.12)" : "rgba(245,158,11,0.12)"}
                >
                  {kpiAssessment.finalScore >= 80 ? "Strong Call" : kpiAssessment.finalScore >= 60 ? "Developing Call" : "Needs Coaching"}
                </KpiPill>
              </div>
              <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
                Final score formula:
                {" "}
                <strong>(Weighted score / {kpiAssessment.weightedMax}) x 100</strong>
                {" "}
                minus
                {" "}
                <strong>{kpiAssessment.riskCount} x 5</strong>
                {" "}
                risk deduction points.
              </div>

              <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Positive performance index</div>
                  <div style={{ height: 12, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${kpiAssessment.weightedPerformance}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: "linear-gradient(90deg, #2563eb, #7c3aed)"
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Risk deduction impact</div>
                  <div style={{ height: 12, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(100, kpiAssessment.riskDeductionPoints)}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: "linear-gradient(90deg, #f59e0b, #dc2626)"
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 18,
                padding: 18,
                background: "rgba(255,255,255,0.03)"
              }}
            >
              <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                Workbook Rating Guide
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { score: 5, label: "Excellent", note: "Fully demonstrated, proactively and with depth" },
                  { score: 4, label: "Good", note: "Clearly addressed with minor gaps" },
                  { score: 3, label: "Average", note: "Partially covered; some key points missed" },
                  { score: 2, label: "Below avg", note: "Attempted but largely ineffective" },
                  { score: 1, label: "Poor", note: "Not attempted or completely ineffective" }
                ].map((row) => (
                  <div
                    key={row.score}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "44px 92px 1fr",
                      gap: 10,
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 12,
                      background: "var(--surface-1)",
                      border: "1px solid var(--card-border)"
                    }}
                  >
                    <div style={{ fontWeight: 800, color: scoreBand(row.score).color }}>{row.score}</div>
                    <div style={{ fontWeight: 700 }}>{row.label}</div>
                    <div className="muted" style={{ fontSize: "0.84rem" }}>{row.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid--2">
          <div className="card">
            <div className="card__head">
              <h2>{kpiAssessment.productProfile.label} Manager Lens</h2>
              <span className="muted">What a strong Motadata demo should prove</span>
            </div>
            <DetailList items={kpiAssessment.productSummary.executiveLens} emptyText="No product lens guidance available." />
          </div>

          <div className="card">
            <div className="card__head">
              <h2>Expected Demo Proof Points</h2>
              <span className="muted">What the manager should expect to see covered</span>
            </div>
            <DetailList items={kpiAssessment.productSummary.demoProofPoints} emptyText="No proof-point guide available." />
          </div>
        </div>

        <div className="grid grid--2">
          <div className="card">
            <div className="card__head">
              <h2>Recommended Discovery Questions</h2>
              <span className="muted">Questionnaire prompts for this product</span>
            </div>
            <DetailList items={kpiAssessment.productSummary.discoveryQuestions} emptyText="No discovery prompts available." />
          </div>

          <div className="card">
            <div className="card__head">
              <h2>What Good Momentum Looks Like</h2>
              <span className="muted">Buying signals for this product motion</span>
            </div>
            <DetailList items={kpiAssessment.productSummary.successSignals} emptyText="No success-signal guide available." />
          </div>
        </div>

        <div className="grid grid--2">
          <div className="card">
            <div className="card__head">
              <h2>Top Strengths</h2>
              <span className="muted">Highest-weighted positives from the call</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {topStrengths.length ? topStrengths.map((kpi) => (
                <div
                  key={kpi.id}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 14,
                    border: "1px solid rgba(5,150,105,0.24)",
                    background: "rgba(5,150,105,0.08)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>{kpi.label}</div>
                    <span className="badge badge--green">{kpi.score}/5 · x{kpi.priority}</span>
                  </div>
                  <div className="muted" style={{ marginTop: 6, lineHeight: 1.55 }}>{kpi.covered?.[0] || kpi.rationale}</div>
                </div>
              )) : <div className="muted">No strong KPI strengths detected yet.</div>}
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h2>Top Coaching Priorities</h2>
              <span className="muted">Areas that most impacted the score</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {topGaps.length ? topGaps.map((kpi) => (
                <div
                  key={kpi.id}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 14,
                    border: "1px solid rgba(245,158,11,0.24)",
                    background: "rgba(245,158,11,0.08)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>{kpi.label}</div>
                    <span className="badge badge--amber">{kpi.score}/5 · x{kpi.priority}</span>
                  </div>
                  <div className="muted" style={{ marginTop: 6, lineHeight: 1.55 }}>{kpi.missing?.[0] || kpi.improper}</div>
                </div>
              )) : <div className="muted">No major KPI coaching gaps detected.</div>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <h2>Dimension Scorecards</h2>
            <span className="muted">Workbook-style category summary before the detailed rubric</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {scoredDimensions.map((dimension) => (
              <div
                key={dimension.id}
                style={{
                  border: "1px solid var(--card-border)",
                  borderRadius: 18,
                  padding: 16,
                  background: "linear-gradient(180deg, var(--surface-1), transparent)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: `${dimension.tone}20`,
                        color: dimension.tone,
                        fontWeight: 700,
                        fontSize: "0.82rem"
                      }}
                    >
                      {dimension.label}
                    </div>
                    <div style={{ fontWeight: 700, marginTop: 10 }}>{dimension.subtitle}</div>
                    <div className="muted" style={{ marginTop: 4, lineHeight: 1.5 }}>{dimension.description}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "2rem", fontWeight: 800 }}>{dimension.averageScore}/5</div>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>{dimension.weightedScore}/{dimension.weightedMax}</div>
                  </div>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", marginTop: 14 }}>
                  <div
                    style={{
                      width: `${(dimension.weightedScore / Math.max(1, dimension.weightedMax)) * 100}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${dimension.tone}, ${dimension.tone}aa)`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <h2>Detailed KPI Rubric</h2>
            <span className="muted">Each KPI scored on the workbook-style 1 to 5 framework with product-specific guidance, evidence, and discovery prompts</span>
          </div>
          <div style={{ display: "grid", gap: 18 }}>
            {scoredDimensions.map((dimension) => (
              <div
                key={dimension.id}
                style={{
                  border: "1px solid var(--card-border)",
                  borderRadius: 20,
                  padding: 18,
                  background: "linear-gradient(180deg, var(--surface-1), transparent)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1rem" }}>{dimension.label}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{dimension.subtitle} · {dimension.description}</div>
                  </div>
                  <span className="badge badge--blue">{dimension.averageScore}/5 average</span>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {dimension.kpis.map((kpi) => {
                    const band = scoreBand(kpi.score);
                    return (
                      <div
                        key={kpi.id}
                        style={{
                          border: "1px solid var(--card-border)",
                          borderRadius: 16,
                          padding: 16,
                          background: "rgba(255,255,255,0.02)"
                        }}
                      >
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) auto auto", gap: 12, alignItems: "start" }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{kpi.label}</div>
                            <div className="muted" style={{ marginTop: 4 }}>{kpi.detail}</div>
                          </div>
                          <span className="badge badge--purple">x{kpi.priority}</span>
                          <KpiPill
                            color={band.color}
                            borderColor={`${band.color}55`}
                            background={`${band.color}20`}
                          >
                            {kpi.score}/5 · {band.label}
                          </KpiPill>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
                          <div
                            style={{
                              padding: "12px 12px",
                              borderRadius: 12,
                              border: "1px solid rgba(37,99,235,0.18)",
                              background: "rgba(37,99,235,0.08)"
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Why this score</div>
                            <div className="muted" style={{ lineHeight: 1.55 }}>{kpi.rationale}</div>
                            {kpi.guide ? (
                              <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
                                <strong>{kpi.guide.label}:</strong> {kpi.guide.definition}
                                <br />
                                <strong>Action:</strong> {kpi.guide.action}
                              </div>
                            ) : null}
                          </div>

                          <div
                            style={{
                              padding: "12px 12px",
                              borderRadius: 12,
                              border: "1px solid rgba(5,150,105,0.18)",
                              background: "rgba(5,150,105,0.08)"
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Proper standard</div>
                            <div className="muted" style={{ lineHeight: 1.55 }}>{kpi.proper}</div>
                            {Array.isArray(kpi.covered) && kpi.covered.length ? (
                              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                                {kpi.covered.slice(0, 3).map((item, index) => (
                                  <div key={index} className="muted" style={{ lineHeight: 1.5 }}>
                                    Covered: {item}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div
                            style={{
                              padding: "12px 12px",
                              borderRadius: 12,
                              border: "1px solid rgba(245,158,11,0.18)",
                              background: "rgba(245,158,11,0.08)"
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Not proper / gap</div>
                            <div className="muted" style={{ lineHeight: 1.55 }}>{kpi.improper}</div>
                            {Array.isArray(kpi.missing) && kpi.missing.length ? (
                              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                                {kpi.missing.slice(0, 3).map((item, index) => (
                                  <div key={index} className="muted" style={{ lineHeight: 1.5 }}>
                                    Gap: {item}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {Array.isArray(kpi.questionnaire) && kpi.questionnaire.length ? (
                              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                                {kpi.questionnaire.slice(0, 2).map((item, index) => (
                                  <div key={index} className="muted" style={{ lineHeight: 1.5 }}>
                                    Manager check: {item}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <h2>Red Flags & Risk Deductions</h2>
            <span className="muted">Separate from the scored KPI matrix and deducted from the final score</span>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {riskDimension?.kpis.map((kpi) => (
              <div
                key={kpi.id}
                style={{
                  border: "1px solid var(--card-border)",
                  borderRadius: 16,
                  padding: 16,
                  background: kpi.present ? "rgba(220,38,38,0.08)" : "rgba(5,150,105,0.06)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{kpi.label}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{kpi.detail}</div>
                  </div>
                  <span className={`badge ${kpi.present ? "badge--red" : "badge--green"}`}>
                    {kpi.present ? "Present · -5" : "Clear"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Proper handling</div>
                    <div className="muted" style={{ lineHeight: 1.55 }}>{kpi.proper}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Current observation</div>
                    <div className="muted" style={{ lineHeight: 1.55 }}>
                      {kpi.covered?.[0] || "No risk observation recorded."}
                    </div>
                    {Array.isArray(kpi.missing) && kpi.missing.length ? (
                      <div className="muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
                        {kpi.missing[0]}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {activeRisks.length ? (
              <div className="alert" style={{ marginTop: 4 }}>
                Total risk deduction applied: {activeRisks.length} flag(s) x 5 points = -{kpiAssessment.riskDeductionPoints}
              </div>
            ) : (
              <div className="alert success" style={{ marginTop: 4 }}>
                No active red-flag deductions were triggered for this call.
              </div>
            )}
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
          {r ? (
            <button className="btn btn--green btn--sm" type="button" onClick={handleDownloadPdf} disabled={state.downloadingPdf}>
              {state.downloadingPdf ? "Generating PDF..." : "Download PDF"}
            </button>
          ) : null}
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

          <div className="card">
            <h2>Meeting Summary</h2>
            <div className="kv" style={{ marginBottom: 16 }}>
              <div className="kv__k">Client Name</div>
              <div className="kv__v" style={{ fontWeight: 600, color: "var(--text-accent)" }}>{r.clientName || "Unknown"}</div>
              <div className="kv__k">Product</div>
              <div className="kv__v" style={{ fontWeight: 600 }}>{r.productName || "Unknown"}</div>
            </div>
            <div className="muted">{r.summary || "-"}</div>
          </div>

          {renderKpiShowcase()}

          <div className="grid grid--2">
            <div className="card">
              <h2>Sentiment Analysis</h2>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: "1.8rem" }}>{sMeta.emoji}</div>
                  <div>
                    <div style={{ fontWeight: 700, color: sMeta.color }}>{sMeta.label}</div>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>
                      Overall meeting tone and client reaction
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, color: sMeta.color, fontSize: "1.1rem" }}>{sMeta.score}/100</div>
                  <div className="muted" style={{ fontSize: "0.78rem" }}>Sentiment rating</div>
                </div>
              </div>

              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(148,163,184,0.2)",
                  overflow: "hidden",
                  marginBottom: 12
                }}
              >
                <div
                  style={{
                    width: `${sMeta.score}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: sMeta.color
                  }}
                />
              </div>

              <div className="muted" style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>
                {qualitySentences.length
                  ? qualitySentences.slice(0, 4).map((p, idx) => <div key={idx}>- {p}</div>)
                  : "Detailed sentiment explanation is not available for this report."}
              </div>

              {sentimentTimeline.length ? (
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>
                    Sentiment timeline
                  </div>
                  {sentimentTimeline.slice(0, 3).map((s, idx) => (
                    <div key={idx} className="muted" style={{ fontSize: "0.86rem" }}>
                      - {s}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="card">
              <h2>Rating & Depth</h2>
              {r.scores ? (
                <div className="kv">
                  <div className="kv__k">Overall quality rating</div>
                  <div className="kv__v">{r.scores.totalScore}/100</div>
                  <div className="kv__k">Communication impact</div>
                  <div className="kv__v">{r.scores.communicationScore}/20</div>
                  <div className="kv__k">Engagement strength</div>
                  <div className="kv__v">{r.scores.engagementScore}/20</div>
                  <div className="kv__k">Structure clarity</div>
                  <div className="kv__v">{r.scores.structureScore}/20</div>
                  <div className="kv__k">Technical confidence</div>
                  <div className="kv__v">{r.scores.technicalScore}/20</div>
                  <div className="kv__k">Q&A handling quality</div>
                  <div className="kv__v">{r.scores.qaScore}/20</div>
                </div>
              ) : (
                <div className="muted">No rating details available yet.</div>
              )}
            </div>
          </div>

          <div className="grid grid--2">
            <div className="card">
              <h2>Context (Point-wise)</h2>
              <DetailList
                items={(contextPoints.length ? contextPoints : summaryBullets).slice(0, 10)}
                emptyText="No context points extracted."
              />
            </div>
            <div className="card">
              <h2>Client Needs (Point-wise)</h2>
              <DetailList
                items={clientNeeds.slice(0, 10)}
                emptyText="Client needs were not explicitly identified. Add clearer requirement discussion in transcript."
              />
            </div>
          </div>

          <div className="grid grid--2">
            <div className="card">
              <h2>Pros</h2>
              <DetailList items={r.pros} emptyText="-" />
            </div>
            <div className="card">
              <h2>Cons</h2>
              <DetailList items={r.cons} emptyText="-" />
            </div>
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <h2>Actionable Tips</h2>
              {r.tips?.length ? (
                <ul style={{ background: "rgba(56, 189, 248, 0.05)", padding: "16px 16px 16px 36px", borderRadius: 12 }}>
                  {r.tips.map((t, idx) => (
                    <li key={idx} style={{ color: "var(--text-accent)" }}>{t}</li>
                  ))}
                </ul>
              ) : (
                <div className="muted">No specific tips.</div>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Complete Analysis</h2>
            <p className="muted" style={{ marginTop: -6 }}>
              Synthesized what happened story from the transcript.
            </p>

            <div className="grid grid--2">
              <div>
                <div className="muted" style={{ fontWeight: 800, marginBottom: 8 }}>
                  What happened
                </div>
                {completeAnalysisItems.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {completeAnalysisItems.slice(0, 8).map((it, idx) => (
                      <li key={idx}>
                        {it.label ? (
                          <>
                            <span style={{ fontWeight: 800 }}>{it.label}:</span> {it.value}
                          </>
                        ) : (
                          it.value
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="muted">No context points available.</div>
                )}
              </div>

              <div>
                <div className="muted" style={{ fontWeight: 800, marginBottom: 8 }}>
                  Coach plan
                </div>
                <DetailList items={Array.isArray(r.tips) ? r.tips.slice(0, 7) : []} emptyText="No coaching tips available." />
              </div>
            </div>

            <div className="muted" style={{ marginTop: 12, lineHeight: 1.6 }}>
              Sentiment:
              {" "}
              <span style={{ color: sMeta.color, fontWeight: 800 }}>
                {sMeta.label}
              </span>
              {" "}· Questions:
              {" "}
              <span style={{ fontWeight: 800 }}>{r.questionsCount ?? 0}</span>
              {" "}· Notes: {r.demoQualityEvaluation || "-"}
            </div>
          </div>

          <div className="card">
            <h2>Scores</h2>
            {r.scores ? (
              <div className="grid grid--kpis">
                <div className="kpi">
                  <div className="kpi__label">Communication</div>
                  <div className="kpi__value">{r.scores.communicationScore}</div>
                  <div className="kpi__hint">out of 20</div>
                </div>
                <div className="kpi">
                  <div className="kpi__label">Engagement</div>
                  <div className="kpi__value">{r.scores.engagementScore}</div>
                  <div className="kpi__hint">out of 20</div>
                </div>
                <div className="kpi">
                  <div className="kpi__label">Structure</div>
                  <div className="kpi__value">{r.scores.structureScore}</div>
                  <div className="kpi__hint">out of 20</div>
                </div>
                <div className="kpi">
                  <div className="kpi__label">Technical</div>
                  <div className="kpi__value">{r.scores.technicalScore}</div>
                  <div className="kpi__hint">out of 20</div>
                </div>
                <div className="kpi">
                  <div className="kpi__label">Q&A</div>
                  <div className="kpi__value">{r.scores.qaScore}</div>
                  <div className="kpi__hint">out of 20</div>
                </div>
                <div className="kpi">
                  <div className="kpi__label">Total</div>
                  <div className="kpi__value">{r.scores.totalScore}</div>
                  <div className="kpi__hint">out of 100</div>
                </div>
              </div>
            ) : (
              <div className="muted">No demo score saved for this meeting.</div>
            )}
          </div>

          <div className="card">
            <div className="card__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Transcript</h2>
            </div>
            {r.transcript?.transcriptText ? (
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

          <div className="card">
            <h2>Client Sentiment & Questions</h2>
            <div className="kv">
              <div className="kv__k">Sentiment</div>
              <div className="kv__v">{r.sentiment || "neutral"}</div>
              <div className="kv__k">Questions count</div>
              <div className="kv__v">{r.questionsCount ?? 0}</div>
              <div className="kv__k">Coaching tips</div>
              <div className="kv__v">{r.demoQualityEvaluation || "-"}</div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
