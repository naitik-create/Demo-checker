import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

// Ensure .env is loaded even though server.js also calls dotenv.config().
// This guarantees AZURE_TENANT_ID, AZURE_CLIENT_ID, etc. are available
// before we read them into constants.
dotenv.config();
// Ensure local .env values win (esp. AZURE_SCOPE)
dotenv.config({ override: true });
// Temporary debug logs to verify env is loaded correctly for OAuth
// eslint-disable-next-line no-console
console.log("AZURE_TENANT_ID:", process.env.AZURE_TENANT_ID);
// eslint-disable-next-line no-console
console.log("AZURE_CLIENT_ID:", process.env.AZURE_CLIENT_ID);

// Use tenant-specific endpoint (single-tenant app). Do NOT use /common.
const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
// Must match exactly Azure App Registration > Authentication > Redirect URIs
const REDIRECT_URI = (process.env.AZURE_REDIRECT_URI || "http://localhost:5000/api/teams/oauth/callback").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Full delegated scope — includes transcript access for transcript-only AI pipeline.
// This is read from AZURE_SCOPE in .env. Admin must "Grant admin consent" in Azure portal.
const OAUTH_SCOPES =
  process.env.AZURE_SCOPE ||
  "offline_access User.Read Calendars.Read OnlineMeetings.Read OnlineMeetingTranscript.Read Chat.Read";

export function buildTeamsConnectUrl(userId, loginHint) {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !OAUTH_SCOPES) {
    const err = new Error(
      "Azure AD app is not fully configured (missing AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_REDIRECT_URI / AZURE_SCOPE)"
    );
    err.status = 500;
    throw err;
  }

  const stateToken = jwt.sign(
    { sub: userId, purpose: "teams_connect", iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: "10m" }
  );

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: OAUTH_SCOPES,
    // Force account picker so a cached browser session (e.g. a different user's account)
    // is never silently reused — the consultant must sign in with their own account.
    prompt: "select_account",
    state: stateToken
  });
  if (loginHint) params.set("login_hint", loginHint);

  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
  // eslint-disable-next-line no-console
  console.log("[Teams Connect] Consultant self-connect auth URL:", url);
  return url;
}

export function buildTeamsConnectUrlForConsultant({ managerUserId, consultantUserId, loginHint }) {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !OAUTH_SCOPES) {
    const err = new Error(
      "Azure AD app is not fully configured (missing AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_REDIRECT_URI / AZURE_SCOPE)"
    );
    err.status = 500;
    throw err;
  }

  const stateToken = jwt.sign(
    {
      sub: consultantUserId,
      managerUserId,
      purpose: "teams_connect_consultant",
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: "10m" }
  );

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: OAUTH_SCOPES,
    // Force account picker so the consultant's account is explicitly chosen,
    // not a cached manager browser session.
    prompt: "select_account",
    state: stateToken
  });
  if (loginHint) params.set("login_hint", loginHint);

  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
  // eslint-disable-next-line no-console
  console.log("[Teams Connect] Consultant auth URL:", url);
  return url;
}

export async function exchangeCodeForTokens(code, stateToken) {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    const err = new Error("Azure AD app is not fully configured (missing AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET)");
    err.status = 500;
    throw err;
  }

  let payload;
  try {
    payload = jwt.verify(stateToken, JWT_SECRET);
  } catch {
    const err = new Error("Invalid or expired state");
    err.status = 400;
    throw err;
  }

  // FIX: Accept both purposes (self-connect and consultant connect by manager)
  const validPurposes = ["teams_connect", "teams_connect_consultant"];
  if (!validPurposes.includes(payload.purpose) || !payload.sub) {
    const err = new Error("Invalid state payload");
    err.status = 400;
    throw err;
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  // Do NOT include scope in token request - it can cause invalid_grant
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI
  });

  let res;
  try {
    res = await axios.post(tokenUrl, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
  } catch (e) {
    const detail = e.response?.data?.error_description || e.response?.data?.error || e.message;
    const err = new Error(`Microsoft token exchange failed: ${detail}`);
    err.status = 502;
    throw err;
  }

  const data = res.data || {};
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  const expiresIn = Number(data.expires_in || 0);

  if (!accessToken) {
    const detail = data.error_description || data.error || "No access_token in response";
    const err = new Error(`Microsoft token response: ${detail}`);
    err.status = 502;
    throw err;
  }

  const accessTokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  return {
    appUserId: payload.sub,
    purpose: payload.purpose,
    accessToken,
    refreshToken: refreshToken || null,
    accessTokenExpiresAt
  };
}

export function parsePurposeFromState(stateToken) {
  try {
    const payload = jwt.verify(stateToken, JWT_SECRET);
    return { purpose: payload.purpose || null, sub: payload.sub || null };
  } catch {
    return { purpose: null, sub: null };
  }
}

export function teamsConnectRedirectUrl({ success = true, reason, role, purpose } = {}) {
  const base = FRONTEND_URL.replace(/\/$/, "");
  // Consultant self-connect → go to the connect-teams page (shows success/error there)
  // Manager-initiated consultant connect → go back to manager consultants page
  // When role is not known (error paths), fall back to purpose from the state JWT:
  //   "teams_connect_consultant" means manager initiated → manager page
  //   "teams_connect" means self-connect (consultant) → consultant page
  const resolvedRole = role ?? (purpose === "teams_connect_consultant" ? "manager" : "consultant");
  const path = resolvedRole === "consultant" ? "/consultant/connect-teams" : "/manager/consultants";
  const url = new URL(`${base}${path}`);
  url.searchParams.set("teams", success ? "connected" : "error");
  if (!success && reason) url.searchParams.set("reason", reason);
  return url.toString();
}

