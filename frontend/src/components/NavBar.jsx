import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function NavBar() {
  const { user, isAuthed, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="nav">
      <div className="nav__left">
        <Link className="nav__brand" to="/">
          demo-monitoring
        </Link>
        {isAuthed && (
          <>
            {user?.role === "consultant" && (
              <NavLink className="nav__link" to="/consultant">
                Consultant
              </NavLink>
            )}
            {user?.role === "manager" && (
              <NavLink className="nav__link" to="/manager">
                Manager
              </NavLink>
            )}
            <NavLink className="nav__link" to="/account">
              Account
            </NavLink>
          </>
        )}
      </div>

      <div className="nav__right">
        {isAuthed ? (
          <>
            <span className="nav__meta">
              {user?.name} · {user?.role}
            </span>
            <button className="btn btn--ghost" onClick={onLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <NavLink className="nav__link" to="/login">
              Login
            </NavLink>
            <NavLink className="nav__link" to="/register">
              Register
            </NavLink>
          </>
        )}
      </div>
    </div>
  );
}

