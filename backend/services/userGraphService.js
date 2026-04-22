/**
 * userGraphService.js
 * All Microsoft Graph API calls using a USER's delegated access token.
 * This is different from graphService.js which uses app-only (client_credentials) token.
 *
 * Data we can get with the currently granted permissions (no admin consent needed):
 *
 *  User.Read:
 *    - displayName, mail, userPrincipalName, jobTitle, department, officeLocation, id
 *
 *  Calendars.Read:
 *    - Calendar events (including Teams meetings) — title, start, end, attendees, join URL
 *
 *  OnlineMeetings.Read:
 *    - Online meeting detail: subject, joinWebUrl, participants, startDateTime, endDateTime,
 *      chatInfo (threadId), attendeeReport (recording URL if available)
 *
 *  Chat.Read:
 *    - Chat messages from Teams channels / meetings
 */
import axios from "axios";
import dotenv from "dotenv";
import { User } from "../models/User.js";

dotenv.config({ override: true });

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const GRAPH_BASE = "https://graph.microsoft.com";

/**
 * calendarView with Prefer: outlook.timezone="UTC" returns UTC wall time in dateTime
 * without a Z suffix. Normalize to an ISO string parseable by Date in JS.
 */
function graphDateTimeToUtcIso(dateTime) {
  if (!dateTime) return null;
  const s = String(dateTime)
    .trim()
    .replace(/(\.\d{3})\d*(?=$|[Zz]|[+-])/, "$1");
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return s;
  return `${s}Z`;
}

/**
 * Refresh the access token for a user using their stored refresh token.
 * Updates the user document in DB with new tokens.
 * @param {string} userId - MongoDB user _id
 * @returns {string} fresh access token
 */
export async function getOrRefreshUserToken(userId) {
  const user = await User.findOne({
    where: { id: userId },
    attributes: ["id", "msRefreshToken", "msAccessToken", "msAccessTokenExpiresAt"]
  });
  if (!user?.msRefreshToken) {
    const err = new Error("Microsoft Teams not connected. Please connect first.");
    err.status = 403;
    throw err;
  }

  // Return cached token if still valid (with 2 min buffer)
  const now = Date.now();
  const expiresAt = user.msAccessTokenExpiresAt ? new Date(user.msAccessTokenExpiresAt).getTime() : 0;
  if (user.msAccessToken && now < expiresAt - 120_000) {
    return user.msAccessToken;
  }

  // Refresh the token
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: user.msRefreshToken
  });

  let res;
  try {
    res = await axios.post(tokenUrl, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
  } catch (e) {
    const detail = e.response?.data?.error_description || e.response?.data?.error || e.message;
    const err = new Error(`Token refresh failed: ${detail}. Please reconnect Teams.`);
    err.status = 401;
    throw err;
  }

  const { access_token, refresh_token, expires_in } = res.data || {};
  if (!access_token) {
    const err = new Error("No access token returned from Microsoft. Please reconnect Teams.");
    err.status = 401;
    throw err;
  }

  // Persist refreshed tokens
  await User.update(
    {
      msAccessToken: access_token,
      msRefreshToken: refresh_token || user.msRefreshToken,
      msAccessTokenExpiresAt: new Date(Date.now() + Number(expires_in || 3600) * 1000)
    },
    { where: { id: userId } }
  );

  return access_token;
}

/**
 * GET /v1.0/me — Basic user profile
 * Requires: User.Read
 * Returns: { id, displayName, mail, userPrincipalName, jobTitle, department, officeLocation, mobilePhone }
 */
export async function getUserProfile(userId) {
  const token = await getOrRefreshUserToken(userId);
  const res = await axios.get(`${GRAPH_BASE}/v1.0/me`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      $select: "id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone"
    }
  });
  return res.data;
}

/**
 * GET /v1.0/me/calendarView — Calendar events (Teams online meetings)
 * Requires: Calendars.Read
 * Pass either { pastDays, futureDays } or explicit { startDateTime, endDateTime } ISO strings.
 */
