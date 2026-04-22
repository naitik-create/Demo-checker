import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import {
  Target, Star, Link2, Zap, TrendingUp, LayoutDashboard,
  RefreshCw, CheckCircle, AlertTriangle, UserCheck, Users,
  CalendarDays, FileText, BrainCircuit, Trophy, Activity,
  BriefcaseBusiness, ChevronRight, Map, Search, Eye, CalendarClock
} from "lucide-react";

function scoreOrNull(s) {
  if (!s) return null;
  return typeof s.totalScore === "number" ? s.totalScore : null;
}

function ScoreColor(score) {
  if (score >= 80) return "var(--green)";
  if (score >= 60) return "var(--accent)";
  if (score >= 40) return "var(--orange)";
  return "#f87171";
}

export default function ManagerOverviewPage() {
  const [state, setState] = useState({
    loading: true, error: "", syncMsg: "", syncing: false,
    meetings: [], consultants: []
  });
  const [monSearch, setMonSearch] = useState("");
  const [monFrom, setMonFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [monTo, setMonTo] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0]);

  async function loadData() {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const [meetingsRes, consultantsRes] = await Promise.all([
        apiFetch("/api/meetings", { auth: true }),
        apiFetch("/api/consultants", { auth: true })
      ]);
      setState((s) => ({
        ...s, loading: false,
        meetings: meetingsRes.meetings || [],
        consultants: consultantsRes.consultants || []
      }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || "Failed to load data" }));
    }
  }

  useEffect(() => { loadData(); }, []);

  async function onSync() {
    setState((s) => ({ ...s, syncing: true, error: "", syncMsg: "" }));
    try {
      const res = await apiFetch("/api/meetings/sync", { auth: true });
      const msg = res.message || `Synced ${res.upsertedMeetings ?? 0} meetings (${res.fetched ?? 0} fetched)`;
      setState((s) => ({ ...s, syncMsg: msg }));
      await loadData();
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Sync failed" }));
    } finally {
      setState((s) => ({ ...s, syncing: false }));
    }
  }

  async function onRunWorkflow() {
    setState((s) => ({ ...s, syncing: true, error: "", syncMsg: "" }));
    try {
      const res = await apiFetch("/api/workflows/demo-monitoring/run", {
        method: "POST", auth: true, body: { maxMeetingsToProcess: 10 }
      });
      const msg = `Workflow complete: ${res.processed?.length ?? 0} processed, ${res.skipped?.length ?? 0} skipped`;
      setState((s) => ({ ...s, syncMsg: msg }));
      await loadData();
    } catch (e) {
      const hint = e.message?.includes("403")
        ? "Access denied — make sure you are logged in as Manager."
        : (e.message || "Workflow failed");
      setState((s) => ({ ...s, error: hint }));
    } finally {
      setState((s) => ({ ...s, syncing: false }));
    }
  }

  const stats = useMemo(() => {
    const totalDemos = state.meetings.length;
    const scores = state.meetings.map((m) => scoreOrNull(m.score)).filter((n) => n !== null);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const connectedConsultants = state.consultants.filter((c) => c.teamsConnected).length;
    const totalConsultants = state.consultants.length;
    return { totalDemos, avgScore, connectedConsultants, totalConsultants };
  }, [state.meetings, state.consultants]);

  const trendData = useMemo(() => {
    return state.meetings
      .slice().sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
      .slice(-20).map((m) => ({
        date: new Date(m.startTime).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        Score: scoreOrNull(m.score) ?? 0
      }));
  }, [state.meetings]);

  const recentMeetings = useMemo(
    () =>
      [...state.meetings]
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 5),
    [state.meetings]
  );

  // Monitored meetings with search + date filter
  const monitoredMeetings = useMemo(() => {
    const all = state.meetings.filter(m => m.monitored);
    const from = new Date(monFrom); from.setHours(0,0,0,0);
    const to = new Date(monTo); to.setHours(23,59,59,999);
    const q = monSearch.toLowerCase().trim();
    return all.filter(m => {
      const s = m.startTime ? new Date(m.startTime) : null;
      if (s && (s < from || s > to)) return false;
      if (q && !(m.title || "").toLowerCase().includes(q) && !(m.consultant?.name || "").toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [state.meetings, monSearch, monFrom, monTo]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 style={{display:"flex",alignItems:"center",gap:10}}>Overview <LayoutDashboard size={28} style={{color:"var(--accent)"}}/></h1>
        <p>Organization-wide demo performance across all connected consultants.</p>
      </div>

      {/* Errors & Messages */}
      {state.error && <div className="alert" style={{ marginBottom: 4 }}>{state.error}</div>}
      {state.syncMsg && <div className="alert success" style={{ marginBottom: 4, display:"flex", alignItems:"center", gap:8 }}><CheckCircle size={16}/> {state.syncMsg}</div>}

      {/* ─── KPI Cards ─── */}
      <div className="grid grid--kpis">
        {/* Total Demos */}
        <div className="kpi kpi--blue">
          <div className="kpi__icon kpi__icon--blue"><Target size={24}/></div>
          <div className="kpi__label">Total Demos</div>
          <div className="kpi__value kpi__value--blue">{state.loading ? "—" : stats.totalDemos}</div>
          <div className="kpi__hint">meetings recorded</div>
        </div>

        {/* Avg Score */}
        <div className="kpi kpi--purple">
          <div className="kpi__icon kpi__icon--purple"><Star size={24}/></div>
          <div className="kpi__label">Average Score</div>
          <div className="kpi__value kpi__value--purple" style={{ color: ScoreColor(stats.avgScore) }}>
            {state.loading ? "—" : stats.avgScore}
          </div>
          <div className="kpi__hint">out of 100</div>
        </div>

        {/* Teams Connected */}
        <div className="kpi kpi--green">
          <div className="kpi__icon kpi__icon--green"><UserCheck size={24}/></div>
          <div className="kpi__label">Teams Connected</div>
          <div className="kpi__value kpi__value--green">
            {state.loading ? "—" : `${stats.connectedConsultants}/${stats.totalConsultants}`}
          </div>
          <div className="kpi__hint">consultants</div>
        </div>

        {/* Automation */}
        <div className="kpi kpi--orange">
          <div className="kpi__icon kpi__icon--orange"><Zap size={24}/></div>
          <div className="kpi__label">Auto-Monitor</div>
          <div className="muted" style={{fontSize:"0.75rem", margin:"6px 0 10px"}}>
            Select meetings to monitor → transcripts fetched automatically → AI analysis runs when meeting ends
          </div>

          {/* Step flow mini */}
          <div className="flow-pipeline" style={{ margin: "8px 0" }}>
            {[
              {icon: <CalendarDays size={12}/>, label: "Select"},
              {icon: <FileText size={12}/>, label: "Transcript"},
              {icon: <BrainCircuit size={12}/>, label: "AI"},
              {icon: <Trophy size={12}/>, label: "Score"}
            ].map((step, i, arr) => (
              <div key={step.label} style={{ display: "flex", alignItems: "center" }}>
                <div style={{
                  display:"flex", alignItems:"center", gap:3,
                  padding: "4px 8px",
                  background: "var(--surface-2)",
                  borderRadius: 8,
                  border: "1px solid var(--card-border)",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap"
                }}>{step.icon}{step.label}</div>
                {i < arr.length - 1 && (
                  <ChevronRight size={12} style={{ color: "var(--text-muted)", flexShrink:0 }}/>
                )}
              </div>
            ))}
          </div>

          <button
            className="btn btn--sm"
            onClick={onSync}
            disabled={state.syncing}
            style={{ width: "100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
          >
            <RefreshCw size={14}/> {state.syncing ? "Working…" : "Sync Calendar"}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={onRunWorkflow}
            disabled={state.syncing}
            style={{ width: "100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:6 }}
          >
            <Activity size={14}/> {state.syncing ? "Working…" : "Run Analysis Now"}
          </button>
          <p className="muted" style={{ fontSize: "0.7rem", lineHeight: 1.4, margin: "10px 0 0", textAlign: "center" }}>
            Per-consultant sync: open <strong>Consultants → View</strong> → Teams calendar → <strong>Sync calendar to app</strong>.
            Auto sync all consultants every 5 min: backend <code style={{ fontSize: "0.65rem" }}>ENABLE_CALENDAR_AUTO_SYNC=true</code>.
          </p>
        </div>
      </div>

      {/* Teams Connection Banner */}
      {stats.totalConsultants > 0 && (
        <div className="card" style={{
          padding: "14px 20px",
          background: stats.connectedConsultants === stats.totalConsultants
            ? "linear-gradient(135deg, rgba(52,211,153,0.08), rgba(52,211,153,0.03))"
            : "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(251,191,36,0.03))",
          borderColor: stats.connectedConsultants === stats.totalConsultants
            ? "rgba(52,211,153,0.25)"
            : "rgba(251,191,36,0.25)"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            {stats.connectedConsultants === stats.totalConsultants ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--green)" }}>
                <CheckCircle size={18}/> All {stats.totalConsultants} consultants have Teams connected
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "#fbbf24" }}>
                <AlertTriangle size={18}/> {stats.totalConsultants - stats.connectedConsultants} consultant(s) haven&apos;t connected Microsoft Teams yet
              </span>
            )}
            <Link className="btn btn--ghost btn--sm" to="/manager/consultants">
              Manage Consultants →
            </Link>
          </div>
        </div>
      )}

      {/* Performance Trend */}
      <div className="card">
        <div className="card__head">
          <h2 style={{display:"flex",alignItems:"center",gap:8}}><TrendingUp size={20} color="var(--blue)"/> Performance Trend</h2>
          <span className="muted">Last 20 demos</span>
        </div>
        {trendData.length === 0 ? (
          <div className="muted" style={{ textAlign: "center", padding: "40px 0" }}>
            No demo data yet. Sync calendar → select meetings to monitor → results appear automatically.
          </div>
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={trendData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card-bg)", border: "1px solid var(--card-border)",
                    borderRadius: "var(--radius-sm)", color: "var(--text-main)"
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="Score" stroke="#60aeff" strokeWidth={2.5}
                  dot={{ fill: "#60aeff", r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Recent Demos */}
      <div className="card">
        <div className="card__head">
          <h2 style={{display:"flex",alignItems:"center",gap:8}}><Target size={20} color="var(--accent)"/> Recent Demos</h2>
          <Link className="link" to="/manager/consultants">View consultants →</Link>
        </div>
        <div className="table">
          <div className="table__row table__row--head">
            <div>Meeting Title</div>
            <div>Consultant</div>
            <div>Date</div>
            <div>Score</div>
            <div></div>
          </div>
          {recentMeetings.map((m) => {
            const sc = scoreOrNull(m.score);
            return (
              <div key={m.id} className="table__row">
                <div className="ellipsis" style={{ fontWeight: 500 }}>{m.title}</div>
                <div className="muted">{m.consultant?.name || "—"}</div>
                <div className="muted">{new Date(m.startTime).toLocaleDateString("en-IN")}</div>
                <div>
                  {sc !== null ? (
                    <span className="badge" style={{
                      background: sc >= 80 ? "rgba(52,211,153,0.12)" : sc >= 60 ? "rgba(59,130,246,0.12)" : "rgba(251,146,60,0.12)",
                      borderColor: sc >= 80 ? "rgba(52,211,153,0.3)" : sc >= 60 ? "rgba(59,130,246,0.3)" : "rgba(251,146,60,0.3)",
                      color: ScoreColor(sc)
                    }}>{sc}/100</span>
                  ) : "—"}
                </div>
                <div>
                  <Link className="link" to={`/reports/${m.id}`}>Report →</Link>
                </div>
              </div>
            );
          })}
          {!recentMeetings.length && !state.loading && (
            <div className="muted" style={{ padding: "24px", textAlign: "center" }}>
              No demos yet. Add consultants → connect Teams → sync calendar → select meetings to monitor.
            </div>
          )}
        </div>
      </div>

      {/* ─── Monitored Meetings ─── */}
      <div className="card">
        <div className="card__head" style={{flexWrap:"wrap",gap:10}}>
          <h2 style={{display:"flex",alignItems:"center",gap:8}}>
            <Activity size={20} color="var(--green)"/> Monitored Meetings
          </h2>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:4,background:"var(--surface-2)",borderRadius:8,border:"1px solid var(--card-border)",padding:"4px 10px"}}>
              <Search size={14} style={{color:"var(--text-muted)"}}/>
              <input type="text" placeholder="Search by title or consultant…" className="input"
                style={{border:"none",background:"transparent",padding:"2px 4px",fontSize:"0.82rem",width:200,outline:"none"}}
                value={monSearch} onChange={e => setMonSearch(e.target.value)}/>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:4,fontSize:"0.82rem",color:"var(--text-muted)"}}>
              From
              <input type="date" className="input" style={{padding:"4px 8px",fontSize:"0.82rem",width:140}}
                value={monFrom} onChange={e => setMonFrom(e.target.value)}/>
            </label>
            <label style={{display:"flex",alignItems:"center",gap:4,fontSize:"0.82rem",color:"var(--text-muted)"}}>
              To
              <input type="date" className="input" style={{padding:"4px 8px",fontSize:"0.82rem",width:140}}
                value={monTo} onChange={e => setMonTo(e.target.value)}/>
            </label>
          </div>
        </div>
        <div className="table">
          <div className="table__row table__row--head">
            <div>Title</div>
            <div>Consultant</div>
            <div>Date</div>
            <div>Status</div>
            <div>Score</div>
            <div></div>
          </div>
          {monitoredMeetings.map(m => {
            const sc = scoreOrNull(m.score);
            const isAnalyzed = m.status === "completed";
            return (
              <div key={m.id} className="table__row">
                <div className="ellipsis" style={{fontWeight:500}}>{m.title}</div>
                <div className="muted">{m.consultant?.name || "—"}</div>
                <div className="muted">{new Date(m.startTime).toLocaleDateString("en-IN")}</div>
                <div>
                  <span className={`badge badge--${isAnalyzed ? "green" : "amber"}`}
                    style={{display:"inline-flex",alignItems:"center",gap:4}}>
                    {isAnalyzed ? <><CheckCircle size={10}/> Analyzed</> : <><Activity size={10}/> Pending</>}
                  </span>
                </div>
                <div>
                  {sc !== null ? (
                    <span className="badge" style={{
                      background: sc >= 80 ? "rgba(52,211,153,0.12)" : sc >= 60 ? "rgba(59,130,246,0.12)" : "rgba(251,146,60,0.12)",
                      borderColor: sc >= 80 ? "rgba(52,211,153,0.3)" : sc >= 60 ? "rgba(59,130,246,0.3)" : "rgba(251,146,60,0.3)",
                      color: ScoreColor(sc)
                    }}>{sc}/100</span>
                  ) : "—"}
                </div>
                <div>
                  {isAnalyzed ? (
                    <Link className="link" to={`/reports/${m.id}`} style={{display:"flex",alignItems:"center",gap:4}}>
                      <Eye size={12}/> Report
                    </Link>
                  ) : (
                    <span className="muted" style={{fontSize:"0.8rem"}}>Auto-analyzing…</span>
                  )}
                </div>
              </div>
            );
          })}
          {!monitoredMeetings.length && !state.loading && (
            <div className="muted" style={{padding:"24px",textAlign:"center"}}>
              No monitored meetings found. Select meetings to monitor from consultant profiles.
            </div>
          )}
        </div>
      </div>

      {/* ─── System Flow Diagram ─── */}
      <div className="card">
        <div className="card__head">
          <h2 style={{display:"flex",alignItems:"center",gap:8}}><Map size={20} color="var(--purple)"/> System Flow</h2>
          <span className="muted">How the platform works end-to-end</span>
        </div>
        <div className="sys-flow">

          {/* Manager flow */}
          <div className="sys-flow__track">
            <div className="sys-flow__title">
              <BriefcaseBusiness size={16}/> Manager Journey
            </div>
            <div className="sys-flow__steps">
              {[
                { icon: <Users size={18}/>, label: "Register", detail: "Manager account", cls: "manager" },
                { icon: <Users size={18}/>, label: "Consultants Join", detail: "Self-registration", cls: "manager" },
                { icon: <Link2 size={18}/>, label: "Connect Teams", detail: "OAuth per consultant", cls: "manager" },
                { icon: <CalendarDays size={18}/>, label: "Sync Calendar", detail: "Pull from Graph API", cls: "ai" },
                { icon: <Activity size={18}/>, label: "Select & Monitor", detail: "Pick specific meetings", cls: "ai" },
                { icon: <LayoutDashboard size={18}/>, label: "View Reports", detail: "Scores + insights", cls: "manager" },
              ].map((n, i, arr) => (
                <div key={n.label} style={{ display: "flex", alignItems: "center" }}>
                  <div className={`sys-flow__node sys-flow__node--${n.cls}`}>
                    <div className="sys-flow__node-icon">{n.icon}</div>
                    <div className="sys-flow__node-label">{n.label}</div>
                    <div className="sys-flow__node-detail">{n.detail}</div>
                  </div>
                  {i < arr.length - 1 && <ChevronRight size={14} style={{color:"var(--text-muted)", flexShrink:0}}/>}
                </div>
              ))}
            </div>
          </div>

          {/* Consultant flow */}
          <div className="sys-flow__track">
            <div className="sys-flow__title">
              <UserCheck size={16}/> Consultant Journey
            </div>
            <div className="sys-flow__steps">
              {[
                { icon: <Users size={18}/>, label: "Register / Login", detail: "Consultant account", cls: "consultant" },
                { icon: <Link2 size={18}/>, label: "Connect Teams", detail: "MS OAuth sign-in", cls: "consultant" },
                { icon: <CalendarDays size={18}/>, label: "Meetings Synced", detail: "Auto from calendar", cls: "ai" },
                { icon: <Activity size={18}/>, label: "Monitor Selected", detail: "Pick meetings to track", cls: "consultant" },
                { icon: <Trophy size={18}/>, label: "View Scores", detail: "Dashboard + reports", cls: "consultant" },
              ].map((n, i, arr) => (
                <div key={n.label} style={{ display: "flex", alignItems: "center" }}>
                  <div className={`sys-flow__node sys-flow__node--${n.cls}`}>
                    <div className="sys-flow__node-icon">{n.icon}</div>
                    <div className="sys-flow__node-label">{n.label}</div>
                    <div className="sys-flow__node-detail">{n.detail}</div>
                  </div>
                  {i < arr.length - 1 && <ChevronRight size={14} style={{color:"var(--text-muted)", flexShrink:0}}/>}
                </div>
              ))}
            </div>
          </div>

          {/* AI pipeline — transcript-only */}
          <div className="sys-flow__track">
            <div className="sys-flow__title">
              <BrainCircuit size={16}/> AI Analysis Pipeline (Auto)
            </div>
            <div className="sys-flow__steps">
              {[
                { icon: <CalendarDays size={18}/>, label: "Meeting Ends", detail: "Monitored meeting", cls: "ai" },
                { icon: <FileText size={18}/>, label: "Fetch Transcript", detail: "Teams auto-VTT", cls: "ai" },
                { icon: <BrainCircuit size={18}/>, label: "AI Analyze", detail: "Every 5 minutes", cls: "ai" },
                { icon: <Star size={18}/>, label: "Pros / Cons", detail: "Client + tips", cls: "ai" },
                { icon: <Trophy size={18}/>, label: "Score Saved", detail: "On dashboard", cls: "ai" },
              ].map((n, i, arr) => (
                <div key={n.label} style={{ display: "flex", alignItems: "center" }}>
                  <div className={`sys-flow__node sys-flow__node--${n.cls}`}>
                    <div className="sys-flow__node-icon">{n.icon}</div>
                    <div className="sys-flow__node-label">{n.label}</div>
                    <div className="sys-flow__node-detail">{n.detail}</div>
                  </div>
                  {i < arr.length - 1 && <ChevronRight size={14} style={{color:"var(--text-muted)", flexShrink:0}}/>}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
