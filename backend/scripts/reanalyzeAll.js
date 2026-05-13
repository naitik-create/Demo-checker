/**
 * reanalyzeAll.js
 * Deletes all existing scores and analysis reports, then re-analyzes every
 * meeting that has a transcript stored in the database using the Claude AI flow.
 *
 * Usage:
 *   node --experimental-vm-modules backend/scripts/reanalyzeAll.js
 *   (run from project root, or from backend/ directory)
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

import { connectDatabase } from "../config/database.js";
import { Meeting, Transcript, AnalysisReport, DemoScore } from "../models/index.js";
import { analyzeAndScoreMeeting } from "../services/demoMonitoringWorkflow.js";

async function main() {
  console.log("=== Re-analyze All Meetings ===\n");
  await connectDatabase();

  // Step 1: Delete all existing analysis data
  console.log("Step 1: Clearing existing scores and analysis reports...");
  const deletedScores = await DemoScore.destroy({ where: {}, truncate: false });
  const deletedReports = await AnalysisReport.destroy({ where: {}, truncate: false });
  console.log(`  Deleted ${deletedScores} DemoScore records`);
  console.log(`  Deleted ${deletedReports} AnalysisReport records`);

  // Step 2: Reset analysisStatus on all meetings
  console.log("\nStep 2: Resetting analysisStatus on all meetings...");
  const [resetCount] = await Meeting.update(
    { analysisStatus: "not_started", autoAnalyzedAt: null },
    { where: {} }
  );
  console.log(`  Reset ${resetCount} meetings`);

  // Step 3: Find all meetings that have a transcript
  console.log("\nStep 3: Finding meetings with transcripts...");
  const transcripts = await Transcript.findAll({
    where: {},
    attributes: ["meetingId", "transcriptText"]
  });

  const withText = transcripts.filter(t => t.transcriptText && t.transcriptText.trim().length > 15);
  console.log(`  Found ${transcripts.length} transcript records, ${withText.length} have content\n`);

  if (withText.length === 0) {
    console.log("No transcripts with content found. Nothing to analyze.");
    process.exit(0);
  }

  // Step 4: Re-analyze each meeting sequentially
  console.log("Step 4: Running Claude AI analysis on each meeting...\n");
  let success = 0, failed = 0;

  for (let i = 0; i < withText.length; i++) {
    const t = withText[i];
    const meeting = await Meeting.findOne({ where: { id: t.meetingId } });
    if (!meeting) {
      console.log(`  [${i + 1}/${withText.length}] SKIP — meeting ${t.meetingId} not found in DB`);
      failed++;
      continue;
    }

    const title = meeting.title || "Untitled";
    console.log(`  [${i + 1}/${withText.length}] Analyzing: "${title}" (${meeting.id})`);

    try {
      await meeting.update({ analysisStatus: "pending" });
      const { scores } = await analyzeAndScoreMeeting(meeting, {
        transcriptText: t.transcriptText,
        source: "db"
      });
      await meeting.update({ autoAnalyzedAt: new Date() });
      console.log(`    ✓ Score: ${scores.totalScore}/100`);
      success++;
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`);
      await meeting.update({ analysisStatus: "failed" }).catch(() => {});
      failed++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Success: ${success}`);
  console.log(`  Failed:  ${failed}`);
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
