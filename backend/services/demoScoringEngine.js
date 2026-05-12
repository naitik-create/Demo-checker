// Max per dimension: Discovery=30, Rapport=40, Demo=70, Objections=50, Engagement=55, Close=45 → Total=290
export function calculateDemoScores({
  discoveryScore,
  rapportScore,
  demoScore,
  objectionsScore,
  engagementScore,
  closeScore,
  riskDeduction
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
  const totalScore = Math.max(0, Math.min(100, Math.round((adjusted / 290) * 100)));

  return { ...scores, weightedTotal, totalScore };
}

