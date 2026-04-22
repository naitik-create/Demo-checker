import { Op } from "sequelize";
import { Meeting, AnalysisReport, DemoScore, User } from "../models/index.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export async function listManualScriptReports(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);

    const where = { teamsMeetingId: { [Op.like]: "manual_%" } };
    if (req.user?.role === "consultant") {
      where.consultantId = req.user.id;
    } else if (req.query.consultantId) {
      where.consultantId = req.query.consultantId;
    }

    const meetings = await Meeting.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      include: [{ model: User, as: "consultant", attributes: ["id", "name", "email", "role"] }]
    });

    const meetingIds = meetings.map((m) => m.id);
    const [reports, scores] = await Promise.all([
      AnalysisReport.findAll({ where: { meetingId: { [Op.in]: meetingIds } } }),
      DemoScore.findAll({ where: { meetingId: { [Op.in]: meetingIds } } })
    ]);

    const reportByMeetingId = new Map(reports.map((r) => [r.meetingId, r]));
    const scoreByMeetingId = new Map(scores.map((s) => [s.meetingId, s]));

    res.json({
      ok: true,
      reports: meetings.map((m) => {
        const r = reportByMeetingId.get(m.id);
        const s = scoreByMeetingId.get(m.id);
        return {
          meetingId: m.id,
          title: m.title,
          createdAt: m.createdAt,
          consultant: m.consultant
            ? { id: m.consultant.id, name: m.consultant.name, email: m.consultant.email, role: m.consultant.role }
            : null,
          clientName: r?.clientName || "",
          summary: r?.summary || "",
          sentiment: r?.sentiment || "neutral",
          questionsCount: r?.questionsCount || 0,
          totalScore: typeof s?.totalScore === "number" ? s.totalScore : null
        };
      })
    });
  } catch (err) {
    next(err);
  }
}
