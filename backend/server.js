import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({
  path: path.join(__dirname, ".env"),
  override: true
});

import { connectDatabase } from "./config/database.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { teamsRoutes } from "./routes/teamsRoutes.js";
import { teamsConnectRoutes } from "./routes/teamsConnectRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { meetingsRoutes } from "./routes/meetingsRoutes.js";
import { transcriptsRoutes } from "./routes/transcriptsRoutes.js";
import { analysisReportsRoutes } from "./routes/analysisReportsRoutes.js";
import { demoScoresRoutes } from "./routes/demoScoresRoutes.js";
import { performanceRoutes } from "./routes/performanceRoutes.js";
import { workflowRoutes } from "./routes/workflowRoutes.js";
import { consultantsRoutes } from "./routes/consultantsRoutes.js";
import { reportsRoutes } from "./routes/reportsRoutes.js";
import { presalesReportsRoutes } from "./routes/presalesReportsRoutes.js";
import { speechMeetingsRoutes } from "./routes/speechMeetingsRoutes.js";
import { startAutoAnalyzerScheduler } from "./services/autoAnalyzerScheduler.js";
import { startCalendarSyncScheduler } from "./services/calendarSyncScheduler.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { settingsRoutes } from "./routes/settingsRoutes.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/teams", teamsConnectRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/meetings", meetingsRoutes);
app.use("/api/transcripts", transcriptsRoutes);
app.use("/api/analysis-reports", analysisReportsRoutes);
app.use("/api/demo-scores", demoScoresRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/consultants", consultantsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/presales-reports", presalesReportsRoutes);
app.use("/api/stt", speechMeetingsRoutes);
app.use("/api/settings", settingsRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);

async function start() {
  await connectDatabase();
  // eslint-disable-next-line no-console
  console.log("Connected to PostgreSQL database");

  const server = app.listen(PORT, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://0.0.0.0:${PORT}`);
    startCalendarSyncScheduler();
    startAutoAnalyzerScheduler();
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      // eslint-disable-next-line no-console
      console.error(`\n❌  Port ${PORT} is already in use.\n   Stop the other process or run:  npm run killport\n   Then restart the server.\n`);
      process.exit(1);
    } else {
      // eslint-disable-next-line no-console
      console.error("Server error:", err);
      process.exit(1);
    }
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});
