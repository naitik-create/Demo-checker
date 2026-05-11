import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { parseTranscriptFile } from "../utils/transcriptParser.js";
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
  Trash2,
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



const SCORE_DIMENSIONS = [
  { label: "Discovery",     key: "discoveryAvg",   max: 75, color: "#3b82f6", gradient: "135deg, #1d4ed8, #3b82f6" },
  { label: "Rapport",       key: "rapportAvg",      max: 70, color: "#10b981", gradient: "135deg, #059669, #10b981" },
  { label: "Demo Delivery", key: "demoAvg",         max: 85, color: "#8b5cf6", gradient: "135deg, #6d28d9, #8b5cf6" },
  { label: "Objections",    key: "objectionsAvg",   max: 70, color: "#f59e0b", gradient: "135deg, #d97706, #f59e0b" },
  { label: "Engagement",    key: "engagementAvg",   max: 80, color: "#ec4899", gradient: "135deg, #db2777, #ec4899" },
  { label: "Closing",       key: "closeAvg",        max: 65, color: "#14b8a6", gradient: "135deg, #0d9488, #14b8a6" },
];

function dimGrade(pct) {
  if (pct >= 80) return { label: "Excellent", color: "#10b981" };
  if (pct >= 60) return { label: "Good",      color: "#3b82f6" };
  if (pct >= 40) return { label: "Average",   color: "#f59e0b" };
  return             { label: "Needs Work",   color: "#ef4444" };
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
  const [dateFilter, setDateFilter] = useState("today"); // all | today | yesterday | tomorrow | this_week | custom
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [localDemoMap, setLocalDemoMap] = useState(new Map()); // calEventId → boolean (instant UI state)
  const [showDemoOnly, setShowDemoOnly] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualMeeting, setManualMeeting] = useState({
    title: "",
    startTime: "",
    endTime: "",
    productName: "ServiceOps"
  });
  const [uploadingMeetingId, setUploadingMeetingId] = useState("");
  // isDemoMap derived from DB meetings — keyed by teamsMeetingId
  const isDemoMap = useMemo(() => {
    const map = new Map();
    state.meetings.forEach(m => map.set(m.teamsMeetingId, m.isDemo || false));
    return map;
  }, [state.meetings]);

  // allMeetingsMap: teamsMeetingId (and joinUrl) -> full DB meeting object
  const allMeetingsMap = useMemo(() => {
    const map = new Map();
    state.meetings.forEach(m => {
      map.set(m.teamsMeetingId, m);
      if (m.joinUrl) map.set(m.joinUrl, m);
    });
    return map;
  }, [state.meetings]);

  async function toggleIsDemo(calMeeting) {
    const calId = calMeeting.id;
    // Current value: local override first, then DB state, then false
    const currentIsDemo = localDemoMap.has(calId)
      ? localDemoMap.get(calId)
      : (isDemoMap.get(calId) || false);
    const newVal = !currentIsDemo;

    // Instant visual update — no waiting for API
    setLocalDemoMap(m => new Map(m).set(calId, newVal));

    try {
      const startVal = calMeeting.startTimeIso || calMeeting.startTime;
      const endVal   = calMeeting.endTimeIso   || calMeeting.endTime;
      await apiFetch("/api/meetings/upsert-demo", {
        method: "PATCH",
        auth: true,
        body: {
          teamsMeetingId: calId,
          isDemo: newVal,
          title: calMeeting.subject || calMeeting.title || "Teams Meeting",
          startTime: startVal || new Date().toISOString(),
          endTime: endVal || new Date(Date.now() + 3600000).toISOString(),
          joinUrl: calMeeting.joinUrl || null
        }
      });
      // Keep state.meetings in sync so isDemoMap is accurate for the session
      setState(s => ({
        ...s,
        meetings: s.meetings.map(m => m.teamsMeetingId === calId ? { ...m, isDemo: newVal } : m)
      }));
    } catch {
      // Revert visual state on failure
      setLocalDemoMap(m => new Map(m).set(calId, currentIsDemo));
    }
  }

  async function fetchCalendarForRange(from, to) {
    if (!from || !to) return;
    setCalendarLoading(true);
    try {
      const td = await apiFetch(`/api/teams/me?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { auth: true });
      setState(s => ({ ...s, teamsData: td }));
    } catch (e) {
      setState(s => ({ ...s, error: e.message || "Failed to load calendar" }));
    } finally {
      setCalendarLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const meetingsRes = await apiFetch("/api/meetings?limit=1000", { auth: true });
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
              return apiFetch("/api/meetings?limit=1000", { auth: true });
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
      const meetingsRes = await apiFetch("/api/meetings?limit=1000", { auth: true });
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
        apiFetch("/api/meetings?limit=1000", { auth: true }),
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

  async function handleCreateManualMeeting(e) {
    e.preventDefault();
    try {
      setState((s) => ({ ...s, loading: true, error: "" }));
      
      let start = new Date(manualMeeting.startTime);
      let end = manualMeeting.endTime ? new Date(manualMeeting.endTime) : new Date(start.getTime() + 30 * 60000);

      await apiFetch("/api/meetings/monitor", {
        method: "POST",
        auth: true,
        body: {
          title: manualMeeting.title,
          teamsMeetingId: `manual-${Date.now()}`,
          consultantId: user.id || user._id,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          monitored: true,
          productName: manualMeeting.productName
        }
      });
      setShowManualAdd(false);
      setManualMeeting({ title: "", startTime: "", endTime: "", productName: "ServiceOps" });
      await refreshMeetingsOnly();
      alert("Manual meeting added to calendar.");
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to create manual meeting" }));
    } finally {
      setState((s) => ({ ...s, loading: false }));
    }
  }

  async function handleFileUpload(meetingId, file) {
    if (!file) return;
    try {
      setUploadingMeetingId(meetingId);

      let transcriptText;
      try {
        transcriptText = await parseTranscriptFile(file);
      } catch (parseErr) {
        throw new Error(`Could not read file: ${parseErr.message}`);
      }

      if (!transcriptText || transcriptText.trim().length < 50) {
        throw new Error("Transcript is too short or empty to analyse.");
      }

      await apiFetch("/api/meetings/manual-analysis", {
        method: "POST",
        auth: true,
        body: { meetingId, transcriptText }
      });

      await refreshMeetingsOnly();
      alert("Transcript uploaded and analysis triggered successfully!");
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to upload and analyse transcript" }));
    } finally {
      setUploadingMeetingId("");
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
      setState((s) => ({ ...s, joiningMeetingId: calMeeting.id }));
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
      const refreshed = await apiFetch("/api/meetings?limit=1000", { auth: true });
      const monitoredMeeting = (refreshed.meetings || []).find((m) => m.teamsMeetingId === teamsId);
      setState((s) => ({
        ...s,
        meetings: refreshed.meetings || [],
        totalMeetings: refreshed.total ?? refreshed.meetings?.length ?? 0
      }));
      if (monitoredMeeting?.id) {
        await joinMeeting(monitoredMeeting.id);
      } else {
        setState((s) => ({ ...s, joiningMeetingId: "" }));
      }
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Unable to prepare meeting for join", joiningMeetingId: "" }));
    }
  }

  async function ensureMonitoredAndUpload(calMeeting, file) {
    if (!file) return;
    try {
      const teamsId = calMeeting.joinUrl || calMeeting.id;
      setUploadingMeetingId(teamsId);
      
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
      const refreshed = await apiFetch("/api/meetings?limit=1000", { auth: true });
      const monitoredMeeting = (refreshed.meetings || []).find((m) => m.teamsMeetingId === teamsId);
      setState((s) => ({
        ...s,
        meetings: refreshed.meetings || [],
        totalMeetings: refreshed.total ?? refreshed.meetings?.length ?? 0
      }));

      if (monitoredMeeting?.id) {
        await handleFileUpload(monitoredMeeting.id, file);
      } else {
        throw new Error("Could not prepare meeting for upload");
      }
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to prepare meeting for upload" }));
      setUploadingMeetingId("");
    }
  }

  const isDemoCount = useMemo(() => {
    const calMeetings = state.teamsData?.calendarMeetings || [];
    // Count using server-enriched m.isDemo, overridden by any local toggles this session
    const calIds = new Set(calMeetings.map(m => m.id));
    const fromCal = calMeetings.filter(m =>
      localDemoMap.has(m.id) ? localDemoMap.get(m.id) : m.isDemo
    ).length;
    // Also count DB meetings not visible in calendar (manual, past synced) with local overrides
    const stateIds = new Set(state.meetings.map(m => m.teamsMeetingId));
    const extraFromLocal = [...localDemoMap.entries()]
      .filter(([calId, val]) => val && !calIds.has(calId) && !stateIds.has(calId))
      .length;
    return fromCal + extraFromLocal;
  }, [state.teamsData?.calendarMeetings, state.meetings, localDemoMap]);

  async function handleDeleteMeeting(meetingId) {
    if (!window.confirm("Are you sure you want to delete this meeting entry and all its related reports?")) return;
    try {
      await apiFetch(`/api/meetings/${meetingId}`, {
        method: "DELETE",
        auth: true
      });
      await refreshMeetingsOnly();
      alert("Meeting deleted successfully.");
    } catch (e) {
      setState((s) => ({ ...s, error: e.message || "Failed to delete meeting" }));
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
    // Teams live calendar events
    const calMeetings = td?.calendarMeetings || [];
    const calIds = new Set(calMeetings.map(m => m.id).filter(Boolean));

    // Manual meetings saved to DB
    const manualDbMeetings = state.meetings
      .filter((m) => m.teamsMeetingId?.startsWith("manual-"))
      .map((m) => ({
        id: m.teamsMeetingId,
        title: m.title,
        subject: m.title,
        startTime: m.startTime,
        startTimeIso: m.startTime,
        isManual: true
      }));

    // DB-synced Teams meetings — always merged in, deduplicated against live calendar
    const dbSyncedMeetings = state.meetings
      .filter(m => !m.teamsMeetingId?.startsWith("manual-") && !calIds.has(m.teamsMeetingId))
      .map(m => ({
        id: m.teamsMeetingId,
        subject: m.title,
        title: m.title,
        startTime: m.startTime,
        startTimeIso: m.startTime,
        endTime: m.endTime,
        endTimeIso: m.endTime,
        joinUrl: m.raw?.joinUrl || null,
        isDemo: m.isDemo || false,
        isFromDb: true
      }));

    // Deduplicate: same title + same start minute = same meeting
    const seen = new Set();
    const dedup = (list) => list.filter(m => {
      const key = `${(m.subject || m.title || "").trim().toLowerCase()}__${m.startTimeIso || m.startTime || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let meetings = dedup([...calMeetings, ...manualDbMeetings, ...dbSyncedMeetings]);
    const q = searchTerm.toLowerCase().trim();
    
    // Apply text search
    if (q) {
      meetings = meetings.filter(m => (m.subject || m.title || "").toLowerCase().includes(q));
    }

    // Apply date filter
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    meetings = meetings.filter(m => {
      if (dateFilter === "all") return true;
      const startAt = m.startTimeIso ? new Date(m.startTimeIso) : (m.startTime ? new Date(m.startTime) : null);
      if (!startAt) return false;

      const meetingDate = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());

      if (dateFilter === "today") return meetingDate.getTime() === today.getTime();
      if (dateFilter === "yesterday") return meetingDate.getTime() === yesterday.getTime();
      if (dateFilter === "tomorrow") return meetingDate.getTime() === tomorrow.getTime();
      if (dateFilter === "this_week") return meetingDate >= startOfWeek && meetingDate <= endOfWeek;

      if (dateFilter === "custom") {
        const start = customStartDate ? new Date(customStartDate) : null;
        const end = customEndDate ? new Date(customEndDate) : null;

        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);

        if (start && end) return startAt >= start && startAt <= end;
        if (start) return startAt >= start;
        if (end) return startAt <= end;
        return true;
      }

      return true;
    });

    // Is Demo filter
    if (showDemoOnly) {
      meetings = meetings.filter(m =>
        localDemoMap.has(m.id) ? localDemoMap.get(m.id) : (m.isDemo || !!isDemoMap.get(m.id))
      );
    }

    return meetings;
  }, [td?.calendarMeetings, state.meetings, searchTerm, dateFilter, customStartDate, customEndDate, showDemoOnly, localDemoMap, isDemoMap]);

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
              <div className="kpi__value kpi__value--blue">{isDemoCount}</div>
              <div className="kpi__hint">Marked as demo</div>
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

          <div className="card" style={{ background: "linear-gradient(135deg, rgba(30,27,75,0.6), rgba(17,24,39,0.8))" }}>
            <div className="card__head" style={{ marginBottom: 20 }}>
              <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1.2rem", fontWeight: 800 }}>
                <Trophy size={20} color="var(--accent)" /> Score Breakdown
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  fontSize: "1.5rem", fontWeight: 800,
                  color: scoreColor(avgScoreValue),
                  background: `${scoreColor(avgScoreValue)}18`,
                  border: `1px solid ${scoreColor(avgScoreValue)}44`,
                  borderRadius: 10, padding: "4px 14px"
                }}>
                  {avgScoreValue} <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>/ 100</span>
                </div>
                <span className="muted" style={{ fontSize: "0.8rem" }}>Overall avg</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {SCORE_DIMENSIONS.map((dim) => {
                const raw = Number(perfMetrics[dim.key] ?? 0);
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
                    {/* Subtle accent strip at top */}
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0, height: 3,
                      background: `linear-gradient(${dim.gradient})`
                    }} />

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <span style={{
                        fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)",
                        textTransform: "uppercase", letterSpacing: "0.06em"
                      }}>
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
                        height: "100%", borderRadius: 99,
                        width: `${pct}%`,
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
        </>
      )}

      {activeTab === "calendar" && (
        <div className="card">
          <div className="card__head" style={{ flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <CalendarDays size={20} color="var(--accent)" /> Calendar Meetings
              </h2>
              <button 
                className="btn btn--blue btn--sm" 
                onClick={() => setShowManualAdd(!showManualAdd)}
              >
                {showManualAdd ? "Cancel" : "+ Add Meeting"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="text"
                className="input"
                style={{ width: 200 }}
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button className="btn btn--ghost btn--sm" onClick={syncCalendarAndMeetings} disabled={syncing}>
                <RefreshCw size={14} className={syncing ? "spin" : ""} /> {syncing ? "Syncing..." : "Sync"}
              </button>
            </div>
          </div>

          {/* Quick Date Filters */}
          <div style={{ display: "flex", gap: 8, padding: "0 16px 16px", borderBottom: "1px solid var(--card-border)", alignItems: "center", flexWrap: "wrap" }}>
            {["yesterday", "today", "tomorrow", "this_week", "all", "custom"].map(f => (
              <button
                key={f}
                className={`btn btn--sm ${dateFilter === f ? "btn--blue" : "btn--ghost"}`}
                onClick={() => setDateFilter(f)}
                style={{ textTransform: "capitalize" }}
              >
                {f.replace("_", " ")}
              </button>
            ))}

            {/* Is Demo filter — visually separated */}
            <div style={{ width: 1, height: 22, background: "var(--card-border)", margin: "0 4px", flexShrink: 0 }} />
            <button
              className="btn btn--sm"
              onClick={() => setShowDemoOnly(v => !v)}
              style={{
                background: showDemoOnly ? "rgba(99,102,241,0.18)" : "transparent",
                color: showDemoOnly ? "var(--accent)" : "var(--text-muted)",
                border: showDemoOnly ? "1px solid rgba(99,102,241,0.45)" : "1px solid var(--card-border)",
                fontWeight: showDemoOnly ? 700 : 500,
                gap: 6, display: "inline-flex", alignItems: "center"
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: showDemoOnly ? "var(--accent)" : "var(--text-muted)",
                flexShrink: 0
              }} />
              Is Demo
            </button>
            
            {dateFilter === "custom" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
                <input 
                  type="date" 
                  className="input" 
                  style={{ padding: "4px 8px", fontSize: "0.85rem", height: "auto" }}
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                />
                <span className="muted" style={{ fontSize: "0.85rem" }}>to</span>
                <input
                  type="date"
                  className="input"
                  style={{ padding: "4px 8px", fontSize: "0.85rem", height: "auto" }}
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn--sm btn--blue"
                  disabled={calendarLoading || !customStartDate || !customEndDate}
                  onClick={() => fetchCalendarForRange(customStartDate, customEndDate)}
                >
                  {calendarLoading ? "Loading…" : "Apply"}
                </button>
              </div>
            )}
          </div>

          {showManualAdd && (
            <form 
              onSubmit={handleCreateManualMeeting} 
              style={{ 
                padding: 16, 
                background: "rgba(255,255,255,0.02)", 
                borderBottom: "1px solid var(--card-border)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
                alignItems: "end"
              }}
            >
              <label className="field" style={{ marginBottom: 0 }}>
                <div className="field__label">Title</div>
                <input 
                  className="input" 
                  value={manualMeeting.title} 
                  onChange={e => setManualMeeting(m => ({ ...m, title: e.target.value }))}
                  placeholder="Demo Title"
                  required
                />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <div className="field__label">Start Time</div>
                <input 
                  type="datetime-local" 
                  className="input" 
                  value={manualMeeting.startTime}
                  onChange={e => setManualMeeting(m => ({ ...m, startTime: e.target.value }))}
                  onClick={(e) => e.target.showPicker?.()}
                  required
                />
              </label>

              <button className="btn btn--blue" type="submit" disabled={state.loading}>
                {state.loading ? "Adding..." : "Save Meeting"}
              </button>
            </form>
          )}

          {!teamsConnected && !state.teamsLoading && !showManualAdd ? (
            <div className="alert info" style={{ display: "flex", alignItems: "center", gap: 8, margin: 16 }}>
              <AlertTriangle size={16} />
              Teams is not connected. Use "+ Add Meeting" above to manually track external demos.
            </div>
          ) : state.teamsLoading ? (
            <div className="muted" style={{ padding: 16 }}>Loading calendar meetings...</div>
          ) : (
            <div className="cal-table">
              {/* Header */}
              <div className="cal-row cal-row--head">
                <div>Meeting</div>
                <div>Schedule</div>
                <div>Status</div>
                <div style={{ textAlign: "center" }}>Is Demo?</div>
                <div>Action</div>
              </div>

              {filteredCalMeetings.map((m) => {
                const teamsId = m.joinUrl || m.id;
                const monitored = monitoredMap.get(teamsId);
                const startAt = m.startTime ? new Date(m.startTime) : null;
                // localDemoMap wins (instant UI), then server-enriched m.isDemo, then isDemoMap fallback
                const isDemo = localDemoMap.has(m.id) ? localDemoMap.get(m.id) : (m.isDemo || !!isDemoMap.get(m.id));
                const isJoining = state.joiningMeetingId === (monitored?.id || m.id);
                const isUploading = uploadingMeetingId === monitored?.id || uploadingMeetingId === teamsId;

                const statusLabel = monitored
                  ? monitored.analysisStatus === "completed"
                    ? "Analyzed"
                    : monitored.transcriptStatus === "ready"
                      ? "Transcript Ready"
                      : "Monitoring"
                  : "Not Started";

                const statusColor = statusLabel === "Analyzed"
                  ? "#10b981"
                  : statusLabel === "Transcript Ready"
                    ? "#3b82f6"
                    : statusLabel === "Monitoring"
                      ? "#8b5cf6"
                      : "#f59e0b";

                const isAnalyzed = statusLabel === "Analyzed";
                const hasTranscript = statusLabel === "Transcript Ready";
                const rowBorderColor = isAnalyzed ? "#10b981" : hasTranscript ? "#3b82f6" : isDemo ? "var(--accent)" : "transparent";
                const rowBg = isAnalyzed ? "rgba(16,185,129,0.06)" : hasTranscript ? "rgba(59,130,246,0.05)" : "transparent";
                const totalScore = monitored?.score?.totalScore ?? null;

                return (
                  <div
                    className="cal-row"
                    key={m.id}
                    style={{ borderLeft: `3px solid ${rowBorderColor}`, background: rowBg, transition: "background 0.2s" }}
                  >
                    {/* Meeting title */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-main)", lineHeight: 1.4 }}>
                          {m.subject || m.title || "Teams Meeting"}
                        </span>
                        {m.isManual && (
                          <span style={{
                            fontSize: "0.65rem", fontWeight: 700, padding: "1px 7px",
                            borderRadius: 99, background: "rgba(167,139,250,0.15)",
                            color: "var(--purple)", border: "1px solid rgba(167,139,250,0.3)",
                            whiteSpace: "nowrap"
                          }}>
                            Manual
                          </span>
                        )}
                        {isAnalyzed && totalScore !== null && (
                          <span style={{
                            fontSize: "0.68rem", fontWeight: 800, padding: "2px 8px",
                            borderRadius: 99, background: "rgba(16,185,129,0.18)",
                            color: "#10b981", border: "1px solid rgba(16,185,129,0.35)",
                            whiteSpace: "nowrap"
                          }}>
                            Score: {totalScore}
                          </span>
                        )}
                        {hasTranscript && (
                          <span style={{
                            fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px",
                            borderRadius: 99, background: "rgba(59,130,246,0.15)",
                            color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)",
                            whiteSpace: "nowrap"
                          }}>
                            Transcript Ready
                          </span>
                        )}
                      </div>
                      {monitored && (
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 3 }}>
                          {monitored.joinedFromSystem ? "Joined from system" : "Monitored"}
                        </div>
                      )}
                    </div>

                    {/* Schedule */}
                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                      {startAt ? (
                        <>
                          <div style={{ fontWeight: 500, color: "var(--text-main)" }}>
                            {startAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })}
                          </div>
                          <div>
                            {startAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })}
                          </div>
                        </>
                      ) : "—"}
                    </div>

                    {/* Status */}
                    <div>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: "0.78rem", fontWeight: 700, padding: "4px 10px",
                        borderRadius: 99, border: `1px solid ${statusColor}40`,
                        background: `${statusColor}18`, color: statusColor,
                        whiteSpace: "nowrap"
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                        {statusLabel}
                      </span>
                    </div>

                    {/* Is Demo toggle */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <div className="toggle" onClick={() => toggleIsDemo(m)} title={isDemo ? "Marked as demo" : "Mark as demo"}>
                        <div className={`toggle__track${isDemo ? " toggle__track--on" : ""}`}>
                          <div className={`toggle__thumb${isDemo ? " toggle__thumb--on" : ""}`} />
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "nowrap" }}>
                      <button
                        className="btn btn--sm"
                        onClick={() => monitored?.id ? joinMeeting(monitored.id) : ensureMonitoredAndJoin(m)}
                        disabled={isJoining}
                        type="button"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        <PlayCircle size={13} />
                        {isJoining ? "Joining…" : "Join"}
                      </button>

                      <label
                        className="btn btn--ghost btn--sm"
                        style={{ cursor: "pointer", margin: 0, whiteSpace: "nowrap" }}
                        title="Upload Transcript"
                      >
                        <input
                          type="file"
                          style={{ display: "none" }}
                          accept=".txt,.srt,.json,.docx,.doc"
                          onChange={(e) => {
                            if (monitored?.id) {
                              handleFileUpload(monitored.id, e.target.files[0]);
                            } else {
                              ensureMonitoredAndUpload(m, e.target.files[0]);
                            }
                            e.target.value = "";
                          }}
                        />
                        {isUploading ? "…" : <FileText size={13} />}
                      </label>

                      {isAnalyzed && monitored?.id && (
                        <Link
                          to={`/reports/${monitored.id}`}
                          className="btn btn--sm"
                          style={{
                            background: "rgba(16,185,129,0.15)", color: "#10b981",
                            border: "1px solid rgba(16,185,129,0.35)", whiteSpace: "nowrap",
                            textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4
                          }}
                          title="View Analysis Report"
                        >
                          <Star size={12} /> Report
                        </Link>
                      )}

                      {monitored?.id && (
                        <button
                          className="btn btn--ghost btn--sm"
                          style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.25)", padding: "6px 8px" }}
                          onClick={() => handleDeleteMeeting(monitored.id)}
                          title="Delete"
                          type="button"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredCalMeetings.length === 0 && (
                <div style={{ padding: "24px 20px", textAlign: "center" }}>
                  {td?.calendarError ? (
                    <div className="alert" style={{ marginBottom: 8, textAlign: "left" }}>
                      Could not load live calendar from Microsoft Teams: {td.calendarError}<br/>
                      <span className="muted" style={{ fontSize: "0.8rem" }}>Click <strong>Sync</strong> to refresh, or reconnect Teams if the issue persists.</span>
                    </div>
                  ) : (
                    <span className="muted">No calendar meetings found. Try clicking <strong>Sync</strong> or switching to <strong>All</strong>.</span>
                  )}
                </div>
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
