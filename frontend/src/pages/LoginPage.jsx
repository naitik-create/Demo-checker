import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import AppLogo from "../components/AppLogo.jsx";

export default function LoginPage() {
  const { login, isAuthed, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [state, setState] = useState({ loading: false, error: "" });

  useEffect(() => {
    if (!isAuthed) return;
    if (user?.role === "manager") navigate("/manager/overview", { replace: true });
    else navigate("/consultant", { replace: true });
  }, [isAuthed, user?.role, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    setState({ loading: true, error: "" });
    try {
      const res = await login(form.email, form.password);
      const role = res?.user?.role;
      if (role === "manager") navigate("/manager/overview");
      else navigate("/consultant");
    } catch (err) {
      setState({ loading: false, error: err.message || "Login failed. Please check your credentials." });
    }
  }

  const inputStyle = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 14px",
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    fontSize: "0.92rem",
    color: "#1a1a1a",
    background: "#fff",
    outline: "none",
    fontFamily: "inherit",
  };

  const labelStyle = {
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.07em",
    color: "#888",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 6,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#efefef",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "inherit",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 480,
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 4px 28px rgba(0,0,0,0.10)",
        borderLeft: "5px solid #e53935",
        overflow: "hidden",
      }}>
        <div style={{ padding: "36px 40px 32px" }}>

          {/* Logo */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ marginBottom: 6 }}>
              <AppLogo color="#1a1a1a" fontSize="3rem" svgSize={36} imgHeight={52} />
            </div>
            <div style={{ color: "#aaa", fontSize: "0.82rem", paddingLeft: 2 }}>Demo Monitoring · Motadata</div>
          </div>

          {/* Heading */}
          <h1 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#1a1a1a", margin: "0 0 24px" }}>
            Demo Monitoring — Sign In
          </h1>

          {/* Form */}
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Email / Username</label>
              <input
                style={inputStyle}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                type="text"
                placeholder="Enter your email or username"
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...inputStyle, paddingRight: 52 }}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  type={showPass ? "text" : "password"}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "#aaa", fontSize: "0.75rem", padding: 0, fontFamily: "inherit",
                  }}
                >
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {state.error && (
              <div style={{
                padding: "10px 14px",
                background: "rgba(229,57,53,0.07)",
                border: "1px solid rgba(229,57,53,0.25)",
                borderRadius: 6,
                color: "#c62828",
                fontSize: "0.84rem",
              }}>
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={state.loading}
              style={{
                marginTop: 6,
                padding: "12px",
                background: "#e53935",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: "0.95rem",
                fontWeight: 700,
                cursor: state.loading ? "not-allowed" : "pointer",
                opacity: state.loading ? 0.75 : 1,
                fontFamily: "inherit",
                letterSpacing: "0.01em",
              }}
            >
              {state.loading ? "Signing in…" : "Sign In →"}
            </button>
          </form>

          {/* Register link */}
          <div style={{ textAlign: "center", marginTop: 16, fontSize: "0.85rem", color: "#888" }}>
            Don&apos;t have an account?{" "}
            <Link to="/register" style={{ color: "#e53935", fontWeight: 700, textDecoration: "none" }}>
              Create account
            </Link>
          </div>

          {/* ACCESS TYPES */}
          <div style={{ marginTop: 20, border: "1px solid #ececec", borderRadius: 8, overflow: "hidden" }}>
            <div style={{
              padding: "7px 14px",
              background: "#f7f7f7",
              borderBottom: "1px solid #ececec",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#aaa",
              textTransform: "uppercase",
            }}>
              Access Types
            </div>
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: "rgba(229,57,53,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1rem", flexShrink: 0,
                }}>👔</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1a1a1a" }}>Manager</div>
                  <div style={{ fontSize: "0.76rem", color: "#aaa" }}>Overview, consultants, all demos &amp; reports</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: "rgba(99,102,241,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1rem", flexShrink: 0,
                }}>💼</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1a1a1a" }}>Consultant</div>
                  <div style={{ fontSize: "0.76rem", color: "#aaa" }}>Own demos, performance scores &amp; Teams connect</div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center", marginTop: 18, fontSize: "0.72rem", color: "#ccc" }}>
            Internal use only · Motadata
          </div>

        </div>
      </div>
    </div>
  );
}
