import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import {
  Target, Star, Link2, Zap, LayoutDashboard,
  RefreshCw, CheckCircle, AlertTriangle, UserCheck, Users,
  CalendarDays, FileText, BrainCircuit, Trophy, Activity,
  BriefcaseBusiness, ChevronRight, Map, Search, Eye, CalendarClock,
  ChevronDown, X
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
    meetings: [], consultants: [], totalMeetings: 0
  });
  const [monSearch, setMonSearch] = useState("");
  const defaultFrom = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; })();
  const defaultTo = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
  const [monFrom, setMonFrom] = useState(defaultFrom);
  const [monTo, setMonTo] = useState(defaultTo);
  const [appliedFrom, setAppliedFrom] = useState(defaultFrom);
  const [appliedTo, setAppliedTo] = useState(defaultTo);
  const [selectedConsultants, setSelectedConsultants] = useState(new Set());
  const [showConsultantDropdown, setShowConsultantDropdown] = useState(false);
  const consultantDropdownRef = useRef(null);
  const [monPage, setMonPage] = useState(1);
  const MON_PAGE_SIZE = 10;

  function applyDateFilter() {
    setAppliedFrom(monFrom);
    setAppliedTo(monTo);
    setMonPage(1);
  }

  async function loadData() {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const [meetingsRes, consultantsRes] = await Promise.all([
        apiFetch("/api/meetings?limit=1000", { auth: true }),
        apiFetch("/api/consultants", { auth: true })
      ]);
      setState((s) => ({
        ...s, loading: false,
        meetings: meetingsRes.meetings || [],
        totalMeetings: meetingsRes.total ?? meetingsRes.meetings?.length ?? 0,
        consultants: consultantsRes.consultants || []
      }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || "Failed to load data" }));
    }
  }

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!showConsultantDropdown) return;
    function handleClick(e) {
      if (consultantDropdownRef.current && !consultantDropdownRef.current.contains(e.target)) {
        setShowConsultantDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showConsultantDropdown]);

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
    const totalDemos = state.meetings.filter(m => m.isDemo).length;
    const scores = state.meetings.map((m) => scoreOrNull(m.score)).filter((n) => n !== null);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const connectedConsultants = state.consultants.filter((c) => c.teamsConnected).length;
    const totalConsultants = state.consultants.length;
    return { totalDemos, avgScore, connectedConsultants, totalConsultants };
  }, [state.meetings, state.consultants]);

  // Monitored meetings with search + date + consultant filter (only completed/analyzed)
  const monitoredMeetings = useMemo(() => {
    const all = state.meetings.filter(m => m.monitored && m.analysisStatus === "completed");
    const [fy, fm, fd] = appliedFrom.split("-").map(Number);
    const [ty, tm, td] = appliedTo.split("-").map(Number);
    const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
    const to = new Date(ty, tm - 1, td, 23, 59, 59, 999);
    const q = monSearch.toLowerCase().trim();
    return all.filter(m => {
      const s = m.startTime ? new Date(m.startTime) : null;
      if (s && (s < from || s > to)) return false;
      if (q && !(m.title || "").toLowerCase().includes(q) && !(m.consultant?.name || "").toLowerCase().includes(q)) return false;
      if (selectedConsultants.size > 0 && !selectedConsultants.has(m.consultant?.id)) return false;
      return true;
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [state.meetings, monSearch, appliedFrom, appliedTo, selectedConsultants]);

  function toggleConsultant(id) {
    setSelectedConsultants(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setMonPage(1);
  }

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

      {/* ─── Monitored Meetings ─── */}
      <div className="card">
        <div className="card__head" style={{flexWrap:"wrap",gap:10,position:"relative",zIndex:10}}>
          <h2 style={{display:"flex",alignItems:"center",gap:8}}>
            <Activity size={20} color="var(--green)"/> Monitored Meetings
          </h2>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:4,background:"var(--surface-2)",borderRadius:8,border:"1px solid var(--card-border)",padding:"4px 10px"}}>
              <Search size={14} style={{color:"var(--text-muted)"}}/>
              <input type="text" placeholder="Search by title or consultant…" className="input"
                style={{border:"none",background:"transparent",padding:"2px 4px",fontSize:"0.82rem",width:200,outline:"none"}}
                value={monSearch} onChange={e => { setMonSearch(e.target.value); setMonPage(1); }}/>
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
            <button
              className="btn btn--sm"
              onClick={applyDateFilter}
              style={{padding:"4px 14px",fontSize:"0.82rem"}}
            >
              Apply
            </button>

            {/* Consultant checkbox filter */}
            <div ref={consultantDropdownRef} style={{position:"relative"}}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setShowConsultantDropdown(v => !v)}
                style={{display:"flex",alignItems:"center",gap:6,paddingLeft:10,paddingRight:10,
                  background: selectedConsultants.size > 0 ? "rgba(99,102,241,0.12)" : undefined,
                  borderColor: selectedConsultants.size > 0 ? "rgba(99,102,241,0.5)" : undefined,
                  color: selectedConsultants.size > 0 ? "var(--purple)" : undefined
                }}
              >
                <Users size={13}/>
                {selectedConsultants.size > 0 ? `Consultant (${selectedConsultants.size})` : "Consultant"}
                <ChevronDown size={13}/>
              </button>

              {showConsultantDropdown && (
                <div style={{
                  position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:9999,
                  background:"#1a1d2e", border:"1px solid rgba(255,255,255,0.1)",
                  borderRadius:10, boxShadow:"0 8px 32px rgba(0,0,0,0.6)",
                  minWidth:230, padding:"8px 0",
                  backdropFilter:"none", isolation:"isolate"
                }}>
                  {/* Header */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"4px 12px 8px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
                    <span style={{fontSize:"0.75rem",fontWeight:700,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.05em"}}>Filter by Consultant</span>
                    <button style={{background:"none",border:"none",cursor:"pointer",padding:2,color:"rgba(255,255,255,0.5)",display:"flex"}}
                      onClick={() => setShowConsultantDropdown(false)}><X size={14}/></button>
                  </div>

                  {/* Clear all */}
                  {selectedConsultants.size > 0 && (
                    <button style={{
                      display:"block",width:"100%",textAlign:"left",background:"none",border:"none",
                      cursor:"pointer",padding:"6px 14px",fontSize:"0.8rem",color:"#818cf8",fontWeight:600
                    }} onClick={() => { setSelectedConsultants(new Set()); setMonPage(1); }}>
                      Clear all
                    </button>
                  )}

                  {/* Consultant list */}
                  <div style={{maxHeight:240,overflowY:"auto"}}>
                    {state.consultants.length === 0 && (
                      <div style={{padding:"10px 14px",fontSize:"0.82rem",color:"rgba(255,255,255,0.5)"}}>No consultants</div>
                    )}
                    {state.consultants.map(c => (
                      <label key={c.id} style={{
                        display:"flex",alignItems:"center",gap:10,padding:"7px 14px",
                        cursor:"pointer",fontSize:"0.84rem",
                        background: selectedConsultants.has(c.id) ? "rgba(99,102,241,0.15)" : "transparent",
                        transition:"background 0.15s"
                      }}>
                        <input type="checkbox" checked={selectedConsultants.has(c.id)}
                          onChange={() => toggleConsultant(c.id)}
                          style={{accentColor:"#818cf8",width:15,height:15,flexShrink:0}}/>
                        <span style={{fontWeight: selectedConsultants.has(c.id) ? 600 : 400,
                          color: selectedConsultants.has(c.id) ? "#818cf8" : "rgba(255,255,255,0.85)"}}>{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {(() => {
          const totalPages = Math.max(1, Math.ceil(monitoredMeetings.length / MON_PAGE_SIZE));
          const safePage = Math.min(monPage, totalPages);
          const pageItems = monitoredMeetings.slice((safePage - 1) * MON_PAGE_SIZE, safePage * MON_PAGE_SIZE);

          return (
            <>
              <div className="table">
                <div className="table__row table__row--head">
                  <div>Title</div>
                  <div>Consultant</div>
                  <div>Date</div>
                  <div>Status</div>
                  <div>Score</div>
                  <div></div>
                </div>
                {pageItems.map(m => {
                  const sc = scoreOrNull(m.score);
                  const isAnalyzed = m.analysisStatus === "completed";
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
                    No analyzed meetings found. Meetings appear here once transcript is uploaded and AI analysis is complete.
                  </div>
                )}
              </div>

              {/* Pagination */}
              {monitoredMeetings.length > 0 && (
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14,flexWrap:"wrap",gap:8}}>
                  <span style={{fontSize:"0.8rem",color:"var(--text-muted)"}}>
                    Showing {(safePage - 1) * MON_PAGE_SIZE + 1}–{Math.min(safePage * MON_PAGE_SIZE, monitoredMeetings.length)} of {monitoredMeetings.length}
                  </span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setMonPage(1)}
                      disabled={safePage === 1}
                      style={{padding:"3px 10px",fontSize:"0.8rem"}}
                    >«</button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setMonPage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      style={{padding:"3px 10px",fontSize:"0.8rem"}}
                    >‹ Prev</button>
                    {Array.from({length: totalPages}, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                      .reduce((acc, p, idx, arr) => {
                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push("...");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) => p === "..." ? (
                        <span key={"ellipsis-" + i} style={{fontSize:"0.8rem",color:"var(--text-muted)",padding:"0 4px"}}>…</span>
                      ) : (
                        <button key={p}
                          className="btn btn--sm"
                          onClick={() => setMonPage(p)}
                          style={{
                            padding:"3px 10px",fontSize:"0.8rem",minWidth:32,
                            background: p === safePage ? "var(--accent)" : "rgba(255,255,255,0.06)",
                            color: p === safePage ? "#fff" : "var(--text-muted)",
                            borderColor: p === safePage ? "var(--accent)" : "var(--card-border)"
                          }}
                        >{p}</button>
                      ))
                    }
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setMonPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      style={{padding:"3px 10px",fontSize:"0.8rem"}}
                    >Next ›</button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setMonPage(totalPages)}
                      disabled={safePage === totalPages}
                      style={{padding:"3px 10px",fontSize:"0.8rem"}}
                    >»</button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
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
