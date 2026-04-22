import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import {
  Users, CheckCircle, XCircle, Mail, Eye, Info
} from "lucide-react";

export default function ManagerConsultantsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState({
    loading: true,
    error: "",
    toast: "",
    toastSuccess: false,
    consultants: []
  });

  const teamsParam = searchParams.get("teams");
  const reasonParam = searchParams.get("reason");

  useEffect(() => {
    if (!teamsParam) return;
    if (teamsParam === "error") {
      const raw = reasonParam || "Teams connection failed.";
      let msg;
      if (raw.includes("consent_cancelled")) {
        msg = "Microsoft sign-in was cancelled.";
      } else if (raw.includes("redirect_uri_mismatch")) {
        msg = "Azure error: Redirect URI mismatch. Add http://localhost:5000/api/teams/oauth/callback in Azure Portal → App Registration → Authentication.";
      } else if (raw.includes("admin_consent_granted_relogin")) {
        msg = "Admin consent was granted. The consultant should try connecting again.";
      } else if (raw.includes("admin_consent") || raw.includes("AADSTS65001")) {
        msg = "Admin consent required. Go to Azure Portal → API Permissions → Grant admin consent for your tenant.";
      } else if (raw.includes("no_refresh_token")) {
        msg = "Microsoft did not return a refresh token. Go to Azure Portal → API Permissions → Grant admin consent for your tenant.";
      } else {
        msg = `Connection failed: ${raw}`;
      }
      setState((s) => ({ ...s, error: msg, toast: "", toastSuccess: false }));
    } else if (teamsParam === "connected") {
      setState((s) => ({ ...s, error: "", toast: "Microsoft Teams connected successfully!", toastSuccess: true }));
      loadConsultants();
    }
    setSearchParams({}, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsParam, reasonParam]);

  async function loadConsultants() {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const res = await apiFetch("/api/consultants", { auth: true });
      setState((s) => ({ ...s, loading: false, consultants: res.consultants || [] }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || "Failed to load consultants" }));
    }
  }

  useEffect(() => { loadConsultants(); }, []);

  return (
    <div className="page">
      <div className="header">
        <h1 style={{display:"flex",alignItems:"center",gap:10}}>
          <Users size={26} color="var(--accent)"/> Consultants
        </h1>
        <p>Monitor your consultants' Microsoft Teams connection status and demo performance.</p>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}
      {state.toast && !state.error ? (
        <div className="alert" style={state.toastSuccess
          ? { background: "rgba(34,197,94,0.12)", color: "#4ade80", borderColor: "rgba(34,197,94,0.3)", display:"flex", alignItems:"center", gap:8 }
          : { display:"flex", alignItems:"center", gap:8 }}>
          <CheckCircle size={16}/> {state.toast}
        </div>
      ) : null}

      {/* Info banner */}
      <div className="alert" style={{
        display:"flex", alignItems:"center", gap:8,
        background:"rgba(99,102,241,0.07)", borderColor:"rgba(99,102,241,0.25)", color:"var(--text-muted)",
        fontSize:"0.87rem"
      }}>
        <Info size={15} color="var(--accent)" style={{flexShrink:0}}/>
        Each consultant connects their own Microsoft Teams account from their portal sidebar (<strong>Connect Teams</strong>). Their status is reflected here automatically.
      </div>

      {/* Consultant Directory */}
      <div className="card">
        <div className="card__head">
          <h2 style={{display:"flex",alignItems:"center",gap:8}}>
            <Users size={18}/> Consultant Directory
          </h2>
          <span className="muted">{state.consultants.length} consultant{state.consultants.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="table">
          <div className="table__row table__row--head"
            style={{ gridTemplateColumns: "2fr 2fr 2fr 1.5fr auto" }}>
            <div>Name</div>
            <div>Email</div>
            <div>MS Account</div>
            <div>Teams Status</div>
            <div style={{ textAlign: "right" }}>Actions</div>
          </div>

          {state.consultants.map((c) => (
            <div key={c.id} className="table__row"
              style={{ gridTemplateColumns: "2fr 2fr 2fr 1.5fr auto", alignItems: "center" }}>
              <div className="ellipsis" style={{ fontWeight: 500 }}>{c.name}</div>
              <div className="muted" style={{ fontSize: "0.85rem" }}>{c.email}</div>
              <div className="muted" style={{ fontSize: "0.82rem" }}>
                {c.msUpn ? (
                  <span style={{display:"flex",alignItems:"center",gap:4}} title={c.msUpn}>
                    <Mail size={12}/> {c.msUpn}
                  </span>
                ) : (
                  <span>—</span>
                )}
              </div>
              <div>
                {c.teamsConnected ? (
                  <span style={{
                    display:"inline-flex", alignItems:"center", gap:4,
                    background: "rgba(34,197,94,0.12)", color: "#4ade80",
                    borderRadius: 20, padding: "3px 12px",
                    fontSize: "0.78rem", fontWeight: 600
                  }}>
                    <CheckCircle size={12}/> Connected
                  </span>
                ) : (
                  <span style={{
                    display:"inline-flex", alignItems:"center", gap:4,
                    background: "rgba(239,68,68,0.1)", color: "#f87171",
                    borderRadius: 20, padding: "3px 12px",
                    fontSize: "0.78rem", fontWeight: 600
                  }}
                    title="Ask the consultant to connect from their portal sidebar"
                  >
                    <XCircle size={12}/> Not Connected
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Link className="link" to={`/consultants/${c.id}`}
                  style={{ fontSize: "0.85rem", display:"flex", alignItems:"center", gap:4, whiteSpace: "nowrap" }}>
                  <Eye size={12}/> View
                </Link>
              </div>
            </div>
          ))}

          {!state.consultants.length && !state.loading && (
            <div className="muted" style={{ padding: 16 }}>
              No consultants found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
