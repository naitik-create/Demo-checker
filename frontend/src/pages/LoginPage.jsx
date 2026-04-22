import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

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

  return (
    <div className="auth-shell">
      {/* ── Left Brand Panel ── */}
      <div className="auth-brand">
        <div className="auth-brand__orb auth-brand__orb--1" />
        <div className="auth-brand__orb auth-brand__orb--2" />
        <div className="auth-brand__orb auth-brand__orb--3" />

        <div className="auth-brand__content">
          <div className="auth-brand__logo">🎯</div>
          <h2>Demo Monitoring AI</h2>
          <p>
            AI-powered analytics for your presales demos. Track performance,
            get transcripts, and score every meeting automatically.
          </p>
        </div>

        <div className="auth-brand__features">
          <div className="auth-brand__feature">
            <div className="auth-brand__feature-icon" style={{ background: "rgba(99,179,237,0.2)" }}>📊</div>
            <div>Real-time demo performance analytics</div>
          </div>
          <div className="auth-brand__feature">
            <div className="auth-brand__feature-icon" style={{ background: "rgba(167,139,250,0.2)" }}>🤖</div>
            <div>AI-powered transcript & scoring</div>
          </div>
          <div className="auth-brand__feature">
            <div className="auth-brand__feature-icon" style={{ background: "rgba(52,211,153,0.2)" }}>🔗</div>
            <div>Microsoft Teams auto-sync</div>
          </div>
          <div className="auth-brand__feature">
            <div className="auth-brand__feature-icon" style={{ background: "rgba(251,146,60,0.2)" }}>📋</div>
            <div>Detailed reports: pros, cons & tips</div>
          </div>
        </div>
      </div>

      {/* ── Right Form Panel ── */}
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: "linear-gradient(135deg, var(--accent), var(--purple))",
                display: "grid", placeItems: "center", fontSize: "1.2rem",
                boxShadow: "0 4px 16px var(--accent-glow)"
              }}>🎯</div>
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-muted)" }}>Demo Monitoring</span>
            </div>
            <h1>Welcome back</h1>
            <p>Sign in to access your dashboard</p>
          </div>

          <form className="form" onSubmit={onSubmit}>
            <label className="field">
              <div className="field__label">Email address</div>
              <input
                className="input"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                type="email"
                placeholder="you@company.com"
                required
                autoFocus
              />
            </label>

            <label className="field">
              <div className="field__label">Password</div>
              <div className="input-wrap">
                <input
                  className="input"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="input-wrap__toggle"
                  onClick={() => setShowPass((s) => !s)}
                  tabIndex={-1}
                >
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
            </label>

            {state.error && <div className="alert">{state.error}</div>}

            <button
              className="btn"
              disabled={state.loading}
              type="submit"
              style={{ width: "100%", padding: "14px", fontSize: "1rem", marginTop: 4 }}
            >
              {state.loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ animation: "spin-slow 1s linear infinite", display: "inline-block" }}>⏳</span>
                  Signing in…
                </span>
              ) : "Sign In →"}
            </button>
          </form>

          <div className="auth-footer" style={{ marginTop: 20 }}>
            Don&apos;t have an account?{" "}
            <Link to="/register">Create account</Link>
          </div>

          {/* Role info */}
          <div style={{
            marginTop: 28,
            padding: "16px",
            background: "var(--surface-1)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--card-border)",
          }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Access Types
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem" }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: "rgba(167,139,250,0.15)", display: "grid", placeItems: "center", fontSize: "0.9rem", flexShrink: 0
                }}>👔</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-main)" }}>Manager</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Overview, consultants, all demos & reports</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem" }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: "rgba(59,130,246,0.15)", display: "grid", placeItems: "center", fontSize: "0.9rem", flexShrink: 0
                }}>💼</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-main)" }}>Consultant</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Own demos, performance scores & Teams connect</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