export async function getUserCalendarMeetings(
  userId,
  { pastDays = 7, futureDays = 14, startDateTime: startOverride, endDateTime: endOverride } = {}
) {
  const token = await getOrRefreshUserToken(userId);
  const now = Date.now();
  let startDateTime;
  let endDateTime;
  if (startOverride && endOverride) {
    startDateTime = new Date(startOverride).toISOString();
    endDateTime = new Date(endOverride).toISOString();
  } else {
    startDateTime = new Date(now - pastDays * 24 * 60 * 60 * 1000).toISOString();
    endDateTime = new Date(now + futureDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const rangeMs = new Date(endDateTime) - new Date(startDateTime);
  const daysApprox = Math.max(1, Math.ceil(rangeMs / (24 * 60 * 60 * 1000)));
  const top = Math.min(999, Math.max(50, daysApprox * 3));

  try {
    const res = await axios.get(`${GRAPH_BASE}/v1.0/me/calendarView`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="UTC"'
      },
      params: {
        startDateTime,
        endDateTime,
        $top: top,
        $orderby: "start/dateTime",
        // Note: we do NOT use $filter on isOnlineMeeting because Graph reports
        // "The property 'isOnlineMeeting' does not support filtering."
        // Instead we filter in memory below.
        $select: "id,subject,start,end,attendees,isOnlineMeeting,onlineMeetingProvider,onlineMeeting,organizer,bodyPreview"
      }
    });

    const events = (res.data?.value || []).filter(
      (e) =>
        e.isOnlineMeeting === true &&
        (e.onlineMeetingProvider === "teamsForBusiness" || e.onlineMeeting?.joinUrl || e.onlineMeeting?.joinWebUrl)
    );
    return events.map((e) => ({
      id: e.id,
      subject: e.subject || "Teams Meeting",
      startTime: e.start?.dateTime,
      endTime: e.end?.dateTime,
      startTimeZone: e.start?.timeZone || "UTC",
      endTimeZone: e.end?.timeZone || "UTC",
      startTimeIso: graphDateTimeToUtcIso(e.start?.dateTime),
      endTimeIso: graphDateTimeToUtcIso(e.end?.dateTime),
      joinUrl: e.onlineMeeting?.joinUrl || e.onlineMeeting?.joinWebUrl || null,
      organizer: e.organizer?.emailAddress?.address || "",
      attendees: (e.attendees || []).map((a) => ({
        name: a.emailAddress?.name || "",
        email: a.emailAddress?.address || ""
      })),
      isOnlineMeeting: e.isOnlineMeeting,
      bodyPreview: e.bodyPreview || ""
    }));
  } catch (err) {
    // Return empty array if calendar is inaccessible (e.g. permission not yet granted)
    // eslint-disable-next-line no-console
    console.warn("[userGraphService] calendarView failed:", err.response?.data?.error?.message || err.message);
    return [];
  }
}

