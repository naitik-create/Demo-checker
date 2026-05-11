import { sequelize } from "../config/sequelize.js";
import { User } from "../models/index.js";
import { QueryTypes } from "sequelize";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function forbidden(message = "Forbidden") {
  const err = new Error(message);
  err.status = 403;
  return err;
}

export async function consultantPerformance(req, res, next) {
  try {
    const { consultantId } = req.params;
    if (!consultantId) throw badRequest("consultantId is required");

    if (req.user?.role === "consultant" && req.user.id !== consultantId) throw forbidden();

    const consultant = await User.findOne({ where: { id: consultantId }, attributes: ["id", "name", "email", "role"] });
    if (!consultant) {
      const err = new Error("Consultant not found");
      err.status = 404;
      throw err;
    }

    const overallRows = await sequelize.query(
      `SELECT
        COUNT(m.id)::int AS "totalDemos",
        AVG(ds."totalScore") AS "averageScore",
        MAX(ds."totalScore") AS "bestDemoScore",
        MIN(ds."totalScore") AS "worstDemoScore",
        AVG(ds."discoveryScore") AS "discoveryAvg",
        AVG(ds."rapportScore") AS "rapportAvg",
        AVG(ds."demoScore") AS "demoAvg",
        AVG(ds."objectionsScore") AS "objectionsAvg",
        AVG(ds."engagementScore") AS "engagementAvg",
        AVG(ds."closeScore") AS "closeAvg",
        AVG(ds."riskDeduction") AS "riskAvg",
        AVG(CASE ar.sentiment WHEN 'positive' THEN 10 WHEN 'negative' THEN 4 WHEN 'neutral' THEN 7 ELSE NULL END) AS "sentimentAvg",
        SUM(CASE WHEN ar.sentiment = 'positive' THEN 1 ELSE 0 END)::int AS "sentimentPositiveCount",
        SUM(CASE WHEN ar.sentiment = 'neutral' THEN 1 ELSE 0 END)::int AS "sentimentNeutralCount",
        SUM(CASE WHEN ar.sentiment = 'negative' THEN 1 ELSE 0 END)::int AS "sentimentNegativeCount"
      FROM meetings m
      LEFT JOIN demo_scores ds ON ds."meetingId" = m.id
      LEFT JOIN analysis_reports ar ON ar."meetingId" = m.id
      WHERE m."consultantId" = :consultantId`,
      { replacements: { consultantId }, type: QueryTypes.SELECT }
    );

    const monthlyRows = await sequelize.query(
      `SELECT
        TO_CHAR(m."startTime", 'YYYY-MM') AS month,
        COUNT(m.id)::int AS "totalDemos",
        AVG(ds."totalScore") AS "averageScore",
        MAX(ds."totalScore") AS "bestDemoScore",
        MIN(ds."totalScore") AS "worstDemoScore"
      FROM meetings m
      LEFT JOIN demo_scores ds ON ds."meetingId" = m.id
      WHERE m."consultantId" = :consultantId
      GROUP BY TO_CHAR(m."startTime", 'YYYY-MM')
      ORDER BY month ASC`,
      { replacements: { consultantId }, type: QueryTypes.SELECT }
    );

    const overall = overallRows[0] || {};

    res.json({
      ok: true,
      consultant: { id: consultant.id, name: consultant.name, email: consultant.email, role: consultant.role },
      metrics: {
        totalDemos: overall.totalDemos || 0,
        averageScore: overall.averageScore != null ? Number(overall.averageScore) : null,
        bestDemoScore: overall.bestDemoScore != null ? Number(overall.bestDemoScore) : null,
        worstDemoScore: overall.worstDemoScore != null ? Number(overall.worstDemoScore) : null,
        discoveryAvg: overall.discoveryAvg != null ? Number(overall.discoveryAvg) : null,
        rapportAvg: overall.rapportAvg != null ? Number(overall.rapportAvg) : null,
        demoAvg: overall.demoAvg != null ? Number(overall.demoAvg) : null,
        objectionsAvg: overall.objectionsAvg != null ? Number(overall.objectionsAvg) : null,
        engagementAvg: overall.engagementAvg != null ? Number(overall.engagementAvg) : null,
        closeAvg: overall.closeAvg != null ? Number(overall.closeAvg) : null,
        riskAvg: overall.riskAvg != null ? Number(overall.riskAvg) : null,
        sentimentAvg: overall.sentimentAvg != null ? Number(overall.sentimentAvg) : null,
        sentimentCounts: {
          positive: overall.sentimentPositiveCount ?? 0,
          neutral: overall.sentimentNeutralCount ?? 0,
          negative: overall.sentimentNegativeCount ?? 0
        }
      },
      monthlyPerformance: monthlyRows.map((r) => ({
        month: r.month,
        totalDemos: r.totalDemos,
        averageScore: r.averageScore != null ? Number(r.averageScore) : null,
        bestDemoScore: r.bestDemoScore != null ? Number(r.bestDemoScore) : null,
        worstDemoScore: r.worstDemoScore != null ? Number(r.worstDemoScore) : null
      }))
    });
  } catch (err) {
    next(err);
  }
}

export async function leaderboard(req, res, next) {
  try {
    if (!["manager", "admin"].includes(req.user?.role)) throw forbidden();

    const limit = Math.min(Number(req.query.limit || 10), 50);
    const months = Math.min(Number(req.query.months || 6), 24);

    const rows = await sequelize.query(
      `SELECT
        u.id AS "consultantId",
        u.name AS "consultantName",
        u.email AS "consultantEmail",
        u.role AS "consultantRole",
        COUNT(m.id)::int AS "totalDemos",
        AVG(ds."totalScore") AS "averageScore",
        MAX(ds."totalScore") AS "bestDemoScore",
        MIN(ds."totalScore") AS "worstDemoScore"
      FROM meetings m
      INNER JOIN demo_scores ds ON ds."meetingId" = m.id
      INNER JOIN users u ON u.id = m."consultantId"
      WHERE m."startTime" >= NOW() - INTERVAL '1 month' * :months
        AND m."teamsMeetingId" NOT LIKE 'manual_%'
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY "averageScore" DESC NULLS LAST, "totalDemos" DESC
      LIMIT :limit`,
      { replacements: { months, limit }, type: QueryTypes.SELECT }
    );

    res.json({
      ok: true,
      windowMonths: months,
      leaderboard: rows.map((r) => ({
        consultant: { id: r.consultantId, name: r.consultantName, email: r.consultantEmail, role: r.consultantRole },
        totalDemos: r.totalDemos,
        averageScore: r.averageScore != null ? Number(r.averageScore) : null,
        bestDemoScore: r.bestDemoScore != null ? Number(r.bestDemoScore) : null,
        worstDemoScore: r.worstDemoScore != null ? Number(r.worstDemoScore) : null
      }))
    });
  } catch (err) {
    next(err);
  }
}
