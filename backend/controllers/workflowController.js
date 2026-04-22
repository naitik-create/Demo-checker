import { runDemoMonitoringWorkflow } from "../services/demoMonitoringWorkflow.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export async function runWorkflow(req, res, next) {
  try {
    const maxMeetingsToProcess = req.body?.maxMeetingsToProcess;
    const max = maxMeetingsToProcess === undefined ? 10 : Number(maxMeetingsToProcess);
    if (!Number.isFinite(max) || max <= 0 || max > 100) {
      throw badRequest("maxMeetingsToProcess must be a number between 1 and 100");
    }

    const result = await runDemoMonitoringWorkflow({ maxMeetingsToProcess: max });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

