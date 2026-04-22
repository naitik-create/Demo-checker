import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiUploadFile } from "../api/client.js";
import KpiCard from "../components/KpiCard.jsx";
import {
  Line,
  LineChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

function scoreOrNull(s) {
  if (!s) return null;
  return typeof s.totalScore === "number" ? s.totalScore : null;
}

function toDateStr(d) {
  return d.toISOString().split("T")[0];
}

export default function ManagerDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState(() => toDateStr(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState(() => toDateStr(new Date(Date.now() + 7 * 86400000)));

  const [state, setState] = useState({
    loading: true,
    error: "",
    syncing: false,
    meetings: [],
    consultants: [],
    consultantForm: { name: "", email: "" },
    manualAnalysis: { script: "", consultantId: "", loading: false, error: "", result: null },
    videoAnalysis: { file: null, consultantId: "", loading: false, error: "", result: null, progress: "" }
  });

  async function loadMeetings() {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const meetingsRes = await apiFetch("/api/meetings", { auth: true });
      setState((s) => ({ ...s, loading: false, meetings: meetingsRes.meetings || [] }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || "Failed to load meetings", meetings: [] }));
    }
  }

  async function loadConsultants() {
    try {
      const res = await apiFetch("/api/consultants", { auth: true });
      setState((s) => ({ ...s, consultants: res.consultants || [] }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to load consultants" }));
    }
  }

  useEffect(() => {
    loadMeetings();
    loadConsultants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSync() {
    setState((s) => ({ ...s, syncing: true, error: "" }));
    try {
      await apiFetch("/api/meetings/sync", { auth: true });
      await loadMeetings();
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Sync failed" }));
    } finally {
      setState((s) => ({ ...s, syncing: false }));
    }
  }

  async function onRunWorkflow() {
    setState((s) => ({ ...s, syncing: true, error: "" }));
    try {
      await apiFetch("/api/workflows/demo-monitoring/run", { method: "POST", auth: true, body: { maxMeetingsToProcess: 10 } });
      await loadMeetings();
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Workflow failed" }));
    } finally {
      setState((s) => ({ ...s, syncing: false }));
    }
  }

  async function onCreateConsultant(e) {
    e.preventDefault();
    setState((s) => ({ ...s, error: "" }));
    try {
      await apiFetch("/api/consultants", { method: "POST", auth: true, body: state.consultantForm });
      setState((s) => ({ ...s, consultantForm: { name: "", email: "" } }));
      await loadConsultants();
    } catch (e2) {
      setState((s) => ({ ...s, error: e2.message || "Failed to create consultant" }));
    }
  }

  async function onConnectConsultantTeams(consultantId) {
    setState((s) => ({ ...s, error: "" }));
    try {
      const res = await apiFetch(`/api/teams/consultants/${consultantId}/connect-url`, { auth: true });
      const url = res?.url;
      if (url && typeof url === "string") {
        window.location.assign(url);
      } else {
        setState((s) => ({ ...s, error: "Invalid response from server" }));
      }
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to start Teams connect" }));
    }
  }

  async function onManualAnalysis(e) {
    e.preventDefault();
    const { script, consultantId } = state.manualAnalysis;
    if (!script || !consultantId) return;

    setState((s) => ({ ...s, error: "", manualAnalysis: { ...s.manualAnalysis, loading: true, error: "", result: null } }));
    try {
      const res = await apiFetch("/api/analysis-reports/manual-script", {
        method: "POST",
        auth: true,
        body: { script, consultantId }
      });
      setState((s) => ({ ...s, manualAnalysis: { ...s.manualAnalysis, loading: false, result: res } }));
      await loadMeetings(); // refresh meetings list
    } catch (e2) {
      setState((s) => ({ ...s, manualAnalysis: { ...s.manualAnalysis, loading: false, error: e2.message || "Manual analysis failed" } }));
    }
  }

  async function onVideoUpload(e) {
    e.preventDefault();
    const { file, consultantId } = state.videoAnalysis;
    if (!file || !consultantId) return;

    setState((s) => ({ ...s, videoAnalysis: { ...s.videoAnalysis, loading: true, error: "", result: null, progress: "Uploading & transcribing video..." } }));
    try {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("consultantId", consultantId);
      const res = await apiUploadFile("/api/analysis-reports/upload-video", fd);
      setState((s) => ({ ...s, videoAnalysis: { ...s.videoAnalysis, loading: false, result: res, progress: "" } }));
      await loadMeetings();
    } catch (e2) {
      setState((s) => ({ ...s, videoAnalysis: { ...s.videoAnalysis, loading: false, error: e2.message || "Video analysis failed", progress: "" } }));
    }
  }

  const stats = useMemo(() => {
    const totalDemos = state.meetings.length;
    const scores = state.meetings.map((m) => scoreOrNull(m.score)).filter((n) => n !== null);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { totalDemos, avgScore };
  }, [state.meetings]);

  const trendData = useMemo(() => {
    const sorted = state.meetings
      .slice()
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return sorted.slice(-20).map((m) => ({
      date: new Date(m.startTime).toLocaleDateString(),
      total: scoreOrNull(m.score) ?? 0
    }));
  }, [state.meetings]);

  return (
    <div className="page">
      <div className="header">
        <h1>Manager Dashboard</h1>
        <p>Organization-level view of demos, quality, and outcomes.</p>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}

      <div className="grid grid--kpis">
        <KpiCard label="Total demos" value={stats.totalDemos} />
        <KpiCard label="Average score" value={stats.avgScore} hint="out of 100" />
        <div className="kpi kpi--actions">
          <div className="kpi__label">Automation</div>
          <button className="btn" onClick={onSync} disabled={state.syncing}>
            {state.syncing ? "Working..." : "Sync meetings"}
          </button>
          <button className="btn btn--ghost" onClick={onRunWorkflow} disabled={state.syncing}>
            Run monitoring workflow
          </button>
          <div className="kpi__hint">Sync → detect ended → recording → transcript → analysis → score</div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Performance trend</h2>
          <span className="muted">Last 20 demos</span>
        </div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={trendData}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" name="Total score" stroke="rgba(122,255,196,0.95)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Consultants</h2>
          <span className="muted">Create consultants and connect Microsoft Teams</span>
        </div>

        <form className="form" onSubmit={onCreateConsultant}>
          <div className="grid grid--2" style={{ marginTop: 10 }}>
            <label className="field">
              <div className="field__label">Consultant name</div>
              <input
                className="input"
                value={state.consultantForm.name}
                onChange={(e) => setState((s) => ({ ...s, consultantForm: { ...s.consultantForm, name: e.target.value } }))}
                placeholder="Consultant name"
                required
              />
            </label>
            <label className="field">
              <div className="field__label">Consultant email (Teams)</div>
              <input
                className="input"
                value={state.consultantForm.email}
                onChange={(e) => setState((s) => ({ ...s, consultantForm: { ...s.consultantForm, email: e.target.value } }))}
                placeholder="consultant@company.com"
                required
              />
            </label>
          </div>
          <button className="btn" type="submit">
            Add consultant
          </button>
        </form>

        <div className="table">
          <div className="table__row table__row--head">
            <div>Name</div>
            <div>Email</div>
            <div>Teams</div>
            <div></div>
            <div></div>
          </div>
          {state.consultants.map((c) => (
            <div key={c.id} className="table__row">
              <div className="ellipsis">{c.name}</div>
              <div className="muted">{c.email}</div>
              <div className="pill">{c.teamsConnected ? "connected" : "not connected"}</div>
              <div>
                <button className="btn btn--ghost" onClick={() => onConnectConsultantTeams(c.id)} type="button">
                  Connect Teams
                </button>
              </div>
              <div>
                <Link className="link" to={`/consultants/${c.id}`}>
                  View
                </Link>
              </div>
            </div>
          ))}
          {!state.consultants.length ? (
            <div className="muted" style={{ padding: 12 }}>
              No consultants yet.
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Manual Script Analysis</h2>
          <span className="muted">Generate AI breakdown without a live demo</span>
        </div>
        <form className="form" onSubmit={onManualAnalysis}>
          <div className="grid grid--2">
            <label className="field">
              <div className="field__label">Select Consultant</div>
              <select 
                className="input" 
                value={state.manualAnalysis.consultantId} 
                onChange={(e) => setState(s => ({...s, manualAnalysis: {...s.manualAnalysis, consultantId: e.target.value}}))}
                required
              >
                <option value="">-- Choose a consultant --</option>
                {state.consultants.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div />
          </div>
          <label className="field">
             <div className="field__label">Demo Transcript / Script</div>
             <textarea 
               className="input" 
               rows="5"
               placeholder="Paste the full demo conversation here..."
               value={state.manualAnalysis.script}
               onChange={(e) => setState(s => ({...s, manualAnalysis: {...s.manualAnalysis, script: e.target.value}}))}
               required
             />
          </label>
          {state.manualAnalysis.error && <div className="alert">{state.manualAnalysis.error}</div>}
          <button type="submit" className="btn" disabled={state.manualAnalysis.loading}>
            {state.manualAnalysis.loading ? "Analyzing..." : "Analyze Script"}
          </button>
        </form>

        {state.manualAnalysis.result && (
          <div className="card" style={{marginTop: 20, background: 'rgba(56, 189, 248, 0.05)', borderColor: 'rgba(56, 189, 248, 0.3)'}}>
             <h3 style={{marginTop: 0, marginBottom: 15, color: 'var(--text-accent)'}}>Analysis Result</h3>
             
             <div className="grid grid--kpis" style={{marginBottom: 20}}>
               <div className="kpi">
                 <div className="kpi__label">Client Name</div>
                 <div className="kpi__value" style={{fontSize: '1.5rem'}}>{state.manualAnalysis.result.analysis?.clientName || "Unknown"}</div>
               </div>
               <div className="kpi">
                 <div className="kpi__label">Overall Score</div>
                 <div className="kpi__value" style={{color: 'var(--success-text)'}}>{state.manualAnalysis.result.scores?.totalScore || 0}</div>
               </div>
             </div>

             <div className="grid grid--2">
               <div>
                 <h4 style={{marginTop:0, marginBottom: 10}}>Pros</h4>
                 <ul style={{margin: 0, paddingLeft: 20}}>
                   {state.manualAnalysis.result.analysis?.pros?.map((p, i) => <li key={i}>{p}</li>) || <li>None</li>}
                 </ul>
               </div>
               <div>
                 <h4 style={{marginTop:0, marginBottom: 10}}>Cons</h4>
                 <ul style={{margin: 0, paddingLeft: 20}}>
                   {state.manualAnalysis.result.analysis?.cons?.map((c, i) => <li key={i}>{c}</li>) || <li>None</li>}
                 </ul>
               </div>
             </div>
             
             <div style={{marginTop: 20}}>
               <h4 style={{marginTop:0, marginBottom: 10, color: 'var(--text-accent)'}}>Tips for Consultant</h4>
               <ul style={{margin: 0, paddingLeft: 20, background: 'rgba(0,0,0,0.2)', padding: '15px 15px 15px 35px', borderRadius: 8}}>
                 {state.manualAnalysis.result.analysis?.tips?.map((t, i) => <li key={i}>{t}</li>) || <li>None</li>}
               </ul>
             </div>
          </div>
        )}
      </div>

      {/* ─── Video Upload Analysis ─── */}
      <div className="card">
        <div className="card__head">
          <h2>📹 Upload Video / Audio for Analysis</h2>
          <span className="muted">Upload a demo meeting recording — AI transcribes & analyzes it automatically</span>
        </div>
        <form className="form" onSubmit={onVideoUpload}>
          <div className="grid grid--2">
            <label className="field">
              <div className="field__label">Select Consultant</div>
              <select
                className="input"
                value={state.videoAnalysis.consultantId}
                onChange={(e) => setState(s => ({ ...s, videoAnalysis: { ...s.videoAnalysis, consultantId: e.target.value } }))}
                required
              >
                <option value="">-- Choose a consultant --</option>
                {state.consultants.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field">
              <div className="field__label">Video / Audio File</div>
              <input
                type="file"
                className="input"
                accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm"
                onChange={(e) => setState(s => ({ ...s, videoAnalysis: { ...s.videoAnalysis, file: e.target.files?.[0] || null } }))}
                required
              />
              {state.videoAnalysis.file && (
                <div className="muted" style={{ marginTop: 6, fontSize: '0.8rem' }}>
                  📁 {state.videoAnalysis.file.name} ({(state.videoAnalysis.file.size / (1024 * 1024)).toFixed(1)} MB)
                </div>
              )}
            </label>
          </div>
          {state.videoAnalysis.progress && (
            <div style={{ padding: '10px 14px', background: 'rgba(56, 189, 248, 0.08)', borderRadius: 8, color: 'var(--text-accent)', marginTop: 8 }}>
              ⏳ {state.videoAnalysis.progress}
            </div>
          )}
          {state.videoAnalysis.error && <div className="alert">{state.videoAnalysis.error}</div>}
          <button type="submit" className="btn" disabled={state.videoAnalysis.loading}>
            {state.videoAnalysis.loading ? "Processing..." : "Analyze Recording"}
          </button>
        </form>

        {state.videoAnalysis.result && (
          <div className="card" style={{ marginTop: 20, background: 'rgba(56, 189, 248, 0.05)', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 15, color: 'var(--text-accent)' }}>🎯 Video Analysis Result</h3>
            <div className="grid grid--kpis" style={{ marginBottom: 20 }}>
              <div className="kpi">
                <div className="kpi__label">Client Name</div>
                <div className="kpi__value" style={{ fontSize: '1.5rem' }}>{state.videoAnalysis.result.analysis?.clientName || "Unknown"}</div>
              </div>
              <div className="kpi">
                <div className="kpi__label">Score</div>
                <div className="kpi__value" style={{ color: 'var(--success-text)' }}>{state.videoAnalysis.result.scores?.totalScore ?? "—"}</div>
              </div>
            </div>
            <div className="grid grid--2">
              <div>
                <h4 style={{ marginTop: 0 }}>✅ Pros</h4>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {state.videoAnalysis.result.analysis?.pros?.map((p, i) => <li key={i}>{p}</li>) || <li>None</li>}
                </ul>
              </div>
              <div>
                <h4 style={{ marginTop: 0 }}>⚠️ Cons</h4>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {state.videoAnalysis.result.analysis?.cons?.map((c, i) => <li key={i}>{c}</li>) || <li>None</li>}
                </ul>
              </div>
            </div>
            {state.videoAnalysis.result.analysis?.tips?.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h4 style={{ marginTop: 0, color: 'var(--text-accent)' }}>💡 Tips for Consultant</h4>
                <ul style={{ margin: 0, paddingLeft: 20, background: 'rgba(0,0,0,0.2)', padding: '15px 15px 15px 35px', borderRadius: 8 }}>
                  {state.videoAnalysis.result.analysis.tips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
            {state.videoAnalysis.result.transcript && (
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem' }}>📝 View transcript</summary>
                <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: '0.8rem', opacity: 0.8 }}>{state.videoAnalysis.result.transcript}</pre>
              </details>
            )}
            <div style={{ marginTop: 12 }}>
              <Link className="link" to={`/meetings/${state.videoAnalysis.result.meeting?.id}/report`}>
                → View Full Meeting Report
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card__head" style={{flexWrap: "wrap", gap: 10}}>
          <div>
            <h2>Demo reports</h2>
            <span className="muted">Meeting summary, pros/cons, and scoring</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <input type="text" className="input" placeholder="Search title or consultant..." style={{padding:"4px 8px",fontSize:"0.82rem",width:200}} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <label style={{display:"flex",alignItems:"center",gap:4,fontSize:"0.82rem",color:"var(--text-muted)"}}>
              From
              <input type="date" className="input" style={{padding:"4px 8px",fontSize:"0.82rem",width:140}} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </label>
            <label style={{display:"flex",alignItems:"center",gap:4,fontSize:"0.82rem",color:"var(--text-muted)"}}>
              To
              <input type="date" className="input" style={{padding:"4px 8px",fontSize:"0.82rem",width:140}} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="table">
          <div className="table__row table__row--head">
            <div>Title</div>
            <div>Consultant</div>
            <div>Start</div>
            <div>Score</div>
            <div></div>
          </div>
          {(() => {
            const from = new Date(dateFrom);
            from.setHours(0,0,0,0);
            const to = new Date(dateTo);
            to.setHours(23,59,59,999);
            const q = searchTerm.toLowerCase().trim();
            const filtered = state.meetings.filter(m => {
              const s = new Date(m.startTime);
              if (s < from || s > to) return false;
              if (q) {
                 const title = (m.title||"").toLowerCase();
                 const cName = (m.consultant?.name||"").toLowerCase();
                 if (!title.includes(q) && !cName.includes(q)) return false;
              }
              return true;
            });

            if (!filtered.length && !state.loading) {
               return <div className="muted" style={{ padding: 12 }}>No meetings found.</div>;
            }

            return filtered.map((m) => (
              <div key={m.id} className="table__row">
                <div className="ellipsis">{m.title}</div>
                <div className="muted">{m.consultant?.name || "—"}</div>
                <div className="muted">{new Date(m.startTime).toLocaleString()}</div>
                <div>{scoreOrNull(m.score) ?? "—"}</div>
                <div>
                  <Link className="link" to={`/reports/${m.id}`}>
                    View report
                  </Link>
                </div>
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}

