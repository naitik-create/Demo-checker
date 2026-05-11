import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import AppLogo from "../components/AppLogo.jsx";

export default function RegisterPage() {
  const { register, isAuthed, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "", role: "consultant" });
  const [showPass, setShowPass] = useState(false);
  const [state, setState] = useState({ loading: false, error: "", pendingApproval: false, pendingName: "" });

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
      if (res?.pending) {
        setState({ loading: false, error: "", pendingApproval: true, pendingName: form.name });
        return;
      }
      const role = res?.user?.role;
      if (role === "manager") navigate("/manager/overview");
      else navigate("/consultant");
    } catch (err) {
      setState({ loading: false, error: err.message || "Registration failed. Please try again." });
    }
  }

  if (state.pendingApproval) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 24 }}>
        <div style={{ maxWidth: 480, width: "100%", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 16, padding: "40px 36px", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(229,57,53,0.1)", border: "2px solid rgba(229,57,53,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: "1.8rem" }}>⏳</div>
          <h2 style={{ fontWeight: 800, fontSize: "1.4rem", marginBottom: 10, color: "var(--text-main)" }}>Awaiting Approval</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.7, marginBottom: 24 }}>
            Hi <strong style={{ color: "var(--text-main)" }}>{state.pendingName}</strong>, your manager account has been created.<br />
            An existing manager needs to approve your account before you can log in.
          </p>
          <div style={{ background: "rgba(229,57,53,0.06)", border: "1px solid rgba(229,57,53,0.2)", borderRadius: 10, padding: "14px 18px", marginBottom: 24, textAlign: "left" }}>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#e53935", marginBottom: 6 }}>What happens next?</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.8 }}>
              <li>An existing manager will review your registration</li>
              <li>Once approved, you can log in with your email & password</li>
              <li>If rejected, contact your administrator</li>
            </ul>
          </div>
          <Link to="/login" style={{ display: "inline-block", padding: "10px 28px", background: "#e53935", color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: "0.9rem" }}>
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      {/* ── Left Brand Panel ── */}
      <div className="auth-brand">
        <div className="auth-brand__orb auth-brand__orb--1" />
        <div className="auth-brand__orb auth-brand__orb--2" />
        <div className="auth-brand__orb auth-brand__orb--3" />

        <div className="auth-brand__content">
          <div className="auth-brand__logo" style={{ background: "transparent", border: "none", boxShadow: "none" }}>
            <AppLogo variant="dark" color="#fff" fontSize="2.2rem" svgSize={26} imgHeight={44} />
          </div>
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
            <div style={{ marginBottom: 16 }}>
              <AppLogo color="var(--text-main)" fontSize="1.5rem" svgSize={20} imgHeight={30} />
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
