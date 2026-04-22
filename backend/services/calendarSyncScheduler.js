import { syncAllConsultantsCalendarsToDb } from "./calendarSyncService.js";

/**
 * Optional background job: pulls every Teams-connected user’s calendar into MongoDB
 * on a fixed interval (default 5 minutes).
 *
 * Enable with: ENABLE_CALENDAR_AUTO_SYNC=true
 * Override interval (ms): CALENDAR_SYNC_INTERVAL_MS=300000
 */
export function startCalendarSyncScheduler() {
  const enabled = String(process.env.ENABLE_CALENDAR_AUTO_SYNC || "").toLowerCase() === "true";
  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log(
      "[CalendarSync] Auto calendar → DB sync is off. Set ENABLE_CALENDAR_AUTO_SYNC=true to run every 5 minutes (or set CALENDAR_SYNC_INTERVAL_MS)."
    );
    return;
  }

  const intervalMs = Math.max(60_000, Number(process.env.CALENDAR_SYNC_INTERVAL_MS || 5 * 60 * 1000));

  async function tick() {
    try {
      const r = await syncAllConsultantsCalendarsToDb();
      // eslint-disable-next-line no-console
      console.log(
        `[CalendarSync] ${new Date().toISOString()} — events fetched: ${r.fetched}, meetings upserted: ${r.upsertedMeetings}`
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[CalendarSync] Scheduled sync failed:", err.message);
    }
  }

  const initialDelayMs = Math.min(30_000, intervalMs);
  setTimeout(tick, initialDelayMs);
  setInterval(tick, intervalMs);

  // eslint-disable-next-line no-console
  console.log(`[CalendarSync] Auto sync enabled — interval ${Math.round(intervalMs / 1000)}s (${intervalMs / 60000} min).`);
}
