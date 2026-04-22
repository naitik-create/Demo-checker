import { NavLink } from "react-router-dom";

export default function ConsultantTopNav() {
  return (
    <div
      className="card"
      style={{
        marginTop: 0,
        marginBottom: 16,
        padding: "10px 12px",
        display: "flex",
        gap: 10,
        alignItems: "center"
      }}
    >
      <NavLink className="btn btn--ghost btn--sm" to="/consultant" end>
        Dashboard
      </NavLink>
      <NavLink className="btn btn--ghost btn--sm" to="/account">
        Account
      </NavLink>
    </div>
  );
}

