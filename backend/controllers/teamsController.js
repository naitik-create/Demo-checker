import { getUserCalendarMeetings } from "../services/userGraphService.js";

/**
 * GET /api/teams/meetings
 * Lists Teams meetings for the authenticated user using their delegated token.
 * Requires: Calendars.Read (Delegated)
 */
export async function listMeetings(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const err = new Error("Authentication required");
      err.status = 401;
      throw err;
    }

    const pastDays = Number(req.query.pastDays || 7);
    const futureDays = Number(req.query.futureDays || 14);

    const meetings = await getUserCalendarMeetings(userId, { pastDays, futureDays });
    res.json({ ok: true, meetings });
  } catch (err) {
    next(err);
  }
}
