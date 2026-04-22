import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  CheckCircle, RefreshCw, Link2, User, Mail,
  Briefcase, Building, MapPin, ArrowLeft, AlertTriangle
} from "lucide-react";

function friendlyError(raw) {
  if (!raw) return "Teams connection failed. Please try again.";
  if (raw.includes("consent_cancelled") || raw.includes("access_denied"))
    return "You cancelled the Microsoft sign-in. Click 'Connect Teams' to try again.";
  if (raw.includes("redirect_uri_mismatch"))
    return "Configuration error: redirect URI not registered in Azure. Contact your admin.";
  if (raw.includes("admin_consent_granted_relogin"))
    return "Admin consent was granted. Please click 'Connect Teams' again to complete sign-in.";
  if (raw.includes("admin_consent") || raw.includes("AADSTS65001"))
    return "Admin consent required. Ask your IT admin to go to Azure Portal → API Permissions → Grant admin consent.";
  if (raw.includes("no_refresh_token"))
    return "Microsoft did not return a refresh token. Ask your IT admin to grant admin consent in Azure Portal → API Permissions.";
  if (raw.includes("Invalid or expired state"))
    return "Sign-in timed out (took more than 10 minutes). Please try again.";
  return `Connection failed: ${raw}`;
}

export default function ConsultantConnectTeamsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const autoTriggered = useRef(false);

  const [state, setState] = useState({
    // "loading-status" = fetching /teams/me
    // "auto-connecting" = auto-triggered OAuth, fetching the URL
    // "redirecting" = navigating to Microsoft
    // "idle" = showing connect button (after error or reconnect)
    // "connected" = already connected
    phase: "loading-status",
    error: "",
    toast: "",
    teamsData: null
  });

  const teamsParam = searchParams.get("teams");
  const reasonParam = searchParams.get("reason");

  // Step 1: handle OAuth callback result params first
  useEffect(() => {
    if (!teamsParam) return;
    if (teamsParam === "error") {
      setState((s) => ({ ...s, phase: "idle", error: friendlyError(reasonParam), toast: "" }));
    } else if (teamsParam === "connected") {
      // Reload profile, then trigger another sync to ensure meetings are up to date
      setState((s) => ({ ...s, phase: "loading-status" }));
      apiFetch("/api/teams/me", { auth: true })
        .then(async (td) => {
          setState((s) => ({ ...s, phase: "syncing", teamsData: td, toast: "", error: "" }));
          try {
            await apiFetch("/api/meetings/sync", { auth: true });
          } catch {
            // sync failure is non-fatal
          }
          setState((s) => ({ ...s, phase: "connected", toast: "Microsoft Teams connected! Your meetings have been synced.", error: "" }));
        })
        .catch(() => setState((s) => ({ ...s, phase: "connected", toast: "Microsoft Teams connected successfully!", error: "" })));
    }
    setSearchParams({}, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsParam]);

  // Step 2: load current Teams status
  useEffect(() => {
    if (teamsParam) return; // handled by the callback effect above
    let alive = true;
    apiFetch("/api/teams/me", { auth: true })
      .then((td) => {
        if (!alive) return;
        if (td?.connected) {
          setState((s) => ({ ...s, phase: "connected", teamsData: td }));
        } else {
          // Not connected — auto-trigger the OAuth flow (no second click needed)
          setState((s) => ({ ...s, phase: "auto-connecting", teamsData: td }));
        }
      })
      .catch(() => {
        if (!alive) return;
        // Can't load status — fall through to manual connect button
        setState((s) => ({ ...s, phase: "auto-connecting" }));
      });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 3: when phase becomes "auto-connecting", fetch OAuth URL and redirect
  useEffect(() => {
    if (state.phase !== "auto-connecting") return;
    if (autoTriggered.current) return;
    autoTriggered.current = true;

    apiFetch("/api/teams/connect-url", { auth: true })
      .then((res) => {
        const url = res?.url;
        if (!url || typeof url !== "string") throw new Error("Server did not return a valid Teams connect URL.");
        setState((s) => ({ ...s, phase: "redirecting" }));
        window.location.assign(url);
      })
      .catch((e) => {
        setState((s) => ({
          ...s,
          phase: "idle",
          error: e.message || "Failed to get Teams connect URL. Please try again."
        }));
      });
  }, [state.phase]);

  async function onManualConnect() {
    autoTriggered.current = false; // allow retry
    setState((s) => ({ ...s, phase: "auto-connecting", error: "", toast: "" }));
  }

  // ── Full-screen overlay for loading / redirecting / syncing ──
  if (["redirecting", "auto-connecting", "loading-status", "syncing"].includes(state.phase)) {
    const msg =
      state.phase === "loading-status" ? "Checking Teams connection…" :
      state.phase === "auto-connecting" ? "Preparing Microsoft sign-in…" :
      state.phase === "syncing" ? "Syncing your calendar meetings…" :
      "Redirecting to Microsoft…";
    const sub =
      state.phase === "redirecting" ? "Sign in with your Microsoft 365 work account" :
      state.phase === "syncing" ? "Fetching your Teams meetings — this may take a few seconds" : "";

    return (
      <div style={{
        position: "fixed", inset: 0, background: "var(--bg,#0f172a)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 18, zIndex: 9999
      }}>
        <div style={{
          width: 52, height: 52,
          border: "4px solid rgba(255,255,255,0.15)",
          borderTop: "4px solid #6366f1",
          borderRadius: "50%",
          animation: "spin 0.9s linear infinite"
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: "#cbd5e1", fontSize: 18, margin: 0 }}>{msg}</p>
        {sub && <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>{sub}</p>}
      </div>
    );
  }

  const td = state.teamsData;
  const p = td?.profile;

  // ── Connected view ──
  if (state.phase === "connected") {
    const initials = p?.displayName
      ? p.displayName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
      : "MS";

    return (
      <div className="page">
        <div className="header">
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link2 size={26} color="var(--accent)" /> Microsoft Teams
          </h1>
          <p>Manage your Microsoft 365 account connection.</p>
        </div>

        {state.toast && (
          <div className="alert" style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(34,197,94,0.12)", color: "#4ade80", borderColor: "rgba(34,197,94,0.3)"
          }}>
            <CheckCircle size={18} /> {state.toast}
          </div>
        )}

        {/* Status hero */}
        <div className="card" style={{
          background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03))",
          borderColor: "rgba(34,197,94,0.25)",
          display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", padding: "24px 28px"
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg,#6366f1,#38bdf8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 700, color: "#fff"
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <CheckCircle size={18} color="#4ade80" />
              <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>
                {p?.displayName || "Microsoft Account"}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "rgba(34,197,94,0.15)", color: "#4ade80",
                borderRadius: 20, padding: "2px 10px", fontSize: "0.72rem", fontWeight: 600
              }}>
                Connected
              </span>
            </div>
            <div className="muted" style={{ fontSize: "0.85rem" }}>{p?.email || ""}</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <button className="btn btn--ghost btn--sm" type="button" onClick={onManualConnect}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} /> Reconnect
            </button>
            <Link className="btn btn--sm" to="/consultant"
              style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <ArrowLeft size={14} /> Dashboard
            </Link>
          </div>
        </div>

        {/* Profile details */}
        {p && (
          <div className="card">
            <div className="card__head">
              <h2 style={{ fontSize: "0.95rem", display: "flex", alignItems: "center", gap: 8 }}>
                <User size={16} color="var(--accent)" /> Account Details
              </h2>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 20, marginTop: 4
            }}>
              {[
                { icon: <User size={15} />, label: "Full Name", value: p.displayName },
                { icon: <Mail size={15} />, label: "Email", value: p.email },
                { icon: <Briefcase size={15} />, label: "Job Title", value: p.jobTitle },
                { icon: <Building size={15} />, label: "Department", value: p.department },
                { icon: <MapPin size={15} />, label: "Office", value: p.officeLocation },
              ].filter((f) => f.value).map((f) => (
                <div key={f.label} style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "14px 16px",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--card-border)"
                }}>
                  <span style={{ color: "var(--accent)", marginTop: 1, flexShrink: 0 }}>{f.icon}</span>
                  <div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginBottom: 3 }}>{f.label}</div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{f.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Idle / error view (manual connect button) ──
  return (
    <div className="page">
      <div className="header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link2 size={26} color="var(--accent)" /> Microsoft Teams
        </h1>
        <p>Connect your Microsoft 365 account to enable meeting sync and AI analysis.</p>
      </div>

      {state.error && (
        <div className="alert" style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Connection failed</strong>
            <div style={{ marginTop: 4, fontSize: "0.9rem" }}>{state.error}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card__head">
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={18} /> Connect Your Microsoft Account
          </h2>
          <span className="muted">{user?.email}</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Sign in with your Microsoft 365 work account (<strong>{user?.email}</strong>) to enable
          calendar sync, meeting monitoring, and AI analysis.
        </p>
        <button className="btn" type="button" onClick={onManualConnect}
          style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link2 size={16} /> Connect Teams
        </button>
      </div>
    </div>
  );
}
