import { Transcript, Meeting } from "../models/index.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export async function saveTranscript(req, res, next) {
  try {
    const { meetingId, transcriptText } = req.body || {};
    if (!meetingId) throw badRequest("meetingId is required");
    if (!transcriptText || !String(transcriptText).trim()) throw badRequest("transcriptText is required");

    const meetingExists = await Meeting.findOne({ where: { id: meetingId }, attributes: ["id"] });
    if (!meetingExists) {
      const err = new Error("Meeting not found");
      err.status = 404;
      throw err;
    }

    const [doc] = await Transcript.upsert({ meetingId, transcriptText: String(transcriptText) }, { returning: true });

    res.status(201).json({
      ok: true,
      transcript: {
        id: doc.id,
        meetingId: doc.meetingId,
        transcriptText: doc.transcriptText,
        createdAt: doc.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
}
