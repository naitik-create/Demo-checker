import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  FileText,
  Link2,
  PlayCircle,
  RefreshCw,
  Star,
  Target,
  Trophy
} from "lucide-react";

function scoreOrNull(score) {
  if (!score || typeof score.totalScore !== "number") return null;
  return score.totalScore;
}

function scoreColor(sc) {
  if (sc >= 80) return "var(--green)";
  if (sc >= 60) return "var(--accent)";
  if (sc >= 40) return "var(--orange)";
  return "#f87171";
}



function StatBar({ label, value, color = "blue", max = 20 }) {
  const safeValue = Number(value || 0);
  const pct = Math.max(0, Math.min(100, Math.round((safeValue / max) * 100)));
  return (
    <div className="stat-bar">
      <div className="stat-bar__top">
        <span className="stat-bar__label">{label}</span>
        <span className="stat-bar__value">{safeValue}/{max}</span>
      </div>
      <div className="stat-bar__track">
        <div
          className={`stat-bar__fill stat-bar__fill--${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ConsultantDashboard() {
  const { user } = useAuth();
  const [state, setState] = useState({
    loading: true,
    error: "",
    meetings: [],
    teamsData: null,
    teamsLoading: false,
    joiningMeetingId: "",
    totalMeetings: 0
  });
  const [perf, setPerf] = useState({ loading: false, error: "", metrics: null });
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | calendar | reports
  const [teamsConnectUrl, setTeamsConnectUrl] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const meetingsRes = await apiFetch("/api/meetings", { auth: true });
        if (!alive) return;
        setState((s) => ({
          ...s,
          loading: false,
          meetings: meetingsRes.meetings || [],
          totalMeetings: meetingsRes.total ?? meetingsRes.meetings?.length ?? 0,
          error: ""
        }));
      } catch (e) {
        if (!alive) return;
        setState((s) => ({ ...s, loading: false, error: e.message || "Failed to load meetings" }));
      }
    }

    async function loadTeams() {
      setState((s) => ({ ...s, teamsLoading: true }));
      try {
        const td = await apiFetch("/api/teams/me", { auth: true });
        if (!alive) return;
        setState((s) => ({ ...s, teamsData: td, teamsLoading: false }));
        if (td?.connected) {
          // Auto-sync calendar meetings in background so latest data is always shown
          apiFetch("/api/meetings/sync", { auth: true })
            .then(() => {
              if (!alive) return;
              return apiFetch("/api/meetings", { auth: true });
            })
            .then((meetingsRes) => {
              if (alive && meetingsRes?.meetings) {
                setState((s) => ({
                  ...s,
                  meetings: meetingsRes.meetings,
                  totalMeetings: meetingsRes.total ?? meetingsRes.meetings?.length ?? 0
                }));
              }
            })
            .catch(() => {});
        } else {
          // Pre-fetch OAuth URL so Connect button is a plain href link
          apiFetch("/api/teams/connect-url", { auth: true })
            .then((r) => { if (alive && r?.url) setTeamsConnectUrl(r.url); })
            .catch(() => {});
        }
      } catch {
        if (!alive) return;
        setState((s) => ({ ...s, teamsLoading: false }));
      }
    }

    if (user?.role === "consultant" || user?.role === "admin") {
      load();
      loadTeams();
    }
    return () => { alive = false; };
  }, [user?.role]);

  useEffect(() => {
    let alive = true;
    async function loadPerf() {
      if (!user?.id) return;
      setPerf({ loading: true, error: "", metrics: null });
      try {
        const res = await apiFetch(`/api/performance/consultants/${user.id}`, { auth: true });
        if (!alive) return;
        setPerf({ loading: false, error: "", metrics: res.metrics || null });
      } catch (e) {
        if (!alive) return;
        setPerf({ loading: false, error: e.message || "Failed to load performance", metrics: null });
      }
    }
    loadPerf();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  async function refreshMeetingsOnly() {
    try {
      const meetingsRes = await apiFetch("/api/meetings", { auth: true });
      setState((s) => ({
        ...s,
        meetings: meetingsRes.meetings || [],
        totalMeetings: meetingsRes.total ?? meetingsRes.meetings?.length ?? 0
      }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to refresh meetings" }));
    }
  }

  async function syncCalendarAndMeetings() {
    try {
      setSyncing(true);
      await apiFetch("/api/meetings/sync", { auth: true });
      const [meetingsRes, teamsRes] = await Promise.all([
        apiFetch("/api/meetings", { auth: true }),
        apiFetch("/api/teams/me", { auth: true })
      ]);
      setState((s) => ({
        ...s,
        meetings: meetingsRes.meetings || [],
        totalMeetings: meetingsRes.total ?? meetingsRes.meetings?.length ?? 0,
        teamsData: teamsRes,
        error: ""
      }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Sync failed" }));
    } finally {
      setSyncing(false);
    }
  }

  async function joinMeeting(meetingDocId) {
    try {
      setState((s) => ({ ...s, joiningMeetingId: meetingDocId, error: "" }));
      const res = await apiFetch(`/api/meetings/${meetingDocId}/join`, {
        method: "POST",
        auth: true
      });
      await refreshMeetingsOnly();
      if (res?.joinUrl) {
        window.open(res.joinUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to join meeting" }));
    } finally {
      setState((s) => ({ ...s, joiningMeetingId: "" }));
    }
  }

  async function ensureMonitoredAndJoin(calMeeting) {
    try {
      const teamsId = calMeeting.joinUrl || calMeeting.id;
      await apiFetch("/api/meetings/monitor", {
        method: "POST",
        auth: true,
        body: {
          title: calMeeting.subject || calMeeting.title || "Teams Meeting",
          teamsMeetingId: teamsId,
          consultantId: user.id || user._id,
          startTime: calMeeting.startDateTime || calMeeting.startTime,
          endTime: calMeeting.endDateTime || calMeeting.endTime,
          participants: calMeeting.attendees || [],
          joinUrl: calMeeting.joinUrl || null
        }
      });
      const refreshed = await apiFetch("/api/meetings", { auth: true });
      const monitoredMeeting = (refreshed.meetings || []).find((m) => m.teamsMeetingId === teamsId);
      setState((s) => ({
        ...s,
        meetings: refreshed.meetings || [],
        totalMeetings: refreshed.total ?? refreshed.meetings?.length ?? 0
      }));
      if (monitoredMeeting?.id) {
        await joinMeeting(monitoredMeeting.id);
      }
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Unable to prepare meeting for join" }));
    }
  }

  const stats = useMemo(() => {
    const totalDemos = state.totalMeetings;
    const scores = state.meetings.map((m) => scoreOrNull(m.score)).filter((n) => n !== null);
    const avgScore = scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : 0;
    const completed = state.meetings.filter((m) => m.analysisStatus === "completed").length;
    const todayStr = new Date().toDateString();
    const todaysDemos = state.meetings.filter(m => {
      const s = m.startTime ? new Date(m.startTime) : null;
      return s && s.toDateString() === todayStr;
    }).length;
    return { totalDemos, avgScore, completed, todaysDemos };
  }, [state.meetings]);

  const td = state.teamsData;
  const teamsConnected = td?.connected === true;
  const perfMetrics = perf.metrics || {};
  const avgScoreValue = Number(perfMetrics.averageScore ?? stats.avgScore ?? 0);

  // Build monitored map: teamsMeetingId -> meeting doc
  const monitoredMap = useMemo(() => {
    const map = new Map();
    state.meetings.forEach(m => {
      if (m.monitored) map.set(m.teamsMeetingId, m);
    });
    return map;
  }, [state.meetings]);

  const monitoredMeetings = useMemo(() =>
    state.meetings
      .filter((m) => m.monitored)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    [state.meetings]
  );

  const filteredCalMeetings = useMemo(() => {
    const meetings = td?.calendarMeetings || [];
    const q = searchTerm.toLowerCase().trim();
    return meetings.filter(m => {
      if (q && !(m.subject || m.title || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [td?.calendarMeetings, searchTerm]);

  const completedMeetings = useMemo(
    () =>
      [...state.meetings]
        .filter((m) => m.analysisStatus === "completed")
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime)),
    [state.meetings]
  );

  const pendingMeetings = useMemo(
    () =>
      monitoredMeetings.filter((m) => m.analysisStatus !== "completed"),
    [monitoredMeetings]
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Consultant Workspace</h1>
        <p>Professional flow: join meeting from system, auto-transcript, then auto-analysis and score.</p>
      </div>

      {!state.teamsLoading && !teamsConnected && (
        <div className="alert" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "rgba(99,102,241,0.08)", borderColor: "rgba(99,102,241,0.3)", color: "var(--text)"
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={16} color="var(--accent)" />
            Connect your Microsoft Teams account to enable calendar sync, meeting monitoring, and AI analysis.
          </span>
          {teamsConnectUrl ? (
            <a
              href={teamsConnectUrl}
              className="btn btn--sm"
              style={{ whiteSpace: "nowrap", flexShrink: 0, textDecoration: "none" }}
            >
              Connect Teams
            </a>
          ) : (
            <span className="muted" style={{ fontSize: "0.8rem", flexShrink: 0 }}>
              {state.teamsLoading ? "Loading…" : "Unavailable — check backend"}
            </span>
          )}
        </div>
      )}

      {state.error && (
        <div className="alert">
          {state.error}
        </div>
      )}

      <div className="tabs-nav">
        <button
          className={`tabs-nav__item${activeTab === "dashboard" ? " is-active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
          type="button"
        >
          Dashboard
        </button>
        <button
          className={`tabs-nav__item${activeTab === "calendar" ? " is-active" : ""}`}
          onClick={() => setActiveTab("calendar")}
          type="button"
        >
          Calendar Meetings
        </button>
        <button
          className={`tabs-nav__item${activeTab === "reports" ? " is-active" : ""}`}
          onClick={() => setActiveTab("reports")}
          type="button"
        >
          My Reports
        </button>
      </div>

      {activeTab === "dashboard" && (
        <>
          <div className="grid grid--kpis">
            <div className="kpi kpi--blue">
              <div className="kpi__icon kpi__icon--blue"><Target size={24} /></div>
              <div className="kpi__label">Total Meetings</div>
              <div className="kpi__value kpi__value--blue">{state.loading ? "—" : stats.totalDemos}</div>
              <div className="kpi__hint">Synced from Teams</div>
            </div>

            <div className="kpi kpi--purple">
              <div className="kpi__icon kpi__icon--purple"><Star size={24} /></div>
              <div className="kpi__label">Average Score</div>
              <div className="kpi__value kpi__value--purple" style={{ color: scoreColor(avgScoreValue) }}>
                {state.loading || perf.loading ? "—" : avgScoreValue}
              </div>
              <div className="kpi__hint">Out of 100</div>
            </div>

            <div className="kpi kpi--green">
              <div className="kpi__icon kpi__icon--green"><CheckCircle size={24} /></div>
              <div className="kpi__label">Completed Analyses</div>
              <div className="kpi__value kpi__value--green">{state.loading ? "—" : stats.completed}</div>
              <div className="kpi__hint">Ready reports</div>
            </div>

            <div className="kpi kpi--orange">
              <div className="kpi__icon kpi__icon--orange"><Activity size={24} /></div>
              <div className="kpi__label">In Progress</div>
              <div className="kpi__value kpi__value--orange">{pendingMeetings.length}</div>
              <div className="kpi__hint">Transcript / analysis pending</div>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Trophy size={20} color="var(--accent)" /> Score Breakdown
              </h2>
              <span className="muted">No duplicate metrics, single source of truth</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <StatBar label="Communication" value={perfMetrics.communicationAvg || 0} color="blue" />
              <StatBar label="Engagement" value={perfMetrics.engagementAvg || 0} color="purple" />
              <StatBar label="Structure" value={perfMetrics.structureAvg || 0} color="green" />
              <StatBar label="Technical" value={perfMetrics.technicalAvg || 0} color="orange" />
              <div style={{ gridColumn: "1 / -1" }}>
                <StatBar label="Q&A" value={perfMetrics.qaAvg || 0} color="blue" />
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === "calendar" && (
        <div className="card">
          <div className="card__head" style={{ flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarDays size={20} color="var(--accent)" /> Calendar Meetings
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="text"
                className="input"
                style={{ width: 240 }}
                placeholder="Search meeting title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button className="btn btn--ghost btn--sm" onClick={syncCalendarAndMeetings} disabled={syncing}>
                <RefreshCw size={14} /> {syncing ? "Syncing..." : "Sync"}
              </button>
            </div>
          </div>

          {!teamsConnected && !state.teamsLoading ? (
            <div className="alert info" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} />
              Teams is not connected for this consultant.
            </div>
          ) : state.teamsLoading ? (
            <div className="muted">Loading calendar meetings...</div>
          ) : (
            <div className="table">
              <div className="table__row table__row--head">
                <div>Meeting</div>
                <div>Schedule</div>
                <div>Status</div>
                <div>Action</div>
              </div>
              {filteredCalMeetings.map((m) => {
                const teamsId = m.joinUrl || m.id;
                const monitored = monitoredMap.get(teamsId);
                const startAt = m.startTime ? new Date(m.startTime) : null;
                const statusLabel = monitored
                  ? monitored.analysisStatus === "completed"
                    ? "Analyzed"
                    : monitored.transcriptStatus === "ready"
                      ? "Transcript Ready"
                      : "Monitoring"
                  : "Not Started";
                return (
                  <div className="table__row" key={m.id}>
                    <div className="ellipsis" style={{ fontWeight: 600 }}>
                      {m.subject || m.title || "Teams Meeting"}
                    </div>
                    <div className="muted">{startAt ? startAt.toLocaleString() : "—"}</div>
                    <div>
                      <span className={`badge ${statusLabel === "Analyzed" ? "badge--green" : statusLabel === "Not Started" ? "badge--amber" : "badge--blue"}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {monitored?.id ? (
                        <button
                          className="btn btn--sm"
                          onClick={() => joinMeeting(monitored.id)}
                          disabled={state.joiningMeetingId === monitored.id}
                          type="button"
                        >
                          <PlayCircle size={14} />
                          {state.joiningMeetingId === monitored.id ? "Joining..." : "Join"}
                        </button>
                      ) : (
                        <button
                          className="btn btn--sm"
                          onClick={() => ensureMonitoredAndJoin(m)}
                          type="button"
                        >
                          <PlayCircle size={14} /> Join
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredCalMeetings.length === 0 && (
                <div className="muted" style={{ padding: 18 }}>No calendar meetings found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "reports" && (
        <div className="card">
          <div className="card__head">
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileText size={20} color="var(--purple)" /> My Reports
            </h2>
            <span className="muted">{completedMeetings.length} reports</span>
          </div>
          <div className="table">
            <div className="table__row table__row--head">
              <div>Meeting</div>
              <div>Date</div>
              <div>Score</div>
              <div>Report</div>
            </div>
            {completedMeetings.map((m) => {
              const sc = scoreOrNull(m.score);
              return (
                <div className="table__row" key={m.id}>
                  <div className="ellipsis" style={{ fontWeight: 600 }}>{m.title}</div>
                  <div className="muted">{new Date(m.startTime).toLocaleDateString("en-IN")}</div>
                  <div>{sc != null ? <span className="badge badge--green">{sc}/100</span> : "—"}</div>
                  <div>
                    <Link className="btn btn--ghost btn--sm" to={`/reports/${m.id}`}>
                      View Report
                    </Link>
                  </div>
                </div>
              );
            })}
            {completedMeetings.length === 0 && (
              <div className="muted" style={{ padding: 20 }}>
                No analyzed meetings yet. Join meetings from the Calendar tab.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
