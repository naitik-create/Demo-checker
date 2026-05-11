import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { parseTranscriptFile } from "../utils/transcriptParser.js";
import ManagerSubNav from "../components/ManagerSubNav.jsx";

function truncate(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

export default function ManualScriptAnalysisPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    consultantId: "",
    productName: "ServiceOps",
    script: ""
  });
  const [state, setState] = useState({
    loading: false,
    error: "",
    consultantsLoading: false,
    reportsLoading: false,
    consultants: [],
    reports: []
  });
  const [uploadedFile, setUploadedFile] = useState(null); // { name, error }
  const [fileLoading, setFileLoading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLoading(true);
    setUploadedFile(null);
    try {
      const text = await parseTranscriptFile(file);
      if (!text || text.trim().length < 50) throw new Error("File is too short or empty.");
      setForm((curr) => ({ ...curr, script: text }));
      setUploadedFile({ name: file.name, error: null });
    } catch (err) {
      setUploadedFile({ name: file.name, error: err.message || "Could not read file." });
    } finally {
      setFileLoading(false);
      e.target.value = "";
    }
  }

  const canPickConsultant = useMemo(
    () => user?.role === "manager" || user?.role === "admin",
    [user?.role]
  );

  useEffect(() => {
    let alive = true;

    async function loadContext() {
      setState((s) => ({
        ...s,
        consultantsLoading: canPickConsultant,
        reportsLoading: true,
        error: ""
      }));

      try {
        const requests = [
          apiFetch("/api/reports/manual-scripts?limit=8", { auth: true })
        ];
        if (canPickConsultant) {
          requests.unshift(apiFetch("/api/consultants", { auth: true }));
        }

        const responses = await Promise.all(requests);
        if (!alive) return;

        const consultantsRes = canPickConsultant ? responses[0] : { consultants: [] };
        const reportsRes = canPickConsultant ? responses[1] : responses[0];
        const consultants = consultantsRes.consultants || [];

        setState((s) => ({
          ...s,
          consultantsLoading: false,
          reportsLoading: false,
          consultants,
          reports: reportsRes.reports || []
        }));

        if (canPickConsultant && consultants.length === 1) {
          setForm((current) => ({
            ...current,
            consultantId: current.consultantId || consultants[0].id
          }));
        }
      } catch (err) {
        if (!alive) return;
        setState((s) => ({
          ...s,
          consultantsLoading: false,
          reportsLoading: false,
          error: err.message || "Failed to load manual analysis workspace"
        }));
      }
    }

    loadContext();
    return () => {
      alive = false;
    };
  }, [canPickConsultant]);

  async function onSubmit(e) {
    e.preventDefault();
    setState((s) => ({ ...s, loading: true, error: "" }));

    try {
      const payload = {
        title: form.title,
        productName: form.productName,
        script: form.script
      };
      if (canPickConsultant) {
        if (!form.consultantId) {
          throw new Error("Please select a consultant for this manual analysis.");
        }
        payload.consultantId = form.consultantId;
      }

      const res = await apiFetch("/api/analysis-reports/manual-script", {
        method: "POST",
        auth: true,
        body: payload
      });

      const meetingId = res?.meeting?.id;
      if (!meetingId) throw new Error("Report was created but meetingId is missing");
      navigate(`/reports/${meetingId}`, { replace: true });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || "Failed to analyze transcript" }));
      return;
    }

    setState((s) => ({ ...s, loading: false, error: "" }));
  }

  return (
    <div className="page">
      <ManagerSubNav />

      <div className="page-header">
        <h1>Manual Transcript Analysis</h1>
        <p>Paste a transcript, generate the AI analysis with KPI scores, then download the final report as PDF from the report page.</p>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}

      <div className="grid grid--2">
        <div className="card">
          <div className="card__head">
            <h2>New Analysis</h2>
            <span className="muted">
              {canPickConsultant ? "Create a report for any consultant" : "Create a report for your own account"}
            </span>
          </div>

          <form className="form" onSubmit={onSubmit}>
            {canPickConsultant ? (
              <label className="field">
                <div className="field__label">Consultant</div>
                <select
                  className="input"
                  value={form.consultantId}
                  onChange={(e) => setForm((current) => ({ ...current, consultantId: e.target.value }))}
                  disabled={state.consultantsLoading || state.loading}
                  required
                >
                  <option value="">Select consultant</option>
                  {state.consultants.map((consultant) => (
                    <option key={consultant.id} value={consultant.id}>
                      {consultant.name} ({consultant.email})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="field">
              <div className="field__label">Report Title</div>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                placeholder="e.g. Product Demo - ACME"
              />
            </label>

            <label className="field">
              <div className="field__label">Product Lens</div>
              <select
                className="input"
                value={form.productName}
                onChange={(e) => setForm((current) => ({ ...current, productName: e.target.value }))}
                disabled={state.loading}
              >
                <option value="ServiceOps">ServiceOps (ITSM)</option>
                <option value="ObserveOps">ObserveOps (AIOps)</option>
              </select>
            </label>

            <div className="field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div className="field__label" style={{ margin: 0 }}>Transcript</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {uploadedFile && !uploadedFile.error && (
                    <span style={{ fontSize: "0.75rem", color: "#4ade80", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ opacity: 0.7 }}>File:</span> {uploadedFile.name}
                      <button type="button" onClick={() => { setUploadedFile(null); setForm((c) => ({ ...c, script: "" })); }}
                        style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.8rem", padding: "0 2px" }}>x</button>
                    </span>
                  )}
                  {uploadedFile?.error && (
                    <span style={{ fontSize: "0.75rem", color: "#f87171" }}>{uploadedFile.error}</span>
                  )}
                  <input ref={fileInputRef} type="file" accept=".txt,.srt,.json,.docx,.doc" style={{ display: "none" }} onChange={handleFileChange} />
                  <button type="button" className="btn btn--ghost" disabled={fileLoading || state.loading}
                    onClick={() => fileInputRef.current?.click()}
                    style={{ padding: "4px 12px", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 6 }}>
                    {fileLoading ? "Reading..." : "Upload File"}
                  </button>
                </div>
              </div>
              <textarea
                className="input"
                value={form.script}
                onChange={(e) => setForm((current) => ({ ...current, script: e.target.value }))}
                placeholder="Paste the full transcript here, or use Upload File above (.txt .srt .json .docx)..."
                required
                style={{ minHeight: 260 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <div className="kpi kpi--blue">
                <div className="kpi__label">Transcript Size</div>
                <div className="kpi__value kpi__value--blue">{form.script.trim() ? form.script.trim().split(/\s+/).length : 0}</div>
                <div className="kpi__hint">words pasted</div>
              </div>
              <div className="kpi kpi--purple">
                <div className="kpi__label">Consultants</div>
                <div className="kpi__value kpi__value--purple">{canPickConsultant ? state.consultants.length : 1}</div>
                <div className="kpi__hint">available in portal</div>
              </div>
              <div className="kpi kpi--green">
                <div className="kpi__label">Recent Reports</div>
                <div className="kpi__value kpi__value--green">{state.reports.length}</div>
                <div className="kpi__hint">shown below</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={state.loading}
                onClick={() => setForm((current) => ({ ...current, title: "", productName: "ServiceOps", script: "" }))}
              >
                Clear
              </button>
              <button className="btn" disabled={state.loading || state.consultantsLoading} type="submit">
                {state.loading ? "Analyzing..." : "Generate Analysis"}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card__head">
            <h2>How It Works</h2>
            <span className="muted">Manager flow</span>
          </div>

          <div className="grid" style={{ gap: 12 }}>
            <div className="kpi kpi--blue">
              <div className="kpi__label">1. Paste Transcript</div>
              <div className="kpi__hint">Use the meeting transcript or demo script exactly as spoken.</div>
            </div>
            <div className="kpi kpi--purple">
              <div className="kpi__label">2. Pick Product Lens</div>
              <div className="kpi__hint">Choose ServiceOps or ObserveOps so the scorecard uses the right KPI expectations, buyer questions, and coaching logic.</div>
            </div>
            <div className="kpi kpi--green">
              <div className="kpi__label">3. Generate AI Analysis</div>
              <div className="kpi__hint">The system saves summary, pros, cons, sentiment, questions, coaching tips, and product-aware KPI scores.</div>
            </div>
            <div className="kpi kpi--orange">
              <div className="kpi__label">4. Open Report & PDF</div>
              <div className="kpi__hint">You are redirected to the report with product-specific KPI scorecards, discovery questions, coaching detail, and PDF export.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <h2>Recent Manual Analysis Reports</h2>
          <span className="muted">Latest manager-created transcript analyses</span>
        </div>

        {state.reportsLoading ? (
          <div className="muted" style={{ padding: 12 }}>Loading reports...</div>
        ) : (
          <div className="table">
            <div className="table__row table__row--head" style={{ gridTemplateColumns: "2fr 1.4fr 0.9fr 0.8fr 0.8fr" }}>
              <div>Title</div>
              <div>Consultant</div>
              <div>Client</div>
              <div>Score</div>
              <div></div>
            </div>

            {state.reports.map((report) => (
              <div key={report.meetingId} className="table__row" style={{ gridTemplateColumns: "2fr 1.4fr 0.9fr 0.8fr 0.8fr" }}>
                <div className="ellipsis">
                  <div style={{ fontWeight: 700 }}>{report.title || "Manual Script Analysis"}</div>
                  <div className="muted">{truncate(report.summary, 90) || "-"}</div>
                </div>
                <div className="muted">{report.consultant?.name || "-"}</div>
                <div className="muted">{report.clientName || "-"}</div>
                <div>{report.totalScore != null ? `${report.totalScore}/100` : "-"}</div>
                <div style={{ textAlign: "right" }}>
                  <Link className="link" to={`/reports/${report.meetingId}`}>
                    Open
                  </Link>
                </div>
              </div>
            ))}

            {!state.reports.length ? (
              <div className="muted" style={{ padding: 12 }}>
                No manual transcript analysis reports yet.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
