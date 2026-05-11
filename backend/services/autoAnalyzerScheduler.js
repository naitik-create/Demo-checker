import { Op } from "sequelize";
import { Meeting } from "../models/index.js";
import { runDemoMonitoringWorkflow } from "./demoMonitoringWorkflow.js";

export function startAutoAnalyzerScheduler() {
  const INTERVAL_MS = 5 * 60 * 1000;

  async function checkAndAnalyzeMeetings() {
    try {
      const now = new Date();
      const pendingMeetings = await Meeting.findAll({
        where: {
          monitored: true,
          endTime: { [Op.lte]: now },
          status: { [Op.ne]: "completed" },
          autoAnalyzedAt: null
        },
        limit: 5
      });

      if (pendingMeetings.length > 0) {
        console.log(`[AutoAnalyzer] Found ${pendingMeetings.length} monitored meetings ended. Starting workflow...`);
        const res = await runDemoMonitoringWorkflow({ maxMeetingsToProcess: 5 });
        console.log(`[AutoAnalyzer] Workflow finished. Processed: ${res.processed.length}, Skipped: ${res.skipped.length}`);

        const processedIds = res.processed.map((m) => m.meetingId);
        if (processedIds.length > 0) {
          await Meeting.update(
            { autoAnalyzedAt: new Date() },
            { where: { id: { [Op.in]: processedIds } } }
          );
        }
      }
    } catch (err) {
      console.error("[AutoAnalyzer] Error running scheduled analysis:", err.message);
      if (err.errors) console.error("[AutoAnalyzer] Details:", JSON.stringify(err.errors.map(e => ({ message: e.message, type: e.type, path: e.path }))));
    }
  }

  setTimeout(checkAndAnalyzeMeetings, 10000);
  setInterval(checkAndAnalyzeMeetings, INTERVAL_MS);
  console.log("[AutoAnalyzer] Scheduler started. Checking for completed monitored meetings every 5 minutes.");
}
