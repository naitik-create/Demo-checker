import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiFetch } from "../api/client.js";
import {
  User, Mail, Shield, Link2, CheckCircle, RefreshCw
} from "lucide-react";

export default function AccountPage() {
  const { user } = useAuth();
  const [state, setState] = useState({
    loading: false,
    error: "",
    msConnected: false,
    teamsData: null,
    teamsLoading: true
  });

  // Load teams data for consultants
  useEffect(() => {
    if (user?.role !== "consultant") {
      setState(s => ({ ...s, teamsLoading: false }));
      return;
    }
    let alive = true;
    apiFetch("/api/teams/me", { auth: true })
      .then(td => {
        if (alive) setState(s => ({ ...s, teamsData: td, msConnected: td?.connected === true, teamsLoading: false }));
      })
      .catch(() => {
        if (alive) setState(s => ({ ...s, teamsLoading: false }));
      });
    return () => { alive = false; };
  }, [user?.role]);

  // Also check URL params for oauth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("teams") === "connected") setState(s => ({ ...s, msConnected: true, error: "" }));
    if (params.get("teams") === "error") setState(s => ({ ...s, error: "Microsoft Teams connection failed." }));
  }, []);

  async function onConnectTeams() {
    setState(s => ({ ...s, loading: true, error: "" }));
    try {
      const res = await apiFetch("/api/teams/connect-url", { auth: true });
      if (res?.url) window.location.href = res.url;
      else setState(s => ({ ...s, loading: false, error: "Did not receive connect URL." }));
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e.message || "Failed to start Teams connect." }));
    }
  }

  const p = state.teamsData?.profile;

  return (
    <div className="page">
      <div className="header">
        <h1 style={{display:"flex",alignItems:"center",gap:10}}>
          <User size={26} color="var(--accent)"/> Account
        </h1>
        <p>Profile and integrations.</p>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}

      {/* Profile Card */}
      <div className="card">
        <div className="card__head">
          <h2 style={{display:"flex",alignItems:"center",gap:8}}>
            <User size={18}/> Profile
          </h2>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginTop:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <User size={14} style={{color:"var(--text-muted)",flexShrink:0}}/>
            <div>
              <div className="muted" style={{fontSize:"0.72rem"}}>Name</div>
              <div style={{fontWeight:500}}>{user?.name || "—"}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Mail size={14} style={{color:"var(--text-muted)",flexShrink:0}}/>
            <div>
              <div className="muted" style={{fontSize:"0.72rem"}}>Email</div>
              <div style={{fontWeight:500}}>{user?.email || "—"}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Shield size={14} style={{color:"var(--text-muted)",flexShrink:0}}/>
            <div>
              <div className="muted" style={{fontSize:"0.72rem"}}>Role</div>
              <div style={{fontWeight:500,textTransform:"capitalize"}}>{user?.role || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Microsoft Teams Connection */}
      <div className="card">
        <div className="card__head">
          <h2 style={{display:"flex",alignItems:"center",gap:8}}>
            <Link2 size={18}/> Microsoft Teams
          </h2>
          {state.msConnected && (
            <span className="badge badge--green" style={{display:"inline-flex",alignItems:"center",gap:4}}>
              <CheckCircle size={12}/> Connected
            </span>
          )}
        </div>

        {user?.role === "manager" ? (
          <p className="muted">Teams connection is managed per consultant from the <Link className="link" to="/manager/consultants">Consultants</Link> page.</p>
        ) : (
          <>
            {state.teamsLoading ? (
              <div className="muted">Checking connection…</div>
            ) : state.msConnected && p ? (
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginTop:4}}>
                  {p.displayName && (
                    <div>
                      <div className="muted" style={{fontSize:"0.72rem"}}>MS Account</div>
                      <div style={{fontWeight:500,fontSize:"0.9rem"}}>{p.displayName}</div>
                    </div>
                  )}
                  {p.email && (
                    <div>
                      <div className="muted" style={{fontSize:"0.72rem"}}>MS Email</div>
                      <div style={{fontWeight:500,fontSize:"0.9rem"}}>{p.email}</div>
                    </div>
                  )}
                  {p.jobTitle && (
                    <div>
                      <div className="muted" style={{fontSize:"0.72rem"}}>Job Title</div>
                      <div style={{fontWeight:500,fontSize:"0.9rem"}}>{p.jobTitle}</div>
                    </div>
                  )}
                  {p.department && (
                    <div>
                      <div className="muted" style={{fontSize:"0.72rem"}}>Department</div>
                      <div style={{fontWeight:500,fontSize:"0.9rem"}}>{p.department}</div>
                    </div>
                  )}
                </div>
                <div style={{marginTop:14}}>
                  <button className="btn btn--ghost" disabled={state.loading} onClick={onConnectTeams}
                    style={{display:"flex",alignItems:"center",gap:6}}>
                    <RefreshCw size={14}/> {state.loading ? "Opening…" : "Reconnect"}
                  </button>
                </div>
              </>
            ) : (
              <div>
                <p className="muted" style={{marginTop:0}}>
                  Connect your Microsoft 365 work account to enable calendar sync and meeting monitoring.
                </p>
                <button className="btn" disabled={state.loading} onClick={onConnectTeams}
                  style={{display:"flex",alignItems:"center",gap:8}}>
                  <Link2 size={16}/> {state.loading ? "Opening…" : "Connect Microsoft Teams"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
