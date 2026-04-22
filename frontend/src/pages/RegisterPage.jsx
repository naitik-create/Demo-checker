import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function RegisterPage() {
  const { register, isAuthed, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "", role: "consultant" });
  const [showPass, setShowPass] = useState(false);
  const [state, setState] = useState({ loading: false, error: "" });

  useEffect(() => {
    if (!isAuthed) return;
    if (user?.role === "manager") navigate("/manager/overview", { replace: true });
    else navigate("/consultant", { replace: true });
  }, [isAuthed, user?.role, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setState({ loading: false, error: "Passwords do not match." });
      return;
    }
    if (form.password.length < 8) {
      setState({ loading: false, error: "Password must be at least 8 characters." });
      return;
    }
    setState({ loading: true, error: "" });
    try {
      const res = await register({ name: form.name, email: form.email, password: form.password, role: form.role });
      const role = res?.user?.role;
      if (role === "manager") navigate("/manager/overview");
      else navigate("/consultant");
    } catch (err) {
      setState({ loading: false, error: err.message || "Registration failed. Please try again." });
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
          <div className="auth-brand__logo">🚀</div>
          <h2>Join Demo Monitoring</h2>
          <p>
            Create your account to start tracking your presales demos with AI
            and gain insights that improve your win rate.
          </p>
        </div>

        <div className="auth-brand__features">
          <div className="auth-brand__feature" style={{ borderColor: form.role === "manager" ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.12)" }}>
            <div className="auth-brand__feature-icon" style={{ background: "rgba(167,139,250,0.2)", fontSize: "1.4rem" }}>👔</div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Signing up as Manager?</div>
              <div style={{ opacity: 0.7, fontSize: "0.82rem" }}>Oversee consultants, view all demos, run AI analysis workflows</div>
            </div>
          </div>
          <div className="auth-brand__feature" style={{ borderColor: form.role === "consultant" ? "rgba(99,179,237,0.4)" : "rgba(255,255,255,0.12)" }}>
            <div className="auth-brand__feature-icon" style={{ background: "rgba(99,179,237,0.2)", fontSize: "1.4rem" }}>💼</div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Signing up as Consultant?</div>
              <div style={{ opacity: 0.7, fontSize: "0.82rem" }}>Connect your Teams account, view your own scores & reports</div>
            </div>
          </div>
          <div className="auth-brand__feature">
            <div className="auth-brand__feature-icon" style={{ background: "rgba(52,211,153,0.2)" }}>🔒</div>
            <div>Enterprise-grade security with JWT auth</div>
          </div>
        </div>
      </div>

      {/* ── Right Form Panel ── */}
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: "linear-gradient(135deg, var(--accent), var(--purple))",
                display: "grid", placeItems: "center", fontSize: "1.2rem",
                boxShadow: "0 4px 16px var(--accent-glow)"
              }}>🎯</div>
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-muted)" }}>Demo Monitoring</span>
            </div>
            <h1>Create your account</h1>
            <p>Start monitoring your demos with AI in minutes</p>
          </div>

          {/* Role Selector */}
          <div style={{ marginBottom: 20 }}>
            <div className="field__label" style={{ marginBottom: 10 }}>I am a…</div>
            <div className="role-cards">
              <div
                className={`role-card ${form.role === "consultant" ? "selected" : ""}`}
                onClick={() => setForm((f) => ({ ...f, role: "consultant" }))}
              >
                <div className="role-card__icon">💼</div>
                <div className="role-card__title">Consultant</div>
                <div className="role-card__desc">Track my demos</div>
              </div>
              <div
                className={`role-card manager ${form.role === "manager" ? "selected manager" : ""}`}
                onClick={() => setForm((f) => ({ ...f, role: "manager" }))}
              >
                <div className="role-card__icon">👔</div>
                <div className="role-card__title">Manager</div>
                <div className="role-card__desc">Manage my team</div>
              </div>
            </div>
          </div>

          <form className="form" onSubmit={onSubmit}>
            <label className="field">
              <div className="field__label">Full name</div>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={form.role === "manager" ? "e.g. Uday Dave" : "e.g. Rahul Sharma"}
                required
                autoFocus
              />
            </label>

            <label className="field">
              <div className="field__label">Work email</div>
              <input
                className="input"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                type="email"
                placeholder="you@company.com"
                required
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label className="field">
                <div className="field__label">Password</div>
                <div className="input-wrap">
                  <input
                    className="input"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    type={showPass ? "text" : "password"}
                    placeholder="Min. 8 chars"
                    required
                    minLength={8}
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

              <label className="field">
                <div className="field__label">Confirm password</div>
                <input
                  className="input"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  type={showPass ? "text" : "password"}
                  placeholder="Repeat password"
                  required
                />
              </label>
            </div>

            {state.error && <div className="alert">{state.error}</div>}

            <button
              className="btn"
              disabled={state.loading}
              type="submit"
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "1rem",
                marginTop: 4,
                background: form.role === "manager"
                  ? "linear-gradient(135deg, var(--purple), var(--pink))"
                  : "linear-gradient(135deg, var(--accent), var(--purple))"
              }}
            >
              {state.loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ animation: "spin-slow 1s linear infinite", display: "inline-block" }}>⏳</span>
                  Creating account…
                </span>
              ) : (
                form.role === "manager" ? "Create Manager Account →" : "Create Consultant Account →"
              )}
            </button>
          </form>

          <div className="auth-footer">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
