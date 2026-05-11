import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import AppLogo from "./AppLogo.jsx";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate("/login");
  }

  const isConsultant = user?.role === "consultant";
  const teamsConnected = Boolean(user?.teamsConnected);
  const initials = (user?.name || user?.email || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const managerLinks = [
    { to: "/manager/overview",       icon: "📊", label: "Overview" },
    { to: "/manager/consultants",    icon: "👥", label: "Consultants" },
    { to: "/manager/manual-analysis",icon: "📝", label: "Manual Analysis" },
    { to: "/manager/leaderboard",    icon: "🏆", label: "Leaderboard" },
    { to: "/manager/reports",        icon: "📋", label: "Reports" },
    { to: "/manager/presales-report", icon: "🧾", label: "Presales Complete Report" },
    { to: "/manager/settings",        icon: "⚙️", label: "Settings" },
    { to: "/account",                icon: "👤", label: "Account" },
  ];

  const consultantLinks = [
    { to: "/consultant",              icon: "📊", label: "Dashboard" },
    { to: "/consultant/connect-teams",icon: "🔗", label: "Connect Teams", badge: teamsConnected ? "green" : "red" },
    { to: "/account",                 icon: "👤", label: "Account" },
  ];

  const links = isConsultant ? consultantLinks : managerLinks;

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar__brand">
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <AppLogo variant="dark" color="#fff" fontSize="1.3rem" svgSize={16} imgHeight={26} />
          <div className="sidebar__subtitle" style={{ marginTop: 2 }}>
            {isConsultant ? "Consultant" : "Manager"} Console
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar__section-label">Navigation</div>
      <nav className="sidebar__nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            className={({ isActive }) => `sidebar__link${isActive ? " active" : ""}`}
            to={link.to}
            end={link.to === "/consultant"}
          >
            <span className="sidebar__link-icon">{link.icon}</span>
            <span style={{ flex: 1 }}>{link.label}</span>
            {link.badge && (
              <span className={`badge badge--${link.badge}`} style={{ fontSize: "0.65rem", padding: "2px 7px" }}>
                {link.badge === "green" ? "✓" : "!"}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar__footer">
        {/* User card */}
        <div className="sidebar__user-card">
          <div className="sidebar__avatar">{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div className="sidebar__metaName">{user?.name || "—"}</div>
            <div className="sidebar__metaRole">
              {user?.role}
              {isConsultant && (
                <span
                  className={`badge badge--${teamsConnected ? "green" : "red"}`}
                  style={{ marginLeft: 6, fontSize: "0.65rem", padding: "1px 6px" }}
                >
                  Teams {teamsConnected ? "✓" : "✗"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="sidebar__actions">
          <ThemeToggle />
          <button className="btn btn--ghost btn--sm" onClick={onLogout} type="button" style={{ flex: 1 }}>
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
