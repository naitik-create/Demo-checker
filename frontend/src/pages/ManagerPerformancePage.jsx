import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { Trophy } from "lucide-react";

function scoreColor(score) {
  if (score >= 80) return "#34d399";
  if (score >= 60) return "#60a5fa";
  if (score >= 40) return "#fb923c";
  return "#f87171";
}

function rankBadge(rank) {
  if (rank === 1) return { emoji: "🥇", bg: "rgba(250,204,21,0.12)", border: "rgba(250,204,21,0.3)", color: "#fbbf24" };
  if (rank === 2) return { emoji: "🥈", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)", color: "#94a3b8" };
  if (rank === 3) return { emoji: "🥉", bg: "rgba(180,119,90,0.12)", border: "rgba(180,119,90,0.3)", color: "#b4775a" };
  return { emoji: String(rank), bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", color: "var(--text-muted)" };
}

export default function ManagerPerformancePage() {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });

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
    return () => { alive = false; };
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          Performance <Trophy size={28} style={{ color: "#fbbf24" }} />
        </h1>
        <p>Top consultants based on demo scores (last 6 months).</p>
      </div>

      {state.error && <div className="alert">{state.error}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Card header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--card-border)" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>Leaderboard</h2>
            <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>Ranked by average demo score × volume</p>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.06)", border: "1px solid var(--card-border)", borderRadius: 99, padding: "3px 12px" }}>
            Last 6 months
          </span>
        </div>

        {state.loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
        ) : state.rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            No leaderboard data yet. Run workflow to generate scores.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--card-border)" }}>
                <th style={thStyle("60px", "center")}>Rank</th>
                <th style={thStyle("auto", "left")}>Consultant</th>
                <th style={thStyle("120px", "center")}>Total Demos</th>
                <th style={thStyle("110px", "center")}>Avg Score</th>
                <th style={thStyle("110px", "center")}>Best Score</th>
                <th style={thStyle("80px", "center")}></th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r, idx) => {
                const rank = idx + 1;
                const badge = rankBadge(rank);
                const avg = Math.round(r.averageScore || 0);
                const best = Math.round(r.bestDemoScore || 0);
                const isTop3 = rank <= 3;
                return (
                  <tr
                    key={r.consultant?.id || idx}
                    style={{
                      borderBottom: "1px solid var(--card-border)",
                      background: isTop3 ? badge.bg : "transparent",
                      transition: "background 0.15s"
                    }}
                  >
                    {/* Rank */}
                    <td style={{ ...tdStyle("center"), width: 60 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 32, height: 32, borderRadius: "50%",
                        background: badge.bg, border: "1px solid " + badge.border,
                        color: badge.color, fontWeight: 800, fontSize: rank <= 3 ? "1.1rem" : "0.85rem"
                      }}>
                        {badge.emoji}
                      </span>
                    </td>

                    {/* Consultant */}
                    <td style={{ ...tdStyle("left"), minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {/* Avatar */}
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                          background: `hsl(${(r.consultant?.name?.charCodeAt(0) || 0) * 15}, 55%, 38%)`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, fontSize: "0.9rem", color: "#fff"
                        }}>
                          {(r.consultant?.name || "?")[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.92rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.consultant?.name || "—"}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.consultant?.email || ""}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Total Demos */}
                    <td style={{ ...tdStyle("center"), fontWeight: 600 }}>
                      <span style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--card-border)", borderRadius: 99, padding: "3px 12px" }}>
                        {r.totalDemos}
                      </span>
                    </td>

                    {/* Avg Score */}
                    <td style={tdStyle("center")}>
                      <span style={{
                        fontWeight: 800, fontSize: "1rem", color: scoreColor(avg),
                        background: scoreColor(avg) + "18", border: "1px solid " + scoreColor(avg) + "40",
                        borderRadius: 99, padding: "3px 14px", display: "inline-block"
                      }}>
                        {avg}
                      </span>
                    </td>

                    {/* Best Score */}
                    <td style={tdStyle("center")}>
                      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{best}</span>
                    </td>

                    {/* Action */}
                    <td style={tdStyle("center")}>
                      {r.consultant?.id ? (
                        <Link
                          to={`/consultants/${r.consultant.id}`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            fontSize: "0.8rem", fontWeight: 600,
                            color: "var(--accent)", textDecoration: "none",
                            padding: "4px 12px", borderRadius: 8,
                            border: "1px solid rgba(99,102,241,0.3)",
                            background: "rgba(99,102,241,0.08)"
                          }}
                        >
                          View
                        </Link>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function thStyle(width, align) {
  return {
    padding: "11px 16px",
    textAlign: align,
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    width: width !== "auto" ? width : undefined,
    whiteSpace: "nowrap"
  };
}

function tdStyle(align) {
  return {
    padding: "14px 16px",
    textAlign: align,
    verticalAlign: "middle"
  };
}
