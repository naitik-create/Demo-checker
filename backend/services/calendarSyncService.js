import { Op } from "sequelize";
import { Meeting, User } from "../models/index.js";

function toIso(d) { return new Date(d).toISOString(); }

function mapParticipantsFromEvent(evt) {
  const attendees = Array.isArray(evt?.attendees) ? evt.attendees : [];
  return attendees.map((a) => {
    const email = a?.emailAddress?.address;
    const name = a?.emailAddress?.name;
    if (!email && !name) return null;
    return { name, email };
  }).filter(Boolean);
}

function isDemoLikeSubject(subject) {
  return String(subject || "").toLowerCase().includes("demo");
}

function syncWindowFromEnv() {
  const pastDays = Number(process.env.GRAPH_SYNC_DAYS_PAST || 30);
  const futureDays = Number(process.env.GRAPH_SYNC_DAYS_FUTURE || 30);
  const now = Date.now();
  const startDateTime = toIso(now - pastDays * 24 * 60 * 60 * 1000);
  const endDateTime = toIso(now + futureDays * 24 * 60 * 60 * 1000);
  return { pastDays, futureDays, startDateTime, endDateTime };
}

async function refreshConsultantToken(consultant) {
  const { refreshAccessToken } = await import("./msGraphDelegatedService.js");
  const t = await refreshAccessToken(consultant.msRefreshToken);
  await consultant.update({
    msAccessToken: t.accessToken,
    msRefreshToken: t.refreshToken,
    msAccessTokenExpiresAt: new Date(Date.now() + t.expiresIn * 1000)
  });
}

export async function syncConsultantCalendarToDb(consultantId) {
  const { listMyScheduledTeamsMeetings } = await import("./msGraphDelegatedService.js");
  const { startDateTime, endDateTime } = syncWindowFromEnv();

  const consultant = await User.findOne({
    where: { id: consultantId },
    attributes: ["id", "msRefreshToken", "msAccessToken", "msAccessTokenExpiresAt", "msUpn", "name", "email", "role"]
  });

  if (!consultant) return { ok: false, code: "not_found", message: "User not found.", fetched: 0, upsertedMeetings: 0, window: { startDateTime, endDateTime } };
  if (!consultant.msRefreshToken) return { ok: false, code: "no_teams", message: "This consultant has not connected Microsoft Teams.", fetched: 0, upsertedMeetings: 0, window: { startDateTime, endDateTime }, consultantId: consultant.id };

  const expiresAt = consultant.msAccessTokenExpiresAt ? new Date(consultant.msAccessTokenExpiresAt).getTime() : 0;
  if (!consultant.msAccessToken || Date.now() > expiresAt - 60_000) {
    try {
      await refreshConsultantToken(consultant);
    } catch (e) {
      return { ok: false, code: "token_refresh", message: e.message || "Could not refresh Microsoft token.", fetched: 0, upsertedMeetings: 0, window: { startDateTime, endDateTime }, consultantId: consultant.id };
    }
  }

  if (!consultant.msAccessToken) return { ok: false, code: "no_access_token", message: "No valid Microsoft access token.", fetched: 0, upsertedMeetings: 0, window: { startDateTime, endDateTime }, consultantId: consultant.id };

  let events = [];
  try {
    events = await listMyScheduledTeamsMeetings(consultant.msAccessToken, { startDateTime, endDateTime });
  } catch (e) {
    return { ok: false, code: "graph_calendar", message: e.response?.data?.error?.message || e.message || "Microsoft Graph calendar request failed.", fetched: 0, upsertedMeetings: 0, window: { startDateTime, endDateTime }, consultantId: consultant.id };
  }

  let upsertedMeetings = 0;
  for (const evt of events) {
    const teamsMeetingId = evt?.onlineMeeting?.conferenceId || evt?.onlineMeeting?.joinUrl || evt?.onlineMeeting?.joinWebUrl || evt?.id;
    if (!teamsMeetingId) continue;

    const title = evt?.subject || "Teams meeting";
    const startTime = evt?.start?.dateTime ? new Date(evt.start.dateTime) : null;
    const endTime = evt?.end?.dateTime ? new Date(evt.end.dateTime) : null;
    if (!startTime || !endTime) continue;

    const participants = mapParticipantsFromEvent(evt);
    const autoMonitor = isDemoLikeSubject(title);
    const setPayload = {
      title,
      teamsMeetingId: String(teamsMeetingId),
      consultantId: consultant.id,
      participants,
      startTime,
      endTime,
      status: "scheduled",
      raw: { graphEvent: evt, organizerEmail: evt?.organizer?.emailAddress?.address || "", joinUrl: evt?.onlineMeeting?.joinUrl || evt?.onlineMeeting?.joinWebUrl || null }
    };
    if (autoMonitor) setPayload.monitored = true;

    const existing = await Meeting.findOne({ where: { teamsMeetingId: String(teamsMeetingId), consultantId: consultant.id } });
    if (existing) {
      await existing.update(setPayload);
    } else {
      await Meeting.create(setPayload);
    }
    upsertedMeetings++;
  }

  return { ok: true, fetched: events.length, upsertedMeetings, window: { startDateTime, endDateTime }, consultantId: consultant.id };
}

export async function syncAllConsultantsCalendarsToDb() {
  const { startDateTime, endDateTime } = syncWindowFromEnv();

  const consultants = await User.findAll({
    where: { msRefreshToken: { [Op.ne]: null } },
    attributes: ["id"]
  });

  if (!consultants.length) {
    return { ok: true, message: "No Teams-connected users found.", fetched: 0, upsertedMeetings: 0, window: { startDateTime, endDateTime }, perConsultant: [] };
  }

  let fetched = 0, upsertedMeetings = 0;
  const perConsultant = [];

  for (const c of consultants) {
    const one = await syncConsultantCalendarToDb(c.id);
    perConsultant.push({ consultantId: one.consultantId, ok: one.ok, fetched: one.fetched, upsertedMeetings: one.upsertedMeetings, message: one.message });
    if (one.ok) { fetched += one.fetched; upsertedMeetings += one.upsertedMeetings; }
  }

  return { ok: true, fetched, upsertedMeetings, window: { startDateTime, endDateTime }, perConsultant };
}
