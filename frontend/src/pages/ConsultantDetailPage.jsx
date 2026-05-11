import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiDelete, apiFetch } from "../api/client.js";
import KpiCard from "../components/KpiCard.jsx";
import ManagerSubNav from "../components/ManagerSubNav.jsx";
import { formatDateTimeDisplay } from "../utils/dateTime.js";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Link as LinkIcon, Mail, Briefcase, Building, MapPin,
  CalendarDays, TrendingUp, Folder, Activity,
  CheckCircle, XCircle, LayoutGrid, Trophy
} from "lucide-react";

const SCORE_DIMENSIONS = [
  { label: "Discovery",     key: "discoveryAvg",  max: 75, color: "#3b82f6", gradient: "135deg, #1d4ed8, #3b82f6" },
  { label: "Rapport",       key: "rapportAvg",     max: 70, color: "#10b981", gradient: "135deg, #059669, #10b981" },
  { label: "Demo Delivery", key: "demoAvg",        max: 85, color: "#8b5cf6", gradient: "135deg, #6d28d9, #8b5cf6" },
  { label: "Objections",    key: "objectionsAvg",  max: 70, color: "#f59e0b", gradient: "135deg, #d97706, #f59e0b" },
  { label: "Engagement",    key: "engagementAvg",  max: 80, color: "#ec4899", gradient: "135deg, #db2777, #ec4899" },
  { label: "Closing",       key: "closeAvg",       max: 65, color: "#14b8a6", gradient: "135deg, #0d9488, #14b8a6" },
];

function dimGrade(pct) {
  if (pct >= 80) return { label: "Excellent", color: "#10b981" };
  if (pct >= 60) return { label: "Good",      color: "#3b82f6" };
  if (pct >= 40) return { label: "Average",   color: "#f59e0b" };
  return             { label: "Needs Work",   color: "#ef4444" };
}

function nOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function scoreOrNull(s) {
  if (!s) return null;
  return typeof s.totalScore === "number" ? s.totalScore : null;
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
        <circle
          className="score-ring__fg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
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

function toDateStr(d) {
  return d.toISOString().split("T")[0];
}

function defaultCalFromStr() {
  return toDateStr(new Date());
}

function defaultCalToStr() {
  return toDateStr(new Date());
}

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "calendar", label: "Teams calendar", icon: CalendarDays },
  { id: "demos", label: "Synced demos", icon: Folder }
];

