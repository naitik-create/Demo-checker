import { useEffect, useRef, useState } from "react";
import { apiFetch, apiUploadFile, BASE_URL } from "../api/client.js";
import ManagerSubNav from "../components/ManagerSubNav.jsx";
import AppLogo from "../components/AppLogo.jsx";
import { useAppSettings } from "../context/AppSettingsContext.jsx";

export default function ManagerSettingsPage() {
  const { logoUrl, logoDarkUrl, refreshLogo } = useAppSettings();

  // Light logo state
  const lightInputRef = useRef(null);
  const [lightFile, setLightFile]       = useState(null);
  const [lightPreview, setLightPreview] = useState(null);
  const [lightUploading, setLightUploading] = useState(false);
  const [lightDeleting, setLightDeleting]   = useState(false);
  const [lightResult, setLightResult]       = useState(null);

  // Dark logo state
  const darkInputRef = useRef(null);
  const [darkFile, setDarkFile]         = useState(null);
  const [darkPreview, setDarkPreview]   = useState(null);
  const [darkUploading, setDarkUploading] = useState(false);
  const [darkDeleting, setDarkDeleting]   = useState(false);
  const [darkResult, setDarkResult]       = useState(null);

  const [consultants, setConsultants] = useState([]);
  const [loadingConsultants, setLoadingConsultants] = useState(true);

  const [form, setForm] = useState({ consultantId: "", newPassword: "", confirmPassword: "" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Pending manager approvals
  const [pendingManagers, setPendingManagers] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [approvalResult, setApprovalResult] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(null); // managerId being processed

  useEffect(() => {
    apiFetch("/api/consultants", { auth: true })
      .then((res) => setConsultants(res.consultants || []))
      .catch(() => {})
      .finally(() => setLoadingConsultants(false));

    loadPending();
  }, []);

  function loadPending() {
    setLoadingPending(true);
    apiFetch("/api/consultants/managers/pending", { auth: true })
      .then((res) => setPendingManagers(res.pending || []))
      .catch(() => {})
      .finally(() => setLoadingPending(false));
  }

  async function handleApproval(managerId, action) {
    setApprovalLoading(managerId);
    setApprovalResult(null);
    try {
      const res = await apiFetch(`/api/consultants/managers/${managerId}/${action}`, { method: "PATCH", auth: true });
      setApprovalResult({ ok: true, message: res.message });
      setPendingManagers((prev) => prev.filter((m) => m.id !== managerId));
    } catch (err) {
      setApprovalResult({ ok: false, message: err.message || `Failed to ${action} manager.` });
    } finally {
      setApprovalLoading(null);
    }
  }

  function makeFileChangeHandler(setFile, setPreview, setRes) {
    return (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFile(file);
      setRes(null);
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(file);
    };
  }

  function makeUploadHandler(endpoint, file, setFile, setPreview, setUploading, setRes, inputRef) {
    return async () => {
      if (!file) return;
      setUploading(true);
      setRes(null);
      try {
        const fd = new FormData();
        fd.append("logo", file);
        await apiUploadFile(endpoint, fd);
        await refreshLogo();
        setRes({ ok: true, message: "Logo uploaded successfully." });
        setFile(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
      } catch (err) {
        setRes({ ok: false, message: err.message || "Upload failed." });
      } finally {
        setUploading(false);
      }
    };
  }

  function makeDeleteHandler(endpoint, setFile, setPreview, setDeleting, setRes, inputRef, successMsg) {
    return async () => {
      setDeleting(true);
      setRes(null);
      try {
        await apiFetch(endpoint, { method: "DELETE", auth: true });
        await refreshLogo();
        setRes({ ok: true, message: successMsg });
        setFile(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
      } catch (err) {
        setRes({ ok: false, message: err.message || "Delete failed." });
      } finally {
        setDeleting(false);
      }
    };
  }

  const handleLightFileChange = makeFileChangeHandler(setLightFile, setLightPreview, setLightResult);
  const handleLightUpload     = makeUploadHandler("/api/settings/logo/light", lightFile, setLightFile, setLightPreview, setLightUploading, setLightResult, lightInputRef);
  const handleLightDelete     = makeDeleteHandler("/api/settings/logo/light", setLightFile, setLightPreview, setLightDeleting, setLightResult, lightInputRef, "Light logo removed. Default restored.");

  const handleDarkFileChange  = makeFileChangeHandler(setDarkFile, setDarkPreview, setDarkResult);
  const handleDarkUpload      = makeUploadHandler("/api/settings/logo/dark", darkFile, setDarkFile, setDarkPreview, setDarkUploading, setDarkResult, darkInputRef);
  const handleDarkDelete      = makeDeleteHandler("/api/settings/logo/dark", setDarkFile, setDarkPreview, setDarkDeleting, setDarkResult, darkInputRef, "Dark logo removed. Default restored.");

  async function handleResetPassword(e) {
    e.preventDefault();
    setResult(null);

    if (!form.consultantId) return setResult({ ok: false, message: "Please select a consultant." });
    if (!form.newPassword || form.newPassword.length < 6)
      return setResult({ ok: false, message: "Password must be at least 6 characters." });
    if (form.newPassword !== form.confirmPassword)
      return setResult({ ok: false, message: "Passwords do not match." });

    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/consultants/${form.consultantId}/reset-password`, {
        method: "PATCH",
        auth: true,
        body: { newPassword: form.newPassword }
      });
      setResult({ ok: true, message: res.message || "Password reset successfully." });
      setForm((f) => ({ ...f, newPassword: "", confirmPassword: "" }));
    } catch (err) {
      setResult({ ok: false, message: err.message || "Failed to reset password." });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedConsultant = consultants.find((c) => c.id === form.consultantId);

  return (
    <div className="page">
      <ManagerSubNav />

      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage consultant accounts and portal configuration.</p>
      </div>

      <div className="grid grid--2" style={{ alignItems: "start" }}>
        {/* Reset Password Card */}
        <div className="card">
          <div className="card__head">
            <div>
              <h2>Reset Consultant Password</h2>
              <p className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
                Set a new login password for any consultant account.
              </p>
            </div>
          </div>

          <form className="form" onSubmit={handleResetPassword} style={{ marginTop: 8 }}>
            <label className="field">
              <div className="field__label">Consultant</div>
              <select
                className="input"
                value={form.consultantId}
                onChange={(e) => { setForm((f) => ({ ...f, consultantId: e.target.value })); setResult(null); }}
                disabled={loadingConsultants || submitting}
                required
              >
                <option value="">
                  {loadingConsultants ? "Loading consultants..." : "Select consultant"}
                </option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.email}
                  </option>
                ))}
              </select>
            </label>

            {selectedConsultant && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 10, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)"
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", background: "rgba(99,102,241,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: "1rem", color: "#818cf8", flexShrink: 0
                }}>
                  {selectedConsultant.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{selectedConsultant.name}</div>
                  <div className="muted" style={{ fontSize: "0.78rem" }}>{selectedConsultant.email}</div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <span style={{
                    fontSize: "0.72rem", fontWeight: 700, borderRadius: 99, padding: "2px 10px",
                    background: selectedConsultant.teamsConnected ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                    color: selectedConsultant.teamsConnected ? "#4ade80" : "#f87171",
                    border: `1px solid ${selectedConsultant.teamsConnected ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`
                  }}>
                    {selectedConsultant.teamsConnected ? "Teams Connected" : "No Teams"}
                  </span>
                </div>
              </div>
            )}

            <label className="field">
              <div className="field__label">New Password</div>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  type={showPassword ? "text" : "password"}
                  value={form.newPassword}
                  onChange={(e) => { setForm((f) => ({ ...f, newPassword: e.target.value })); setResult(null); }}
                  placeholder="Min. 6 characters"
                  disabled={submitting}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                    fontSize: "0.78rem", padding: 4
                  }}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <label className="field">
              <div className="field__label">Confirm Password</div>
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                value={form.confirmPassword}
                onChange={(e) => { setForm((f) => ({ ...f, confirmPassword: e.target.value })); setResult(null); }}
                placeholder="Re-enter new password"
                disabled={submitting}
              />
              {form.confirmPassword && form.newPassword !== form.confirmPassword && (
                <div style={{ fontSize: "0.78rem", color: "#f87171", marginTop: 4 }}>Passwords do not match</div>
              )}
              {form.confirmPassword && form.newPassword === form.confirmPassword && form.newPassword.length >= 6 && (
                <div style={{ fontSize: "0.78rem", color: "#4ade80", marginTop: 4 }}>Passwords match</div>
              )}
            </label>

            {result && (
              <div style={{
                padding: "10px 14px", borderRadius: 10, fontSize: "0.85rem", fontWeight: 600,
                background: result.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                border: `1px solid ${result.ok ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
                color: result.ok ? "#4ade80" : "#f87171"
              }}>
                {result.ok ? "✓ " : "✗ "}{result.message}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={submitting}
                onClick={() => { setForm({ consultantId: "", newPassword: "", confirmPassword: "" }); setResult(null); }}
              >
                Clear
              </button>
              <button className="btn" type="submit" disabled={submitting || loadingConsultants}>
                {submitting ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </form>
        </div>

        {/* Pending Manager Approvals Card */}
        <div className="card">
          <div className="card__head">
            <div>
              <h2>Pending Manager Approvals</h2>
              <p className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
                New manager accounts waiting for your approval
              </p>
            </div>
            {pendingManagers.length > 0 && (
              <span style={{ background: "rgba(229,57,53,0.12)", color: "#e53935", border: "1px solid rgba(229,57,53,0.25)", borderRadius: 99, padding: "3px 12px", fontSize: "0.78rem", fontWeight: 700 }}>
                {pendingManagers.length} Pending
              </span>
            )}
          </div>

          {approvalResult && (
            <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: "0.85rem", fontWeight: 600, marginBottom: 14,
              background: approvalResult.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
              border: `1px solid ${approvalResult.ok ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
              color: approvalResult.ok ? "#4ade80" : "#f87171"
            }}>
              {approvalResult.ok ? "✓ " : "✗ "}{approvalResult.message}
            </div>
          )}

          {loadingPending ? (
            <div className="muted" style={{ padding: "12px 0" }}>Loading...</div>
          ) : pendingManagers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "28px 16px" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>✓</div>
              <div style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: 4 }}>No pending requests</div>
              <div className="muted" style={{ fontSize: "0.85rem" }}>All manager accounts are approved.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pendingManagers.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 10, background: "rgba(229,57,53,0.04)", border: "1px solid rgba(229,57,53,0.15)", flexWrap: "wrap" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(229,57,53,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1rem", color: "#e53935", flexShrink: 0 }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{m.name}</div>
                    <div className="muted" style={{ fontSize: "0.78rem" }}>{m.email}</div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginTop: 2 }}>
                      Requested: {new Date(m.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      className="btn btn--sm"
                      style={{ background: "#16a34a", boxShadow: "none" }}
                      disabled={approvalLoading === m.id}
                      onClick={() => handleApproval(m.id, "approve")}
                    >
                      {approvalLoading === m.id ? "..." : "Approve"}
                    </button>
                    <button
                      className="btn btn--sm btn--ghost"
                      style={{ borderColor: "rgba(229,57,53,0.4)", color: "#e53935" }}
                      disabled={approvalLoading === m.id}
                      onClick={() => handleApproval(m.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Light Logo Card */}
        <div className="card">
          <div className="card__head">
            <div>
              <h2>Light Logo</h2>
              <p className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
                Shown on light/white backgrounds (login page, form panels).
              </p>
            </div>
          </div>

          {/* Current preview on white bg */}
          <div style={{ marginTop: 12, marginBottom: 16, padding: "16px", borderRadius: 10, background: "#ffffff", border: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current (light bg)</div>
              <AppLogo variant="light" color="#1a1a1a" fontSize="1.6rem" svgSize={20} imgHeight={36} />
            </div>
            {logoUrl && (
              <button
                className="btn btn--sm btn--ghost"
                style={{ borderColor: "rgba(229,57,53,0.35)", color: "#e53935", flexShrink: 0 }}
                disabled={lightDeleting}
                onClick={handleLightDelete}
              >
                {lightDeleting ? "Removing…" : "Remove"}
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>Upload Light Logo</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => lightInputRef.current?.click()}>
                  Choose File
                </button>
                <span className="muted" style={{ fontSize: "0.82rem" }}>
                  {lightFile ? lightFile.name : "PNG, JPG, SVG — max 2 MB"}
                </span>
                <input ref={lightInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLightFileChange} />
              </div>
            </div>

            {lightPreview && (
              <div style={{ padding: 12, borderRadius: 10, background: "#ffffff", border: "1px solid var(--card-border)", display: "inline-flex", alignItems: "center", gap: 12 }}>
                <img src={lightPreview} alt="Preview" style={{ height: 40, maxWidth: 180, objectFit: "contain", borderRadius: 4 }} />
                <span style={{ fontSize: "0.78rem", color: "#888" }}>Preview on white</span>
              </div>
            )}

            {lightResult && (
              <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: "0.85rem", fontWeight: 600,
                background: lightResult.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                border: `1px solid ${lightResult.ok ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
                color: lightResult.ok ? "#4ade80" : "#f87171"
              }}>
                {lightResult.ok ? "✓ " : "✗ "}{lightResult.message}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              {lightFile && (
                <button type="button" className="btn btn--ghost"
                  onClick={() => { setLightFile(null); setLightPreview(null); setLightResult(null); if (lightInputRef.current) lightInputRef.current.value = ""; }}>
                  Cancel
                </button>
              )}
              <button className="btn" type="button" disabled={!lightFile || lightUploading} onClick={handleLightUpload}>
                {lightUploading ? "Uploading…" : "Upload Light Logo"}
              </button>
            </div>
          </div>
        </div>

        {/* Dark Logo Card */}
        <div className="card">
          <div className="card__head">
            <div>
              <h2>Dark Logo</h2>
              <p className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
                Shown on dark backgrounds (sidebar, dark-theme headers).
              </p>
            </div>
          </div>

          {/* Current preview on dark bg */}
          <div style={{ marginTop: 12, marginBottom: 16, padding: "16px", borderRadius: 10, background: "#1a1a2e", border: "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#aaa", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current (dark bg)</div>
              <AppLogo variant="dark" color="#ffffff" fontSize="1.6rem" svgSize={20} imgHeight={36} />
            </div>
            {logoDarkUrl && (
              <button
                className="btn btn--sm btn--ghost"
                style={{ borderColor: "rgba(229,57,53,0.5)", color: "#f87171", flexShrink: 0 }}
                disabled={darkDeleting}
                onClick={handleDarkDelete}
              >
                {darkDeleting ? "Removing…" : "Remove"}
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>Upload Dark Logo</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => darkInputRef.current?.click()}>
                  Choose File
                </button>
                <span className="muted" style={{ fontSize: "0.82rem" }}>
                  {darkFile ? darkFile.name : "PNG, JPG, SVG — max 2 MB"}
                </span>
                <input ref={darkInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleDarkFileChange} />
              </div>
            </div>

            {darkPreview && (
              <div style={{ padding: 12, borderRadius: 10, background: "#1a1a2e", border: "1px solid var(--card-border)", display: "inline-flex", alignItems: "center", gap: 12 }}>
                <img src={darkPreview} alt="Preview" style={{ height: 40, maxWidth: 180, objectFit: "contain", borderRadius: 4 }} />
                <span style={{ fontSize: "0.78rem", color: "#aaa" }}>Preview on dark</span>
              </div>
            )}

            {darkResult && (
              <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: "0.85rem", fontWeight: 600,
                background: darkResult.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                border: `1px solid ${darkResult.ok ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
                color: darkResult.ok ? "#4ade80" : "#f87171"
              }}>
                {darkResult.ok ? "✓ " : "✗ "}{darkResult.message}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              {darkFile && (
                <button type="button" className="btn btn--ghost"
                  onClick={() => { setDarkFile(null); setDarkPreview(null); setDarkResult(null); if (darkInputRef.current) darkInputRef.current.value = ""; }}>
                  Cancel
                </button>
              )}
              <button className="btn" type="button" disabled={!darkFile || darkUploading} onClick={handleDarkUpload}
                style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
                {darkUploading ? "Uploading…" : "Upload Dark Logo"}
              </button>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="card">
          <div className="card__head">
            <h2>About This Page</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
            <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.18)" }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 4, color: "#818cf8" }}>Password Reset</div>
              <div className="muted" style={{ fontSize: "0.83rem", lineHeight: 1.6 }}>
                Use this to set a new password for a consultant who has forgotten their login credentials.
                The new password takes effect immediately — the consultant can log in right away with the updated password.
              </div>
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.18)" }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 4, color: "#fbbf24" }}>Important</div>
              <div className="muted" style={{ fontSize: "0.83rem", lineHeight: 1.6 }}>
                Share the new password securely with the consultant.
                Minimum length is 6 characters. The consultant can change their own password from Account Settings after logging in.
              </div>
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.18)" }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 4, color: "#4ade80" }}>Consultants ({consultants.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {consultants.length === 0 && <div className="muted" style={{ fontSize: "0.83rem" }}>No consultants registered yet.</div>}
                {consultants.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.82rem" }}>
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span className="muted">{c.email}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
