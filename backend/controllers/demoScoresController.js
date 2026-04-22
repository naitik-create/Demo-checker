import { DemoScore, Meeting } from "../models/index.js";
import { calculateDemoScores } from "../services/demoScoringEngine.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export async function saveDemoScore(req, res, next) {
  try {
    const { meetingId, communicationScore, engagementScore, structureScore, technicalScore, qaScore } = req.body || {};
    if (!meetingId) throw badRequest("meetingId is required");

    const meetingExists = await Meeting.findOne({ where: { id: meetingId }, attributes: ["id"] });
    if (!meetingExists) {
      const err = new Error("Meeting not found");
      err.status = 404;
      throw err;
    }

    const scores = calculateDemoScores({ communicationScore, engagementScore, structureScore, technicalScore, qaScore });

    const [doc] = await DemoScore.upsert({ meetingId, ...scores }, { returning: true });

    res.status(201).json({
      ok: true,
      demoScore: {
        id: doc.id,
        meetingId: doc.meetingId,
        communicationScore: doc.communicationScore,
        engagementScore: doc.engagementScore,
        structureScore: doc.structureScore,
        technicalScore: doc.technicalScore,
        qaScore: doc.qaScore,
        totalScore: doc.totalScore,
        createdAt: doc.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
}
