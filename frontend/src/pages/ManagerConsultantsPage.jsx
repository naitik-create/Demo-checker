import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import {
  Users, CheckCircle, XCircle, Mail, Eye, Info, Search, ShieldCheck, ShieldAlert, Calendar, Trash2
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
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }
  const [deleting, setDeleting] = useState(false);

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

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/consultants/${confirmDelete.id}`, { method: "DELETE", auth: true });
      setState((s) => ({
        ...s,
        consultants: s.consultants.filter((c) => c.id !== confirmDelete.id),
        toast: res.message || "Consultant deleted.",
        toastSuccess: true,
        error: ""
      }));
    } catch (err) {
      setState((s) => ({ ...s, error: err.message || "Failed to delete consultant.", toast: "" }));
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  const filteredConsultants = useMemo(() => {
    if (!searchQuery) return state.consultants;
    const q = searchQuery.toLowerCase();
    return state.consultants.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.email.toLowerCase().includes(q) ||
      (c.msUpn && c.msUpn.toLowerCase().includes(q))
    );
  }, [state.consultants, searchQuery]);

  const stats = useMemo(() => {
    const total = state.consultants.length;
    const connected = state.consultants.filter(c => c.teamsConnected).length;
    const disconnected = total - connected;
    return { total, connected, disconnected };
  }, [state.consultants]);

  const getInitials = (name) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Consultants</h1>
        <p>Monitor your consultants' Microsoft Teams connection status and demo performance.</p>
      </div>

      <div className="grid grid--kpis" style={{ marginBottom: 32 }}>
        <div className="kpi kpi--blue">
          <div className="kpi__icon kpi__icon--blue"><Users size={20}/></div>
          <div className="kpi__label">Total Consultants</div>
          <div className="kpi__value kpi__value--blue">{stats.total}</div>
          <div className="kpi__hint">Active in the system</div>
        </div>
        <div className="kpi kpi--green">
          <div className="kpi__icon kpi__icon--green"><ShieldCheck size={20}/></div>
          <div className="kpi__label">Teams Connected</div>
          <div className="kpi__value kpi__value--green">{stats.connected}</div>
          <div className="kpi__hint">Ready for monitoring</div>
        </div>
        <div className="kpi kpi--orange">
          <div className="kpi__icon kpi__icon--orange"><ShieldAlert size={20}/></div>
          <div className="kpi__label">Disconnected</div>
          <div className="kpi__value kpi__value--orange">{stats.disconnected}</div>
          <div className="kpi__hint">Requires attention</div>
        </div>
      </div>

      {state.error ? <div className="alert" style={{ marginBottom: 24 }}>{state.error}</div> : null}
      {state.toast && !state.error ? (
        <div className="alert success" style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle size={16}/> {state.toast}
        </div>
      ) : null}

      <div className="alert info" style={{
        display: "flex", alignItems: "center", gap: 12,
        marginBottom: 32, fontSize: "0.88rem"
      }}>
        <Info size={18} style={{ flexShrink: 0 }}/>
        <div>
          Consultants must connect their Microsoft Teams account via their own portal. 
          Status updates automatically once connected.
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "visible" }}>
        <div className="card__head" style={{ padding: "24px 24px 16px", borderBottom: "1px solid var(--card-border)", marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Users size={20} color="var(--accent)"/>
            <h2 style={{ margin: 0 }}>Consultant Directory</h2>
          </div>
          <div className="input-wrap" style={{ width: 300 }}>
            <input 
              type="text" 
              className="input" 
              placeholder="Search by name, email..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 40, borderRadius: 12, height: 42 }}
            />
            <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}/>
          </div>
        </div>

        <div className="table" style={{ border: "none", borderRadius: 0 }}>
          <div className="table__row table__row--head" style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr 0.8fr", background: "var(--surface-1)", padding: "12px 24px" }}>
            <div>Consultant</div>
            <div>MS Account</div>
            <div>Teams Status</div>
            <div>Joined Date</div>
            <div style={{ textAlign: "right" }}>Actions</div>
          </div>

          <div style={{ maxHeight: "600px", overflowY: "auto" }}>
            {filteredConsultants.map((c) => (
              <div key={c.id} className="table__row" style={{
                gridTemplateColumns: "1.5fr 1fr 1fr 1fr 0.8fr",
                padding: "16px 24px",
                borderTop: "1px solid var(--card-border)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ 
                    width: 40, height: 40, borderRadius: "50%", 
                    background: "linear-gradient(135deg, var(--accent), var(--purple))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontSize: "0.85rem", fontWeight: 700,
                    boxShadow: "0 4px 12px var(--accent-glow)"
                  }}>
                    {getInitials(c.name)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{c.name}</span>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>{c.email}</span>
                  </div>
                </div>

                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  {c.msUpn ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }} title={c.msUpn}>
                      <Mail size={14} style={{ color: "var(--accent)", opacity: 0.8 }}/>
                      <span className="ellipsis" style={{ maxWidth: 160 }}>{c.msUpn}</span>
                    </div>
                  ) : (
                    <span style={{ opacity: 0.5 }}>Not linked</span>
                  )}
                </div>

                <div>
                  {c.teamsConnected ? (
                    <span className="badge badge--green">
                      <CheckCircle size={13}/> Connected
                    </span>
                  ) : (
                    <span className="badge badge--red" title="Pending consultant action">
                      <XCircle size={13}/> Disconnected
                    </span>
                  )}
                </div>

                <div className="muted" style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <Calendar size={14} style={{ opacity: 0.7 }}/>
                  {new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <Link
                    to={`/consultants/${c.id}`}
                    className="btn btn--sm btn--ghost"
                    style={{ borderRadius: 10, padding: "6px 12px" }}
                  >
                    <Eye size={14}/> View
                  </Link>
                  <button
                    className="btn btn--sm btn--ghost"
                    style={{ borderRadius: 10, padding: "6px 10px", borderColor: "rgba(229,57,53,0.35)", color: "#e53935" }}
                    onClick={() => setConfirmDelete({ id: c.id, name: c.name })}
                  >
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            ))}

            {!filteredConsultants.length && !state.loading && (
              <div style={{ padding: "60px 24px", textAlign: "center" }}>
                <div style={{ 
                  width: 60, height: 60, borderRadius: "50%", background: "var(--surface-1)", 
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 16, color: "var(--text-muted)"
                }}>
                  <Search size={24}/>
                </div>
                <h3 style={{ margin: "0 0 8px", color: "var(--text-main)" }}>No consultants found</h3>
                <p className="muted" style={{ margin: 0 }}>Try adjusting your search criteria</p>
              </div>
            )}

            {state.loading && (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
                <p className="muted">Loading consultants...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 999,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24
        }}>
          <div style={{
            background: "var(--card-bg)", borderRadius: 14, padding: "28px 32px", maxWidth: 420, width: "100%",
            border: "1px solid var(--card-border)", boxShadow: "0 16px 48px rgba(0,0,0,0.25)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%", background: "rgba(229,57,53,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}>
                <Trash2 size={18} color="#e53935"/>
              </div>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Delete Consultant</h3>
            </div>
            <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
              Are you sure you want to delete <strong style={{ color: "var(--text-main)" }}>{confirmDelete.name}</strong>?
              This will permanently remove their account along with all meetings, transcripts, and reports.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                className="btn btn--ghost"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: "#e53935", boxShadow: "none" }}
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid var(--surface-3);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
