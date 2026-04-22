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
  CheckCircle, XCircle, LayoutGrid
} from "lucide-react";

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

const DEFAULT_CAL_PAST_DAYS = 1;
const DEFAULT_CAL_FUTURE_DAYS = 1;

function defaultCalFromStr() {
  return toDateStr(new Date(Date.now() - DEFAULT_CAL_PAST_DAYS * 86400000));
}

function defaultCalToStr() {
  return toDateStr(new Date(Date.now() + DEFAULT_CAL_FUTURE_DAYS * 86400000));
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
  const [demoDateFrom, setDemoDateFrom] = useState(() => toDateStr(new Date(Date.now() - 30 * 86400000)));
  const [demoDateTo, setDemoDateTo] = useState(() => toDateStr(new Date(Date.now() + 7 * 86400000)));
  const [calFrom, setCalFrom] = useState(defaultCalFromStr);
  const [calTo, setCalTo] = useState(defaultCalToStr);
  const [calSearch, setCalSearch] = useState("");
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSyncLoading, setCalendarSyncLoading] = useState(false);
  const [calendarSyncMsg, setCalendarSyncMsg] = useState("");

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
      try {
        const [c, p, m, td] = await Promise.all([
          apiFetch(`/api/consultants/${consultantId}`, { auth: true }),
          apiFetch(`/api/performance/consultants/${consultantId}`, { auth: true }),
          apiFetch(`/api/meetings?consultantId=${encodeURIComponent(consultantId)}`, { auth: true }),
          apiFetch(`/api/teams/consultants/${consultantId}/data?${calQ}`, { auth: true }).catch(() => null)
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

  const meetingsNewestFirst = useMemo(
    () =>
      [...state.meetings].sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      ),
    [state.meetings]
  );

  const kpis = useMemo(() => {
    const metrics = state.perf?.metrics || {};
    const to10 = (v) => (typeof v === "number" ? Number((v / 2).toFixed(1)) : null);
    const resolutionQuality =
      typeof metrics.technicalAvg === "number" && typeof metrics.structureAvg === "number"
        ? Number(((metrics.technicalAvg + metrics.structureAvg) / 4).toFixed(1))
        : null;
    const sentiment10 =
      typeof metrics.sentimentAvg === "number" ? Number(metrics.sentimentAvg.toFixed(1)) : null;
    return {
      totalDemos: metrics.totalDemos || 0,
      avgScore: nOrNull(metrics.averageScore),
      best: nOrNull(metrics.bestDemoScore),
      worst: nOrNull(metrics.worstDemoScore),
      tone: to10(metrics.communicationAvg),
      technical: to10(metrics.technicalAvg),
      completeness: to10(metrics.structureAvg),
      responseTime: to10(metrics.qaAvg),
      empathy: to10(metrics.engagementAvg),
      resolutionQuality,
      sentiment: sentiment10
    };
  }, [state.perf]);
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
    const from = new Date(demoDateFrom);
    from.setHours(0, 0, 0, 0);
    const to = new Date(demoDateTo);
    to.setHours(23, 59, 59, 999);
    const q = demoSearch.toLowerCase().trim();
    return meetingsNewestFirst.filter((m) => {
      const s = new Date(m.startTime);
      if (s < from || s > to) return false;
      if (q) {
        const title = (m.title || "").toLowerCase();
        if (!title.includes(q)) return false;
      }
      return true;
    });
  }, [meetingsNewestFirst, demoDateFrom, demoDateTo, demoSearch]);

  return (
    <div className="page">
      <ManagerSubNav />

      <div className="header">
        <h1>Consultant profile</h1>
        <p>Performance, Teams calendar, and synced demos for this consultant.</p>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <Link className="link" to="/manager/consultants">← Back to Consultants</Link>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}
      {state.loading ? <div className="card"><div className="muted">Loading…</div></div> : null}

      {state.consultant ? (
        <div
          className="card"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            padding: "12px 14px"
          }}
          role="tablist"
          aria-label="Consultant sections"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`btn btn--sm ${active ? "" : "btn--ghost"}`}
                onClick={() => setActiveTab(t.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {activeTab === "overview" && state.consultant ? (
        <>
          <div className="card">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#6366f1,#38bdf8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0
                }}
              >
                {(state.consultant.name || "?")[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: "0 0 4px" }}>{state.consultant.name}</h2>
                <div className="muted" style={{ fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <Mail size={14} /> {state.consultant.email}
                </div>
                {teamsConnected && td.profile && (
                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 14 }}>
                    {Boolean(td.profile.email) && (
                      <div>
                        <div className="muted" style={{ fontSize: "0.72rem" }}>MS account</div>
                        <div style={{ fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 4 }}>
                          <LinkIcon size={12} /> {td.profile.email}
                        </div>
                      </div>
                    )}
                    {Boolean(td.profile.jobTitle) && (
                      <div>
                        <div className="muted" style={{ fontSize: "0.72rem" }}>Job title</div>
                        <div style={{ fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 4 }}>
                          <Briefcase size={12} /> {td.profile.jobTitle}
                        </div>
                      </div>
                    )}
                    {Boolean(td.profile.department) && (
                      <div>
                        <div className="muted" style={{ fontSize: "0.72rem" }}>Department</div>
                        <div style={{ fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 4 }}>
                          <Building size={12} /> {td.profile.department}
                        </div>
                      </div>
                    )}
                    {Boolean(td.profile.officeLocation) && (
                      <div>
                        <div className="muted" style={{ fontSize: "0.72rem" }}>Office</div>
                        <div style={{ fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 4 }}>
                          <MapPin size={12} /> {td.profile.officeLocation}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: teamsConnected ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                    color: teamsConnected ? "#4ade80" : "#f87171",
                    borderRadius: 20,
                    padding: "4px 14px",
                    fontSize: "0.8rem",
                    fontWeight: 600
                  }}
                >
                  {teamsConnected ? (
                    <>
                      <CheckCircle size={14} /> Teams connected
                    </>
                  ) : (
                    <>
                      <XCircle size={14} /> Teams not connected
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid--kpis">
            <KpiCard label="Total demos" value={kpis.totalDemos} />
            <KpiCard label="Average score" value={kpis.avgScore ?? "—"} hint="out of 100" />
            <KpiCard label="Best / worst" value={`${kpis.best ?? "—"} / ${kpis.worst ?? "—"}`} />
            <KpiCard label="Tone" value={kpis.tone ?? "—"} hint="/10" />
            <KpiCard label="Technical accuracy" value={kpis.technical ?? "—"} hint="/10" />
            <KpiCard label="Completeness" value={kpis.completeness ?? "—"} hint="/10" />
            <KpiCard label="Response time" value={kpis.responseTime ?? "—"} hint="/10" />
            <KpiCard label="Empathy" value={kpis.empathy ?? "—"} hint="/10" />
            <KpiCard label="Resolution quality" value={kpis.resolutionQuality ?? "—"} hint="/10" />
            <KpiCard label="Customer sentiment" value={kpis.sentiment ?? "—"} hint="/10" />
          </div>

          <div className="card">
            <div className="card__head">
              <h2>Consultant KPI Widgets</h2>
              <span className="muted">Same KPI detail as consultant dashboard</span>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 210, flex: "0 0 210px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
                  <div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>Overall rating</div>
                    <div style={{ fontSize: "2rem", fontWeight: 800, color: scoreColor(kpis.avgScore || 0) }}>
                      {kpis.avgScore != null ? Number((kpis.avgScore / 10).toFixed(1)) : "—"}
                      <span style={{ fontSize: "1rem", opacity: 0.9, marginLeft: 6 }}>/10</span>
                    </div>
                  </div>
                  <ScoreRing score={kpis.avgScore || 0} size={86} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <span className="badge badge--green">Positive {sentimentCounts.positive || 0}</span>
                  <span className="badge">Neutral {sentimentCounts.neutral || 0}</span>
                  <span className="badge badge--red">Negative {sentimentCounts.negative || 0}</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatBar label="Tone" value={kpis.tone} color="blue" />
                  <StatBar label="Technical Accuracy" value={kpis.technical} color="green" />
                  <StatBar label="Completeness" value={kpis.completeness} color="purple" />
                  <StatBar label="Response Time" value={kpis.responseTime} color="orange" />
                  <StatBar label="Empathy" value={kpis.empathy} color="purple" />
                  <StatBar label="Resolution Quality" value={kpis.resolutionQuality} color="green" />
                  <div style={{ gridColumn: "1 / -1" }}>
                    <StatBar label="Customer Sentiment" value={kpis.sentiment} color="orange" />
                  </div>
                </div>
              </div>
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
          <div className="card__head" style={{ flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CalendarDays size={20} color="var(--accent)" /> Teams calendar meetings
              </h2>
              <span className="muted">
                {!teamsConnected
                  ? "Connect this consultant’s Teams account to load calendar."
                  : `${calendarFiltered.length} shown · newest first · range ${calFrom} → ${calTo}`}
              </span>
            </div>
            {teamsConnected ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Search by subject…"
                  style={{ padding: "4px 8px", fontSize: "0.82rem", width: 200 }}
                  value={calSearch}
                  onChange={(e) => setCalSearch(e.target.value)}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  From
                  <input
                    type="date"
                    className="input"
                    style={{ padding: "4px 8px", fontSize: "0.82rem", width: 140 }}
                    value={calFrom}
                    onChange={(e) => setCalFrom(e.target.value)}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  To
                  <input
                    type="date"
                    className="input"
                    style={{ padding: "4px 8px", fontSize: "0.82rem", width: 140 }}
                    value={calTo}
                    onChange={(e) => setCalTo(e.target.value)}
                  />
                </label>
                <button type="button" className="btn btn--sm" disabled={calendarLoading} onClick={refreshCalendar}>
                  {calendarLoading ? "Loading…" : "Apply range"}
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={calendarSyncLoading || calendarLoading}
                  onClick={() => void syncThisConsultantCalendarToApp()}
                  title="Save this consultant’s Teams meetings into the app database"
                >
                  {calendarSyncLoading ? "Syncing…" : "Sync calendar to app"}
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  disabled={calendarLoading}
                  onClick={async () => {
                    const f = defaultCalFromStr();
                    const t = defaultCalToStr();
                    setCalFrom(f);
                    setCalTo(t);
                    setCalSearch("");
                    setCalendarLoading(true);
                    setState((s) => ({ ...s, error: "" }));
                    try {
                      const calQ = `from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`;
                      const td = await apiFetch(`/api/teams/consultants/${consultantId}/data?${calQ}`, { auth: true });
                      setState((s) => ({ ...s, teamsData: td }));
                    } catch (e) {
                      setState((s) => ({ ...s, error: e.message || "Failed to reset calendar range" }));
                    } finally {
                      setCalendarLoading(false);
                    }
                  }}
                >
                  Reset
                </button>
              </div>
            ) : null}
          </div>

          <p className="muted" style={{ fontSize: "0.84rem", lineHeight: 1.5, margin: "0 0 12px" }}>
            <strong>Apply range</strong> refreshes the <em>live</em> calendar from Microsoft for the dates above.{" "}
            <strong>Sync calendar to app</strong> imports Teams meetings into this system (same date window as the global sync:{" "}
            <code style={{ fontSize: "0.8rem" }}>GRAPH_SYNC_DAYS_PAST</code> /{" "}
            <code style={{ fontSize: "0.8rem" }}>GRAPH_SYNC_DAYS_FUTURE</code>) so they show under <strong>Synced demos</strong> and in reports.
            Optional: the server can also run this for <em>all</em> consultants every 5 minutes — set{" "}
            <code style={{ fontSize: "0.8rem" }}>ENABLE_CALENDAR_AUTO_SYNC=true</code> in backend <code style={{ fontSize: "0.8rem" }}>.env</code>.
          </p>

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
            <div className="table">
              <div className="table__row table__row--head">
                <div>Meeting title</div>
                <div>Start (local)</div>
                <div>End (local)</div>
                <div>Attendees</div>
                <div>Actions</div>
                <div>Join</div>
              </div>
              {calendarFiltered.map((m) => {
                const startIso = m.startTimeIso || m.startTime;
                const endIso = m.endTimeIso || m.endTime;
                const startD = startIso ? new Date(startIso) : null;
                const isPast = startD && startD < new Date();
                const teamsId = m.joinUrl || m.id;
                const isMonitored = monitoredMap.has(teamsId);

                return (
                  <div key={m.id} className="table__row" style={{ opacity: isPast ? 0.65 : 1 }}>
                    <div className="ellipsis">
                      {m.subject}
                      {isPast ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: "0.7rem",
                            background: "rgba(100,116,139,0.2)",
                            color: "#94a3b8",
                            borderRadius: 8,
                            padding: "1px 7px"
                          }}
                        >
                          past
                        </span>
                      ) : null}
                    </div>
                    <div className="muted" style={{ fontSize: "0.83rem" }}>
                      {formatDateTimeDisplay(startIso)}
                    </div>
                    <div className="muted" style={{ fontSize: "0.83rem" }}>
                      {formatDateTimeDisplay(endIso)}
                    </div>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>
                      {m.attendees?.length
                        ? `${m.attendees.length} attendee${m.attendees.length > 1 ? "s" : ""}`
                        : "—"}
                    </div>
                    <div>
                      {isMonitored ? (
                        <span className="badge badge--green" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Activity size={12} /> Monitored
                        </span>
                      ) : (
                        <button className="btn btn--sm btn--ghost" style={{ padding: "4px 8px" }} type="button" onClick={() => handleMonitor(m)}>
                          <Activity size={14} style={{ marginRight: 4 }} /> Monitor
                        </button>
                      )}
                    </div>
                    <div>
                      {m.joinUrl ? (
                        <a className="link" href={m.joinUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.82rem" }}>
                          Join →
                        </a>
                      ) : null}
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
          <div className="card__head" style={{ flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Folder size={20} color="var(--purple)" /> Synced demos
              </h2>
              <span className="muted">Stored in this app · most recent first</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                className="input"
                placeholder="Search title…"
                style={{ padding: "4px 8px", fontSize: "0.82rem", width: 200 }}
                value={demoSearch}
                onChange={(e) => setDemoSearch(e.target.value)}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                From
                <input
                  type="date"
                  className="input"
                  style={{ padding: "4px 8px", fontSize: "0.82rem", width: 140 }}
                  value={demoDateFrom}
                  onChange={(e) => setDemoDateFrom(e.target.value)}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                To
                <input
                  type="date"
                  className="input"
                  style={{ padding: "4px 8px", fontSize: "0.82rem", width: 140 }}
                  value={demoDateTo}
                  onChange={(e) => setDemoDateTo(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="table">
            <div className="table__row table__row--head">
              <div>Title</div>
              <div>Start</div>
              <div>Score</div>
              <div style={{ textAlign: "right" }} />
            </div>
            {filteredDemos.map((m) => (
              <div key={m.id} className="table__row">
                <div className="ellipsis">{m.title}</div>
                <div className="muted">{formatDateTimeDisplay(m.startTime)}</div>
                <div>{scoreOrNull(m.score) ?? "—"}</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <Link className="link" to={`/reports/${m.id}`}>
                    Open analysis
                  </Link>
                  <button className="btn btn--ghost" type="button" onClick={() => onDelete(m.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!filteredDemos.length && !state.loading ? (
              <div className="muted" style={{ padding: 12 }}>
                No demos in this range. Adjust filters or sync calendar from Overview.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
