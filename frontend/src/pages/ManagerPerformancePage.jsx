import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";

export default function ManagerPerformancePage() {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  const badgeForRank = (rank) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return "";
  };

  useEffect(() => {
    let alive = true;
    async function load() {
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const res = await apiFetch("/api/performance/leaderboard?limit=20&months=6", { auth: true });
        if (!alive) return;
        setState({ loading: false, error: "", rows: res.leaderboard || [] });
      } catch (e) {
        if (!alive) return;
        setState({ loading: false, error: e.message || "Failed to load leaderboard", rows: [] });
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
        <h1>Performance</h1>
        <p>Top consultants based on demo scores (last 6 months).</p>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}

      <div className="card">
        <div className="card__head">
          <h2>Leaderboard</h2>
          <span className="muted">Average score + volume</span>
        </div>

        <div className="table">
          <div className="table__row table__row--head">
            <div>#</div>
            <div>Consultant</div>
            <div>Total demos</div>
            <div>Avg</div>
            <div>Best</div>
            <div></div>
          </div>
          {state.rows.map((r, idx) => (
            <div key={r.consultant?.id || idx} className="table__row">
              <div style={{ fontWeight: 700 }}>{idx + 1}</div>
              <div className="ellipsis">
                <span style={{ marginRight: 6 }}>{badgeForRank(idx + 1)}</span>
                {r.consultant?.name || "—"} <span className="muted">({r.consultant?.email || "—"})</span>
              </div>
              <div>{r.totalDemos}</div>
              <div>{Math.round(r.averageScore || 0)}</div>
              <div>{Math.round(r.bestDemoScore || 0)}</div>
              <div style={{ textAlign: "right" }}>
                {r.consultant?.id ? (
                  <Link className="link" to={`/consultants/${r.consultant.id}`}>
                    View
                  </Link>
                ) : (
                  "—"
                )}
              </div>
            </div>
          ))}
          {!state.rows.length && !state.loading ? (
            <div className="muted" style={{ padding: 12 }}>
              No leaderboard data yet. Run workflow to generate scores.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