/** OData single-quoted string: escape ' as '' */
function escapeODataString(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * GET /v1.0/me/onlineMeetings?$filter=JoinWebUrl eq '...'
 * Find the online meeting object by its join URL (needed to get the meeting ID for transcripts).
 * Requires: OnlineMeetings.Read
 */
export async function getOnlineMeetingByJoinUrl(userId, joinUrl) {
  if (!joinUrl) return null;
  const token = await getOrRefreshUserToken(userId);
  const trimmed = String(joinUrl).trim();
  const escaped = escapeODataString(trimmed);
  try {
    // Keep query options minimal: some tenants reject $select/$top here.
    async function request(params) {
      const res = await axios.get(`${GRAPH_BASE}/v1.0/me/onlineMeetings`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      const items = res.data?.value || [];
      return items[0] || null;
    }

    // Graph property is `joinWebUrl` (case-insensitive in most tenants, but keep canonical name).
    return await request({
      $filter: `joinWebUrl eq '${escaped}'`
    });
  } catch (err) {
    console.warn("[userGraphService] getOnlineMeetingByJoinUrl failed:", err.response?.data?.error?.message || err.message);
    return null;
  }
}

/**
 * Try several join URL variants (calendar vs onlineMeetings often differ slightly).
 */
export async function resolveOnlineMeetingByJoinUrls(userId, urls) {
  const seen = new Set();
  const list = (urls || []).filter(Boolean).map((u) => String(u).trim()).filter((u) => u.length > 0);
  for (const u of list) {
    if (seen.has(u)) continue;
    seen.add(u);
    const om = await getOnlineMeetingByJoinUrl(userId, u);
    if (om?.id) return { onlineMeeting: om, matchedJoinUrl: u };
    try {
      const decoded = decodeURIComponent(u);
      if (decoded !== u && !seen.has(decoded)) {
        seen.add(decoded);
        const om2 = await getOnlineMeetingByJoinUrl(userId, decoded);
        if (om2?.id) return { onlineMeeting: om2, matchedJoinUrl: decoded };
      }
    } catch {
      /* ignore */
    }
  }
  return { onlineMeeting: null, matchedJoinUrl: null };
}

/**
 * GET /v1.0/me/onlineMeetings/{meetingId}/transcripts
 * List all available transcripts for a given online meeting.
 * Requires: OnlineMeetingTranscript.Read (Delegated) — "Read all transcripts of online meetings"
 * Returns array of transcript metadata: { id, meetingId, createdDateTime, transcriptContentUrl }
 */
export async function getMeetingTranscripts(userId, onlineMeetingId) {
  if (!onlineMeetingId) return [];
  const token = await getOrRefreshUserToken(userId);
  try {
    const res = await axios.get(
      `${GRAPH_BASE}/v1.0/me/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/transcripts`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data?.value || [];
  } catch (err) {
    console.warn("[userGraphService] getMeetingTranscripts failed:", err.response?.data?.error?.message || err.message);
    throw err;
  }
}

/**
 * GET transcript content (VTT or plain text) from its content URL.
 * Requires: OnlineMeetingTranscript.Read (Delegated)
 * The content URL is returned by getMeetingTranscripts above.
 * Returns: raw text content (VTT format) as a string.
 */
export async function getTranscriptContent(userId, contentUrl) {
  if (!contentUrl) return null;
  const token = await getOrRefreshUserToken(userId);
  const base = String(contentUrl).trim();

  async function fetchVtt(url) {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/vtt, text/plain, */*"
      },
      responseType: "text",
      validateStatus: (s) => s >= 200 && s < 300
    });
    return res.data || null;
  }

  try {
    let fetchUrl = base;
    if (!fetchUrl.includes("format=text/vtt") && !fetchUrl.includes("$format=")) {
      fetchUrl += fetchUrl.includes("?") ? "&" : "?";
      fetchUrl += "$format=text/vtt";
    }
    const vtt = await fetchVtt(fetchUrl);
    if (vtt) return vtt;
  } catch (err) {
    console.warn("[userGraphService] getTranscriptContent (vtt) failed:", err.response?.data?.error?.message || err.message);
  }

  try {
    return await fetchVtt(base);
  } catch (err2) {
    console.warn("[userGraphService] getTranscriptContent (raw) failed:", err2.response?.data?.error?.message || err2.message);
    return null;
  }
}

/**
 * GET /v1.0/chats/{chatId}/messages — Chat messages from a Teams meeting chat thread.
 * Requires: Chat.Read (Delegated)
 * Returns array of message objects with body.content (may be HTML).
 */
export async function getMeetingChatMessages(userId, chatThreadId) {
  if (!chatThreadId) return [];
  const token = await getOrRefreshUserToken(userId);
  try {
    const res = await axios.get(
      `${GRAPH_BASE}/v1.0/chats/${encodeURIComponent(chatThreadId)}/messages`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { $top: 100, $select: "id,body,from,createdDateTime,messageType" }
      }
    );
    const messages = res.data?.value || [];
    // Filter to plain text messages only, strip HTML tags
    return messages
      .filter((m) => m.messageType === "message" && m.body?.content)
      .map((m) => ({
        from: m.from?.user?.displayName || m.from?.application?.displayName || "Unknown",
        time: m.createdDateTime,
        text: m.body.content.replace(/<[^>]+>/g, "").trim()
      }))
      .filter((m) => m.text.length > 0);
  } catch (err) {
    console.warn("[userGraphService] getMeetingChatMessages failed:", err.response?.data?.error?.message || err.message);
    return [];
  }
}

/**
 * Parse VTT transcript text into plain readable text for AI analysis.
 * Input: raw VTT string (WebVTT format)
 * Output: clean plain text transcript
 */
export function parseVttToPlainText(vttContent) {
  if (!vttContent) return "";
  return vttContent
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // Skip VTT header, cue timestamps (00:00:00.000 --> ...), blank lines, NOTE lines
      if (!trimmed) return false;
      if (trimmed === "WEBVTT") return false;
      if (/^\d{2}:\d{2}:\d{2}/.test(trimmed)) return false;
      if (/^NOTE/.test(trimmed)) return false;
      if (/^\d+$/.test(trimmed)) return false; // cue numbers
      return true;
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

