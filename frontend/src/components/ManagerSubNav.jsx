import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/manager/overview", label: "Overview", end: true },
  { to: "/manager/consultants", label: "Consultants" },
  { to: "/manager/manual-analysis", label: "Manual Analysis" },
  { to: "/manager/reports", label: "Reports" },
  { to: "/manager/settings", label: "Settings" },
  { to: "/account", label: "Account" }
];

export default function ManagerSubNav() {
  return (
    <div
      className="manager-subnav"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        marginBottom: 16,
        padding: "10px 12px",
        borderRadius: "var(--radius-md, 12px)",
        border: "1px solid var(--card-border)",
        background: "var(--surface-1)"
      }}
    >
      <span className="muted" style={{ fontSize: "0.75rem", fontWeight: 700, marginRight: 4 }}>
        Manager
      </span>
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={Boolean(l.end)}
          className={({ isActive }) =>
            `btn btn--sm ${isActive ? "" : "btn--ghost"}`
          }
          style={{ textDecoration: "none" }}
        >
          {l.label}
        </NavLink>
      ))}
    </div>
  );
}
