import axios from "axios";

const TENANT = process.env.AZURE_TENANT_ID || "common";
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const REDIRECT_URI = process.env.AZURE_REDIRECT_URI || "http://localhost:5000/api/teams/oauth/callback";
const DELEGATED_SCOPES = process.env.AZURE_SCOPE || "offline_access User.Read Calendars.Read OnlineMeetings.Read OnlineMeetingTranscript.Read Chat.Read";
// All scopes are delegated — admin must grant consent in Azure portal

function configured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export async function refreshAccessToken(refreshToken) {
  if (!configured()) {
    const err = new Error("Azure AD app is not fully configured");
    err.status = 500;
    throw err;
  }
  if (!refreshToken) {
    const err = new Error("Missing Microsoft refresh token");
    err.status = 400;
    throw err;
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: REDIRECT_URI,
    // Use delegated scopes to avoid forcing tenant-wide admin consent via /.default.
    // Keep this aligned with the scopes used in the authorize URL (AZURE_SCOPE).
    scope: DELEGATED_SCOPES
  });

  const res = await axios.post(tokenUrl, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  const data = res.data || {};
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: Number(data.expires_in || 0)
  };
}

export async function graphGet(accessToken, url, params) {
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params
  });
  return res.data;
}

export async function listMyScheduledTeamsMeetings(accessToken, { startDateTime, endDateTime }) {
  const url = "https://graph.microsoft.com/v1.0/me/calendarView";
  const data = await graphGet(accessToken, url, {
    startDateTime,
    endDateTime,
    $top: 100,
    $select:
      "id,subject,organizer,attendees,start,end,isOnlineMeeting,onlineMeetingProvider,onlineMeeting",
    // Graph may reject filtering on `isOnlineMeeting` for delegated token.
    // We'll filter in JS instead.
  });
  const events = data?.value || [];
  return events.filter(
    (e) =>
      e?.isOnlineMeeting === true &&
      (e?.onlineMeetingProvider === "teamsForBusiness" || e?.onlineMeeting?.joinUrl || e?.onlineMeeting?.joinWebUrl)
  );
}

