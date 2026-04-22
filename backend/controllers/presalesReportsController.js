import { Op } from "sequelize";
import { Meeting, User, DemoScore, AnalysisReport } from "../models/index.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function normalizeDateRange(fromStr, toStr) {
  if (!fromStr || !toStr) throw badRequest("Query params 'from' and 'to' are required (YYYY-MM-DD).");
  const fromDate = new Date(`${fromStr}T00:00:00.000Z`);
  const toDate = new Date(`${toStr}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw badRequest("Invalid 'from' or 'to' date. Expected YYYY-MM-DD.");
  }
  if (fromDate.getTime() > toDate.getTime()) throw badRequest("'from' must be less than or equal to 'to'.");
  return { fromDate, toDate };
}

export async function getCompletePresalesReport(req, res, next) {
  try {
    const { fromDate, toDate } = normalizeDateRange(req.query.from, req.query.to);
    const { consultantId } = req.query;

    const where = {
      startTime: { [Op.gte]: fromDate, [Op.lte]: toDate },
      teamsMeetingId: { [Op.notLike]: "manual_%" }
    };
    if (consultantId) where.consultantId = consultantId;

    const meetings = await Meeting.findAll({ where, order: [["startTime", "DESC"]] });
    const meetingIds = meetings.map((m) => m.id);
    const consultantIds = [...new Set(meetings.map((m) => m.consultantId).filter(Boolean))];

    const [scores, analyses, users] = await Promise.all([
      DemoScore.findAll({ where: { meetingId: { [Op.in]: meetingIds } } }),
      AnalysisReport.findAll({ where: { meetingId: { [Op.in]: meetingIds } } }),
      User.findAll({ where: { id: { [Op.in]: consultantIds } }, attributes: ["id", "name", "email", "role"] })
    ]);

    const scoreByMeetingId = new Map(scores.map((s) => [s.meetingId, s]));
    const analysisByMeetingId = new Map(analyses.map((a) => [a.meetingId, a]));
    const userById = new Map(users.map((u) => [u.id, u]));

    const byConsultant = new Map();
    for (const m of meetings) {
      const score = scoreByMeetingId.get(m.id);
      const analysis = analysisByMeetingId.get(m.id);
      const cid = m.consultantId;
      const consultant = userById.get(cid);

      if (!byConsultant.has(cid)) {
        byConsultant.set(cid, {
          consultant: consultant ? { id: consultant.id, name: consultant.name, email: consultant.email, role: consultant.role } : null,
          demos: []
        });
      }

      byConsultant.get(cid).demos.push({
        meetingId: m.id,
        title: m.title,
        startTime: m.startTime,
        endTime: m.endTime,
        clientName: analysis?.clientName || "",
        productName: analysis?.productName || "",
        totalScore: typeof score?.totalScore === "number" ? score.totalScore : null,
        sentiment: analysis?.sentiment ?? null,
        communicationScore: typeof score?.communicationScore === "number" ? score.communicationScore : null,
        engagementScore: typeof score?.engagementScore === "number" ? score.engagementScore : null,
        structureScore: typeof score?.structureScore === "number" ? score.structureScore : null,
        technicalScore: typeof score?.technicalScore === "number" ? score.technicalScore : null,
        qaScore: typeof score?.qaScore === "number" ? score.qaScore : null
      });
    }

    const consultants = [];
    let deptScoreSum = 0, deptScoreCount = 0;
    const deptSentimentCounts = { positive: 0, neutral: 0, negative: 0 };

    for (const [, v] of byConsultant.entries()) {
      const scored = v.demos.filter((d) => typeof d.totalScore === "number");
      const avg = scored.length ? Number((scored.reduce((a, b) => a + b.totalScore, 0) / scored.length).toFixed(2)) : null;
      const avgDim = (key) => {
        const vals = scored.map((d) => d[key]).filter((x) => typeof x === "number");
        return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
      };

      const sentimentCounts = {
        positive: scored.filter((d) => d.sentiment === "positive").length,
        neutral: scored.filter((d) => d.sentiment === "neutral").length,
        negative: scored.filter((d) => d.sentiment === "negative").length
      };

      consultants.push({
        consultant: v.consultant,
        totalDemos: scored.length,
        averageScore: avg,
        dimensionAverages: {
          communicationScore: avgDim("communicationScore"),
          engagementScore: avgDim("engagementScore"),
          structureScore: avgDim("structureScore"),
          technicalScore: avgDim("technicalScore"),
          qaScore: avgDim("qaScore")
        },
        sentimentCounts,
        demos: scored.slice().sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
      });

      for (const d of scored) {
        deptScoreSum += d.totalScore;
        deptScoreCount++;
        if (d.sentiment && deptSentimentCounts[d.sentiment] != null) deptSentimentCounts[d.sentiment]++;
      }
    }

    consultants.sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1));

    res.json({
      ok: true,
      window: { from: req.query.from, to: req.query.to },
      department: {
        totalDemos: deptScoreCount,
        averageScore: deptScoreCount ? Number((deptScoreSum / deptScoreCount).toFixed(2)) : null,
        sentimentCounts: deptSentimentCounts
      },
      consultants
    });
  } catch (err) {
    next(err);
  }
}