export default function ConsultantDetailPage() {
  const { consultantId } = useParams();
  const [activeTab, setActiveTab] = useState("overview");
  const [state, setState] = useState({
    loading: true,
    error: "",
    consultant: null,
    perf: null,
    meetings: [],
    teamsData: null
  });
  const [demoSearch, setDemoSearch] = useState("");
  const [demoDateFrom, setDemoDateFrom] = useState(() => toDateStr(new Date()));
  const [demoDateTo, setDemoDateTo] = useState(() => toDateStr(new Date()));
  const [demoTabMeetings, setDemoTabMeetings] = useState([]);
  const [demoTabLoading, setDemoTabLoading] = useState(false);
  const [calFrom, setCalFrom] = useState(defaultCalFromStr);
  const [calTo, setCalTo] = useState(defaultCalToStr);
  const [calSearch, setCalSearch] = useState("");
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSyncLoading, setCalendarSyncLoading] = useState(false);
  const [calendarSyncMsg, setCalendarSyncMsg] = useState("");
  const [calDatePreset, setCalDatePreset] = useState("today");

  useEffect(() => {
    setActiveTab("overview");
    setCalFrom(defaultCalFromStr());
    setCalTo(defaultCalToStr());
    setCalSearch("");
    setCalendarSyncMsg("");
  }, [consultantId]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setState((s) => ({ ...s, loading: true, error: "" }));
      const calQ = `from=${encodeURIComponent(defaultCalFromStr())}&to=${encodeURIComponent(defaultCalToStr())}`;
      const today = toDateStr(new Date());
      const demoQ = `consultantId=${encodeURIComponent(consultantId)}&from=${encodeURIComponent(today)}&to=${encodeURIComponent(today)}&limit=500`;
      try {
        const [c, p, m, td, dm] = await Promise.all([
          apiFetch(`/api/consultants/${consultantId}`, { auth: true }),
          apiFetch(`/api/performance/consultants/${consultantId}`, { auth: true }),
          apiFetch(`/api/meetings?consultantId=${encodeURIComponent(consultantId)}&limit=500`, { auth: true }),
          apiFetch(`/api/teams/consultants/${consultantId}/data?${calQ}`, { auth: true }).catch(() => null),
          apiFetch(`/api/meetings?${demoQ}`, { auth: true }).catch(() => ({ meetings: [] }))
        ]);
        if (!alive) return;
        setState({
          loading: false,
          error: "",
          consultant: c.consultant,
          perf: p,
          meetings: m.meetings || [],
          teamsData: td
        });
        setDemoTabMeetings(dm.meetings || []);
      } catch (e) {
        if (!alive) return;
        setState({ loading: false, error: e.message || "Failed to load consultant", consultant: null, perf: null, meetings: [], teamsData: null });
      }
    }
    load();
    return () => { alive = false; };
  }, [consultantId]);

  async function refreshCalendar() {
    if (!consultantId) return;
    setCalendarLoading(true);
    setState((s) => ({ ...s, error: "" }));
    try {
      const calQ = `from=${encodeURIComponent(calFrom)}&to=${encodeURIComponent(calTo)}`;
      const td = await apiFetch(`/api/teams/consultants/${consultantId}/data?${calQ}`, { auth: true });
      setState((s) => ({ ...s, teamsData: td }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to load calendar for this range" }));
    } finally {
      setCalendarLoading(false);
    }
  }

  async function fetchDemoTabMeetings(from, to) {
    if (!consultantId) return;
    setDemoTabLoading(true);
    try {
      const q = `consultantId=${encodeURIComponent(consultantId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=500`;
      const res = await apiFetch(`/api/meetings?${q}`, { auth: true });
      setDemoTabMeetings(res.meetings || []);
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to load demos for this range" }));
    } finally {
      setDemoTabLoading(false);
    }
  }

  async function applyPreset(preset) {
    setCalDatePreset(preset);
    if (preset === "custom") return;
    const today = new Date();
    const d = (offset) => toDateStr(new Date(today.getTime() + offset * 86400000));
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
    const ranges = {
      yesterday: [d(-1), d(-1)],
      today:     [d(0),  d(0)],
      tomorrow:  [d(1),  d(1)],
      this_week: [toDateStr(startOfWeek), toDateStr(endOfWeek)],
      all:       [d(-30), d(30)],
    };
    const [f, t] = ranges[preset] || [d(0), d(0)];
    setCalFrom(f); setCalTo(t);
    setCalendarLoading(true);
    setState((s) => ({ ...s, error: "" }));
    try {
      const calQ = `from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`;
      const td = await apiFetch(`/api/teams/consultants/${consultantId}/data?${calQ}`, { auth: true });
      setState((s) => ({ ...s, teamsData: td }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to load calendar" }));
    } finally {
      setCalendarLoading(false);
    }
  }

  /** Pull this consultant’s Teams calendar into MongoDB (demos list / reports), then refresh live view + meetings. */
  async function syncThisConsultantCalendarToApp() {
    if (!consultantId) return;
    setCalendarSyncLoading(true);
    setCalendarSyncMsg("");
    setState((s) => ({ ...s, error: "" }));
    try {
      const syncRes = await apiFetch(`/api/meetings/sync/consultant/${consultantId}`, { method: "POST", auth: true });
      const m = await apiFetch(`/api/meetings?consultantId=${encodeURIComponent(consultantId)}`, { auth: true });
      setState((s) => ({ ...s, meetings: m.meetings || [] }));
      await refreshCalendar();
      setCalendarSyncMsg(syncRes.message || "Calendar synced to the app.");
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Calendar sync to app failed" }));
    } finally {
      setCalendarSyncLoading(false);
    }
  }

  async function onDelete(meetingId) {
    const ok = window.confirm("Delete this demo (meeting + transcript + analysis + score)?");
    if (!ok) return;
    try {
      await apiDelete(`/api/meetings/${meetingId}`, { auth: true });
      const m = await apiFetch(`/api/meetings?consultantId=${encodeURIComponent(consultantId)}`, { auth: true });
      setState((s) => ({ ...s, meetings: m.meetings || [] }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Delete failed" }));
    }
  }

  const handleMonitor = async (m) => {
    try {
      const teamsId = m.joinUrl || m.id;
      const startVal = m.startTimeIso || m.startDateTime || m.startTime;
      const endVal = m.endTimeIso || m.endDateTime || m.endTime;
      const res = await apiFetch("/api/meetings/monitor", {
        method: "POST",
        auth: true,
        body: {
          title: m.subject || m.title || "Teams Meeting",
          teamsMeetingId: teamsId,
          consultantId,
          startTime: startVal,
          endTime: endVal,
          participants: m.attendees || [],
          joinUrl: m.joinUrl || null
        }
      });
      if (res.ok) {
        const mRes = await apiFetch(`/api/meetings?consultantId=${encodeURIComponent(consultantId)}`, { auth: true });
        setState((s) => ({ ...s, meetings: mRes.meetings || [] }));
      }
    } catch (e) {
      alert("Failed to monitor meeting: " + e.message);
    }
  };

  const monitoredMap = useMemo(() => {
    const map = new Set();
    state.meetings.forEach((m) => {
      if (m.monitored) map.add(m.teamsMeetingId);
    });
    return map;
  }, [state.meetings]);



  const kpis = useMemo(() => {
    const m = state.perf?.metrics || {};
    const sentiment10 = typeof m.sentimentAvg === "number" ? Number(m.sentimentAvg.toFixed(1)) : null;

    return {
      totalDemos: state.meetings.filter(mt => mt.isDemo).length,
      avgScore: nOrNull(m.averageScore),
      best: nOrNull(m.bestDemoScore),
      worst: nOrNull(m.worstDemoScore),
      // Dimensions normalized to 10
      discovery: m.discoveryAvg != null ? Number((m.discoveryAvg / 7.5).toFixed(1)) : null,
      rapport: m.rapportAvg != null ? Number((m.rapportAvg / 7).toFixed(1)) : null,
      demo: m.demoAvg != null ? Number((m.demoAvg / 8.5).toFixed(1)) : null,
      objections: m.objectionsAvg != null ? Number((m.objectionsAvg / 7).toFixed(1)) : null,
      engagement: m.engagementAvg != null ? Number((m.engagementAvg / 8).toFixed(1)) : null,
      close: m.closeAvg != null ? Number((m.closeAvg / 6.5).toFixed(1)) : null,
      riskImpact: m.riskAvg != null ? Number(m.riskAvg.toFixed(1)) : null,
      sentiment: sentiment10
    };
  }, [state.perf, state.meetings]);
  const sentimentCounts = state.perf?.metrics?.sentimentCounts || { positive: 0, neutral: 0, negative: 0 };

  const trend = useMemo(() => {
    const months = state.perf?.monthlyPerformance || [];
    return months.map((m) => ({ month: m.month, avg: nOrNull(m.averageScore) ?? 0 }));
  }, [state.perf]);

  const td = state.teamsData;
  const teamsConnected = td?.connected === true;

  const calendarSorted = useMemo(() => {
    const list = td?.calendarMeetings || [];
    return [...list].sort((a, b) => {
      const ta = new Date(a.startTimeIso || a.startTime || 0).getTime();
      const tb = new Date(b.startTimeIso || b.startTime || 0).getTime();
      return tb - ta;
    });
  }, [td?.calendarMeetings]);

  const calendarFiltered = useMemo(() => {
    const q = calSearch.toLowerCase().trim();
    if (!q) return calendarSorted;
    return calendarSorted.filter((m) => (m.subject || "").toLowerCase().includes(q));
  }, [calendarSorted, calSearch]);

  const filteredDemos = useMemo(() => {
    const q = demoSearch.toLowerCase().trim();
    const sorted = [...demoTabMeetings].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
    if (!q) return sorted;
    return sorted.filter((m) => (m.title || "").toLowerCase().includes(q));
  }, [demoTabMeetings, demoSearch]);

  return (
    <div className="page">
      <ManagerSubNav />

      <div className="header">
        <h1>Consultant profile</h1>
        <p>Performance, Teams calendar, and synced demos for this consultant.</p>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}
      {state.loading ? <div className="card"><div className="muted">Loading…</div></div> : null}

      {state.consultant ? (
        <>
          {/* ── Profile hero banner ── */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {/* gradient strip */}
            <div style={{
              background: "linear-gradient(120deg,#1e3a5f 0%,#1a1f4e 40%,#2d1b69 100%)",
              padding: "28px 28px 0",
              position: "relative"
            }}>
              {/* back link */}
              <Link className="link" to="/manager/consultants" style={{ fontSize: "0.82rem", opacity: 0.75 }}>
                ← Back to Consultants
              </Link>

              <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginTop: 18, flexWrap: "wrap" }}>
                {/* avatar */}
                <div style={{
                  width: 80, height: 80, borderRadius: "50%",
                  background: "linear-gradient(135deg,#6366f1,#38bdf8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 32, fontWeight: 800, color: "#fff",
                  border: "3px solid rgba(255,255,255,0.15)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                  flexShrink: 0, marginBottom: -20
                }}>
                  {(state.consultant.name || "?")[0].toUpperCase()}
                </div>

                {/* name + email */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 24 }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.5rem", fontWeight: 800, color: "#f0f4ff" }}>
                    {state.consultant.name}
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(240,244,255,0.6)", fontSize: "0.88rem" }}>
                    <Mail size={13} /> {state.consultant.email}
                  </div>
                </div>

                {/* Teams badge */}
                <div style={{ paddingBottom: 28 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: teamsConnected ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.15)",
                    color: teamsConnected ? "#4ade80" : "#f87171",
                    border: `1px solid ${teamsConnected ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
                    borderRadius: 24, padding: "6px 16px", fontSize: "0.82rem", fontWeight: 700
                  }}>
                    {teamsConnected ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {teamsConnected ? "Teams connected" : "Teams not connected"}
                  </span>
                </div>
              </div>
            </div>

            {/* metadata chips */}
            {teamsConnected && td?.profile && (
              <div style={{ padding: "20px 28px 0", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                {[
                  { show: td.profile.email,          icon: <LinkIcon size={15} color="#818cf8" />, label: "MS Account",  value: td.profile.email,          bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.25)" },
                  { show: td.profile.jobTitle,        icon: <Briefcase size={15} color="#38bdf8" />, label: "Job Title",   value: td.profile.jobTitle,        bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.22)" },
                  { show: td.profile.department,      icon: <Building size={15} color="#a78bfa" />, label: "Department",  value: td.profile.department,      bg: "rgba(167,139,250,0.08)",border: "rgba(167,139,250,0.22)" },
                  { show: td.profile.officeLocation,  icon: <MapPin size={15} color="#4ade80" />, label: "Office",      value: td.profile.officeLocation,  bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.22)" },
                ].filter(c => c.show).map((c, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: c.bg, border: `1px solid ${c.border}`,
                    borderRadius: 12, padding: "10px 16px", minWidth: 0
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: "rgba(255,255,255,0.06)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>{c.icon}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.label}</div>
                      <div style={{ fontSize: "0.88rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab bar */}
            <div style={{
              marginTop: 20,
              borderTop: "1px solid rgba(255,255,255,0.07)",
              display: "flex", gap: 0
            }} role="tablist" aria-label="Consultant sections">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(t.id)}
                    style={{
                      flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                      padding: "13px 16px", border: "none", cursor: "pointer",
                      fontSize: "0.87rem", fontWeight: 600, transition: "all 0.18s",
                      background: "transparent",
                      color: active ? "var(--accent)" : "var(--text-muted)",
                      borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                      borderRadius: 0
                    }}
                  >
                    <Icon size={15} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {activeTab === "overview" && state.consultant ? (
        <>

          <div className="grid grid--kpis" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <KpiCard label="Total demos" value={kpis.totalDemos} />
            <KpiCard label="Average score" value={kpis.avgScore ?? "—"} hint="out of 100" />
            <KpiCard label="Best / worst" value={`${kpis.best ?? "—"} / ${kpis.worst ?? "—"}`} />
          </div>

          <div className="card" style={{ background: "linear-gradient(135deg, rgba(30,27,75,0.6), rgba(17,24,39,0.8))" }}>
            <div className="card__head" style={{ marginBottom: 20 }}>
              <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1.2rem", fontWeight: 800 }}>
                <Trophy size={20} color="var(--accent)" /> Score Breakdown
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  fontSize: "1.5rem", fontWeight: 800,
                  color: scoreColor(kpis.avgScore || 0),
                  background: `${scoreColor(kpis.avgScore || 0)}18`,
                  border: `1px solid ${scoreColor(kpis.avgScore || 0)}44`,
                  borderRadius: 10, padding: "4px 14px"
                }}>
                  {kpis.avgScore ?? "—"} <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>/ 100</span>
                </div>
                <span className="muted" style={{ fontSize: "0.8rem" }}>Overall avg</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {SCORE_DIMENSIONS.map((dim) => {
                const raw = Number((state.perf?.metrics || {})[dim.key] ?? 0);
                const pct = Math.min(100, Math.round((raw / dim.max) * 100));
                const grade = dimGrade(pct);
                return (
                  <div key={dim.label} style={{
                    borderRadius: 14,
                    border: `1px solid ${dim.color}30`,
                    background: `${dim.color}0d`,
                    padding: "18px 16px",
                    position: "relative",
                    overflow: "hidden"
                  }}>
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0, height: 3,
                      background: `linear-gradient(${dim.gradient})`
                    }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {dim.label}
                      </span>
                      <span style={{
                        fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px",
                        borderRadius: 20, background: `${grade.color}20`, color: grade.color,
                        border: `1px solid ${grade.color}40`, whiteSpace: "nowrap"
                      }}>
                        {grade.label}
                      </span>
                    </div>
                    <div style={{ fontSize: "2.2rem", fontWeight: 900, color: dim.color, lineHeight: 1, marginBottom: 14 }}>
                      {pct}<span style={{ fontSize: "1rem", opacity: 0.6, fontWeight: 600 }}>%</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 99, width: `${pct}%`,
                        background: `linear-gradient(90deg, ${dim.color}88, ${dim.color})`,
                        transition: "width 0.8s cubic-bezier(.4,0,.2,1)"
                      }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      <span className="muted" style={{ fontSize: "0.68rem" }}>0%</span>
                      <span className="muted" style={{ fontSize: "0.68rem" }}>Max {dim.max} pts</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={20} color="var(--blue)" /> Monthly performance
              </h2>
              <span className="muted">Average score by month</span>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="month" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avg" name="Avg score" stroke="rgba(122,162,255,0.95)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}

      {activeTab === "calendar" ? (
        <div className="card">
          {/* Row 1: title + search + sync */}
          <div className="card__head" style={{ flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <CalendarDays size={20} color="var(--accent)" /> Calendar Meetings
            </h2>
            {teamsConnected && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Search..."
                  style={{ width: 200 }}
                  value={calSearch}
                  onChange={(e) => setCalSearch(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={calendarSyncLoading || calendarLoading}
                  onClick={() => void syncThisConsultantCalendarToApp()}
                >
                  {calendarSyncLoading ? "Syncing…" : "Sync"}
                </button>
              </div>
            )}
          </div>

          {/* Row 2: quick date filter pills */}
          {teamsConnected && (
            <div style={{ display: "flex", gap: 8, padding: "0 16px 16px", borderBottom: "1px solid var(--card-border)", alignItems: "center", flexWrap: "wrap" }}>
              {[
                { id: "yesterday", label: "Yesterday" },
                { id: "today",     label: "Today" },
                { id: "tomorrow",  label: "Tomorrow" },
                { id: "this_week", label: "This Week" },
                { id: "all",       label: "All" },
                { id: "custom",    label: "Custom" },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`btn btn--sm ${calDatePreset === f.id ? "btn--blue" : "btn--ghost"}`}
                  onClick={() => applyPreset(f.id)}
                  disabled={calendarLoading}
                >
                  {f.label}
                </button>
              ))}
              {calDatePreset === "custom" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 4 }}>
                  <input type="date" className="input" style={{ padding: "4px 8px", fontSize: "0.85rem", height: "auto" }}
                    value={calFrom} onChange={(e) => setCalFrom(e.target.value)} />
                  <span className="muted" style={{ fontSize: "0.85rem" }}>to</span>
                  <input type="date" className="input" style={{ padding: "4px 8px", fontSize: "0.85rem", height: "auto" }}
                    value={calTo} onChange={(e) => setCalTo(e.target.value)} />
                  <button type="button" className="btn btn--sm" disabled={calendarLoading} onClick={refreshCalendar}>
                    {calendarLoading ? "Loading…" : "Apply"}
                  </button>
                </div>
              )}
            </div>
          )}


          {calendarSyncMsg ? (
            <div className="alert success" style={{ marginBottom: 12 }}>
              {calendarSyncMsg}
            </div>
          ) : null}

          {!teamsConnected ? (
            <div className="muted" style={{ padding: "14px 0" }}>
              No calendar data until this consultant connects Microsoft Teams.
            </div>
          ) : !calendarFiltered.length ? (
            <div className="muted" style={{ padding: "14px 0" }}>
              {calendarSorted.length
                ? "No meetings match your search. Clear the subject filter or widen the date range."
                : "No Teams meetings in this range. Click Apply range or choose wider dates."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* Header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 148px 140px 110px 200px",
                padding: "10px 16px",
                borderBottom: "1px solid var(--card-border)",
                fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)",
                textTransform: "uppercase", letterSpacing: "0.05em"
              }}>
                <div>Meeting</div>
                <div>Schedule</div>
                <div>Status</div>
                <div>Attendees</div>
                <div>Action</div>
              </div>

              {calendarFiltered.map((m) => {
                const startIso = m.startTimeIso || m.startTime;
                const startD = startIso ? new Date(startIso) : null;
                const isPast = startD && startD < new Date();
                const teamsId = m.joinUrl || m.id;
                const isMonitored = monitoredMap.has(teamsId);

                const dbMeeting = state.meetings.find(mt => mt.teamsMeetingId === teamsId || mt.joinUrl === teamsId);
                const statusLabel = dbMeeting
                  ? dbMeeting.analysisStatus === "completed" ? "Analyzed"
                    : dbMeeting.transcriptStatus === "ready" ? "Transcript Ready"
                    : "Monitoring"
                  : isPast ? "Past" : "Not Started";

                const statusColor = statusLabel === "Analyzed" ? "#10b981"
                  : statusLabel === "Transcript Ready" ? "#3b82f6"
                  : statusLabel === "Monitoring" ? "#8b5cf6"
                  : statusLabel === "Past" ? "#64748b"
                  : "#f59e0b";

                return (
                  <div key={m.id} style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 148px 140px 110px 200px",
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--card-border)",
                    alignItems: "center",
                    transition: "background 0.15s",
                    borderLeft: `3px solid ${isMonitored ? "var(--accent)" : "transparent"}`
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    {/* Meeting title */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.4 }}>
                          {m.subject || "Teams Meeting"}
                        </span>
                        {isPast && (
                          <span style={{
                            fontSize: "0.65rem", fontWeight: 700, padding: "1px 7px",
                            borderRadius: 99, background: "rgba(100,116,139,0.15)", color: "#94a3b8"
                          }}>past</span>
                        )}
                      </div>
                      {isMonitored && (
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                          Being monitored
                        </div>
                      )}
                    </div>

                    {/* Schedule */}
                    <div style={{ lineHeight: 1.4 }}>
                      {startD ? (
                        <>
                          <div style={{ fontWeight: 500, fontSize: "0.88rem" }}>
                            {startD.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            {startD.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })}
                          </div>
                        </>
                      ) : "—"}
                    </div>

                    {/* Status pill */}
                    <div>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: "0.78rem", fontWeight: 700, padding: "4px 10px",
                        borderRadius: 99, border: `1px solid ${statusColor}40`,
                        background: `${statusColor}18`, color: statusColor, whiteSpace: "nowrap"
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                        {statusLabel}
                      </span>
                    </div>

                    {/* Attendees */}
                    <div style={{ fontSize: "0.83rem", color: "var(--text-muted)" }}>
                      {m.attendees?.length
                        ? `${m.attendees.length} attendee${m.attendees.length > 1 ? "s" : ""}`
                        : "—"}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {isMonitored ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: "0.78rem", fontWeight: 700, padding: "4px 10px",
                          borderRadius: 99, background: "rgba(16,185,129,0.12)",
                          color: "#10b981", border: "1px solid rgba(16,185,129,0.25)"
                        }}>
                          <Activity size={12} /> Monitored
                        </span>
                      ) : (
                        <button className="btn btn--sm btn--ghost" type="button" onClick={() => handleMonitor(m)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 12px" }}>
                          <Activity size={13} /> Monitor
                        </button>
                      )}
                      {m.joinUrl && (
                        <a href={m.joinUrl} target="_blank" rel="noreferrer" style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: "0.8rem", fontWeight: 600, padding: "5px 12px",
                          borderRadius: 8, background: "rgba(59,130,246,0.12)",
                          color: "var(--accent)", border: "1px solid rgba(59,130,246,0.25)",
                          textDecoration: "none"
                        }}>
                          Join →
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "demos" ? (
        <div className="card">
          {/* Row 1: title + search */}
          <div className="card__head" style={{ flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <Folder size={20} color="var(--purple)" /> Synced Demos
            </h2>
            <input
              type="text"
              className="input"
              placeholder="Search..."
              style={{ width: 200 }}
              value={demoSearch}
              onChange={(e) => setDemoSearch(e.target.value)}
            />
          </div>

          {/* Row 2: date filters */}
          <div style={{
            display: "flex", gap: 10, padding: "12px 16px 16px",
            borderBottom: "1px solid var(--card-border)",
            alignItems: "center", flexWrap: "wrap"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>From</span>
              <input type="date" className="input"
                style={{ padding: "5px 10px", fontSize: "0.84rem", width: 148 }}
                value={demoDateFrom} onChange={(e) => setDemoDateFrom(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>To</span>
              <input type="date" className="input"
                style={{ padding: "5px 10px", fontSize: "0.84rem", width: 148 }}
                value={demoDateTo} onChange={(e) => setDemoDateTo(e.target.value)} />
            </div>
            <button
              type="button"
              className="btn btn--sm"
              disabled={demoTabLoading}
              onClick={() => fetchDemoTabMeetings(demoDateFrom, demoDateTo)}
            >
              {demoTabLoading ? "Loading…" : "Apply"}
            </button>
            <span style={{
              marginLeft: 4, fontSize: "0.8rem", fontWeight: 600,
              color: "var(--accent)", background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.25)", borderRadius: 99,
              padding: "4px 12px", whiteSpace: "nowrap"
            }}>
              {filteredDemos.length} demo{filteredDemos.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 160px 110px 180px",
              padding: "10px 16px",
              fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.05em",
              borderBottom: "1px solid var(--card-border)"
            }}>
              <div>Meeting</div>
              <div>Date</div>
              <div>Score</div>
              <div style={{ textAlign: "right" }}>Actions</div>
            </div>

            {filteredDemos.length === 0 && !state.loading ? (
              <div className="muted" style={{ padding: "24px 16px", textAlign: "center" }}>
                No demos in this range. Adjust the date filters or sync the calendar.
              </div>
            ) : filteredDemos.map((m) => {
              const sc = scoreOrNull(m.score);
              const scColor = sc == null ? "var(--text-muted)"
                : sc >= 80 ? "#10b981" : sc >= 60 ? "#3b82f6" : sc >= 40 ? "#f59e0b" : "#f87171";
              const analysisLabel = m.analysisStatus === "completed" ? "Analyzed"
                : m.analysisStatus === "pending" ? "Processing"
                : m.transcriptStatus === "ready" ? "Transcript Ready"
                : "Not Analyzed";
              const analysisColor = m.analysisStatus === "completed" ? "#10b981"
                : m.analysisStatus === "pending" ? "#8b5cf6"
                : m.transcriptStatus === "ready" ? "#3b82f6" : "#64748b";
              const startD = m.startTime ? new Date(m.startTime) : null;

              return (
                <div key={m.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 160px 110px 180px",
                  padding: "14px 16px", borderBottom: "1px solid var(--card-border)",
                  alignItems: "center", transition: "background 0.15s",
                  borderLeft: `3px solid ${m.analysisStatus === "completed" ? "#10b981" : "transparent"}`
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {/* Title + status */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: 4, lineHeight: 1.3 }}>
                      {m.title}
                    </div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px",
                      borderRadius: 99, background: `${analysisColor}18`,
                      color: analysisColor, border: `1px solid ${analysisColor}35`
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: analysisColor }} />
                      {analysisLabel}
                    </span>
                  </div>

                  {/* Date */}
                  <div style={{ lineHeight: 1.4 }}>
                    {startD ? (
                      <>
                        <div style={{ fontWeight: 500, fontSize: "0.88rem" }}>
                          {startD.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          {startD.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })}
                        </div>
                      </>
                    ) : "—"}
                  </div>

                  {/* Score badge */}
                  <div>
                    {sc != null ? (
                      <span style={{
                        display: "inline-block", fontWeight: 800, fontSize: "1.1rem",
                        color: scColor, background: `${scColor}15`,
                        border: `1px solid ${scColor}35`, borderRadius: 10,
                        padding: "4px 12px", lineHeight: 1
                      }}>
                        {sc}<span style={{ fontSize: "0.7rem", opacity: 0.7 }}>/100</span>
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>—</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                    <Link to={`/reports/${m.id}`} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: "0.8rem", fontWeight: 600, padding: "6px 14px",
                      borderRadius: 8, background: "rgba(99,102,241,0.12)",
                      color: "#818cf8", border: "1px solid rgba(99,102,241,0.25)",
                      textDecoration: "none"
                    }}>
                      View Report
                    </Link>
                    <button type="button" onClick={() => onDelete(m.id)} style={{
                      display: "inline-flex", alignItems: "center",
                      fontSize: "0.8rem", fontWeight: 600, padding: "6px 12px",
                      borderRadius: 8, background: "rgba(239,68,68,0.08)",
                      color: "#f87171", border: "1px solid rgba(239,68,68,0.2)",
                      cursor: "pointer"
                    }}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
