import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";

function truncate(s, n) {
  const str = String(s || "");
  if (str.length <= n) return str;
  return `${str.slice(0, n - 1)}…`;
}

export default function ReportsListPage() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: "", reports: [] });

  const isManager = useMemo(() => user?.role === "manager" || user?.role === "admin", [user?.role]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const res = await apiFetch("/api/reports/manual-scripts?limit=100", { auth: true });
        if (!alive) return;
        setState({ loading: false, error: "", reports: res.reports || [] });
      } catch (e) {
        if (!alive) return;
        setState({ loading: false, error: e.message || "Failed to load reports", reports: [] });
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page">
      <div className="header">
        <h1>Reports</h1>
        <p>All generated manual script analysis reports.</p>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}

      <div className="card">
        <div className="card__head">
          <h2>Manual script reports</h2>
          <span className="muted">{isManager ? "Across all consultants" : "Your reports"}</span>
        </div>

        <div className="table">
          <div className="table__row table__row--head" style={{ gridTemplateColumns: isManager ? "2fr 1.4fr 1fr 0.8fr" : "2fr 1fr 0.8fr" }}>
            <div>Title</div>
            {isManager ? <div>Consultant</div> : null}
            <div>Client</div>
            <div></div>
          </div>

          {state.reports.map((r) => (
            <div
              key={r.meetingId}
              className="table__row"
              style={{ gridTemplateColumns: isManager ? "2fr 1.4fr 1fr 0.8fr" : "2fr 1fr 0.8fr" }}
            >
              <div className="ellipsis">
                <div style={{ fontWeight: 700 }}>{r.title || "Manual Script Analysis"}</div>
                <div className="muted">{truncate(r.summary, 90) || "—"}</div>
              </div>
              {isManager ? <div className="muted">{r.consultant?.name || "—"}</div> : null}
              <div className="muted">{r.clientName || "—"}</div>
              <div style={{ textAlign: "right" }}>
                <Link className="link" to={`/reports/${r.meetingId}`}>
                  Open
                </Link>
              </div>
            </div>
          ))}

          {!state.reports.length && !state.loading ? (
            <div className="muted" style={{ padding: 12 }}>
              No reports yet. Create one from Manual Script Analysis.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

