import { DemoScore, Meeting } from "../models/index.js";
import { calculateDemoScores } from "../services/demoScoringEngine.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export async function saveDemoScore(req, res, next) {
  try {
    const { 
      meetingId, 
      discoveryScore, 
      rapportScore, 
      demoScore, 
      objectionsScore, 
      engagementScore, 
      closeScore, 
      riskDeduction 
    } = req.body || {};
    if (!meetingId) throw badRequest("meetingId is required");

    const meetingExists = await Meeting.findOne({ where: { id: meetingId }, attributes: ["id"] });
    if (!meetingExists) {
      const err = new Error("Meeting not found");
      err.status = 404;
      throw err;
    }

    const scores = calculateDemoScores({ 
      discoveryScore, 
      rapportScore, 
      demoScore, 
      objectionsScore, 
      engagementScore, 
      closeScore, 
      riskDeduction 
    });

    const [doc] = await DemoScore.upsert({ meetingId, ...scores }, { returning: true });

    res.status(201).json({
      ok: true,
      demoScore: {
        id: doc.id,
        meetingId: doc.meetingId,
        discoveryScore: doc.discoveryScore,
        rapportScore: doc.rapportScore,
        demoScore: doc.demoScore,
        objectionsScore: doc.objectionsScore,
        engagementScore: doc.engagementScore,
        closeScore: doc.closeScore,
        riskDeduction: doc.riskDeduction,
        totalScore: doc.totalScore,
        createdAt: doc.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
}
