export function calculateDemoScores({
  communicationScore,
  engagementScore,
  structureScore,
  technicalScore,
  qaScore
}) {
  const scores = {
    communicationScore: Number(communicationScore),
    engagementScore: Number(engagementScore),
    structureScore: Number(structureScore),
    technicalScore: Number(technicalScore),
    qaScore: Number(qaScore)
  };

  for (const [k, v] of Object.entries(scores)) {
    if (!Number.isFinite(v)) {
      const err = new Error(`${k} must be a number`);
      err.status = 400;
      throw err;
    }
    if (v < 0 || v > 20) {
      const err = new Error(`${k} must be between 0 and 20`);
      err.status = 400;
      throw err;
    }
  }

  const totalScore =
    scores.communicationScore +
    scores.engagementScore +
    scores.structureScore +
    scores.technicalScore +
    scores.qaScore;

  return { ...scores, totalScore };
}

