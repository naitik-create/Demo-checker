import "dotenv/config";
import axios from "axios";

function missingEnv(name) {
  const err = new Error(`Missing required env var: ${name}`);
  err.status = 400;
  return err;
}

export class GraphService {
  constructor() {
    this.tenantId = process.env.AZURE_TENANT_ID;
    this.clientId = process.env.AZURE_CLIENT_ID;
    this.clientSecret = process.env.AZURE_CLIENT_SECRET;
    this.baseUrl = process.env.GRAPH_BASE_URL || "https://graph.microsoft.com";

    this._token = null;
    this._tokenExpiresAtMs = 0;
  }

  async getAppOnlyAccessToken() {
    if (!this.tenantId) throw missingEnv("AZURE_TENANT_ID");
    if (!this.clientId) throw missingEnv("AZURE_CLIENT_ID");
    if (!this.clientSecret) throw missingEnv("AZURE_CLIENT_SECRET");

    const now = Date.now();
    if (this._token && now < this._tokenExpiresAtMs - 30_000) return this._token;

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default"
    });

    const res = await axios.post(tokenUrl, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const token = res.data?.access_token;
    const expiresIn = Number(res.data?.expires_in || 0);
    if (!token) {
      const err = new Error("Failed to obtain Microsoft Graph access token");
      err.status = 502;
      throw err;
    }

    this._token = token;
    this._tokenExpiresAtMs = Date.now() + expiresIn * 1000;
    return token;
  }

  async listOnlineMeetings({ userPrincipalName, startDateTime, endDateTime }) {
    if (!userPrincipalName) {
      const err = new Error("Query param 'userPrincipalName' is required");
      err.status = 400;
      throw err;
    }

    const token = await this.getAppOnlyAccessToken();
    const url = `${this.baseUrl}/v1.0/users/${encodeURIComponent(
      userPrincipalName
    )}/onlineMeetings`;

    const filters = [];
    if (startDateTime) filters.push(`startDateTime ge ${startDateTime}`);
    if (endDateTime) filters.push(`endDateTime le ${endDateTime}`);

    const params = {};
    if (filters.length) params["$filter"] = filters.join(" and ");

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params
    });

    return res.data;
  }

  async listScheduledTeamsMeetings({ userPrincipalName, startDateTime, endDateTime }) {
    if (!userPrincipalName) throw missingEnv("GRAPH_USER_PRINCIPAL_NAME");
    if (!startDateTime || !endDateTime) {
      const err = new Error("startDateTime and endDateTime are required");
      err.status = 400;
      throw err;
    }

    const token = await this.getAppOnlyAccessToken();
    const url = `${this.baseUrl}/v1.0/users/${encodeURIComponent(
      userPrincipalName
    )}/calendarView`;

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        startDateTime,
        endDateTime,
        $top: 100,
        $select:
          "id,subject,organizer,attendees,start,end,isOnlineMeeting,onlineMeetingProvider,onlineMeeting",
        // Graph may reject filtering on isOnlineMeeting. Filter in memory instead.
      }
    });

    const events = res.data?.value || [];
    return events.filter(
      (e) =>
        e?.isOnlineMeeting === true &&
        (e?.onlineMeetingProvider === "teamsForBusiness" ||
          e?.onlineMeeting?.joinUrl ||
          e?.onlineMeeting?.joinWebUrl)
    );
  }

  async getChatMessagesByThreadId(threadId) {
    if (!threadId) return [];
    const token = await this.getAppOnlyAccessToken();
    const url = `${this.baseUrl}/v1.0/chats/${encodeURIComponent(threadId)}/messages`;

    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { $top: 50 }
      });
      return res.data?.value || [];
    } catch (err) {
      // Not all tenants/apps have this permission or the threadId may not be accessible.
      return [];
    }
  }

  async getMeetingRecordingsBestEffort({ userPrincipalName, onlineMeetingId }) {
    if (!userPrincipalName || !onlineMeetingId) return [];
    const token = await this.getAppOnlyAccessToken();

    // Recording APIs can vary; beta currently exposes more meeting artifacts.
    const url = `${this.baseUrl}/beta/users/${encodeURIComponent(
      userPrincipalName
    )}/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/recordings`;

    try {
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      return res.data?.value || [];
    } catch (_err) {
      return [];
    }
  }
}

