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
    return (
      <div className="page">
        <div className="header">
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link2 size={26} color="var(--accent)" /> Microsoft Teams
          </h1>
          <p>Your Microsoft 365 account is connected.</p>
        </div>

        {state.toast && (
          <div className="alert" style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(34,197,94,0.12)", color: "#4ade80", borderColor: "rgba(34,197,94,0.3)"
          }}>
            <CheckCircle size={18} /> {state.toast}
          </div>
        )}

        <div className="card" style={{ background: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.2)" }}>
          <div className="card__head">
            <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1rem" }}>
              <CheckCircle size={18} color="#4ade80" /> Connected Microsoft Account
            </h2>
          </div>
          {p && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginTop: 8 }}>
              {p.displayName && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <User size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <div>
                    <div className="muted" style={{ fontSize: "0.7rem" }}>Name</div>
                    <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{p.displayName}</div>
                  </div>
                </div>
              )}
              {p.email && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Mail size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <div>
                    <div className="muted" style={{ fontSize: "0.7rem" }}>Email</div>
                    <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{p.email}</div>
                  </div>
                </div>
              )}
              {p.jobTitle && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Briefcase size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <div>
                    <div className="muted" style={{ fontSize: "0.7rem" }}>Job Title</div>
                    <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{p.jobTitle}</div>
                  </div>
                </div>
              )}
              {p.department && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Building size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <div>
                    <div className="muted" style={{ fontSize: "0.7rem" }}>Department</div>
                    <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{p.department}</div>
                  </div>
                </div>
              )}
              {p.officeLocation && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MapPin size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <div>
                    <div className="muted" style={{ fontSize: "0.7rem" }}>Office</div>
                    <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{p.officeLocation}</div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
            <button className="btn btn--ghost" type="button" onClick={onManualConnect}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} /> Reconnect
            </button>
            <Link className="link" to="/consultant" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <ArrowLeft size={14} /> Back to Dashboard
            </Link>
          </div>
        </div>
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
