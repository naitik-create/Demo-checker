// Max per dimension: Discovery=75, Rapport=70, Demo=85, Objections=70, Engagement=80, Close=65 → Total=445
// Matches frontend demoKpiFramework.js exactly (23 KPIs, same weights)
// Sentiment multiplier: positive=×1.10, neutral=×1.00
// All questions answered bonus: ×1.05
const SENTIMENT_MULTIPLIER = { positive: 1.10, neutral: 1.00, negative: 1.00 };

export function calculateDemoScores({
  discoveryScore,
  rapportScore,
  demoScore,
  objectionsScore,
  engagementScore,
  closeScore,
  riskDeduction,
  sentiment = "neutral",
  allQuestionsAnswered = false
}) {
  const scores = {
    discoveryScore: Number(discoveryScore || 0),
    rapportScore: Number(rapportScore || 0),
    demoScore: Number(demoScore || 0),
    objectionsScore: Number(objectionsScore || 0),
    engagementScore: Number(engagementScore || 0),
    closeScore: Number(closeScore || 0),
    riskDeduction: Number(riskDeduction || 0)
  };

  const weightedTotal =
    scores.discoveryScore +
    scores.rapportScore +
    scores.demoScore +
    scores.objectionsScore +
    scores.engagementScore +
    scores.closeScore;

  const adjusted = weightedTotal - scores.riskDeduction;
  const sentimentMultiplier = SENTIMENT_MULTIPLIER[String(sentiment).toLowerCase()] ?? 1.00;
  const questionsMultiplier = allQuestionsAnswered ? 1.05 : 1.00;
  const totalScore = Math.max(0, Math.min(100, Math.round((adjusted / 445) * 100 * sentimentMultiplier * questionsMultiplier)));

  return { ...scores, weightedTotal, totalScore };
}

