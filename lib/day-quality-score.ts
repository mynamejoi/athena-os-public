export interface DayMetrics {
  recovery?: number | null;
  strain?: number | null;
  sleepPerformance?: number | null;
  sleepHours?: number | null;
  deepSleepMins?: number | null;
  remSleepMins?: number | null;
  lightSleepMins?: number | null;
  awakeSleepMins?: number | null;
  habitCompletionPct: number;
  streakDays: number;
}

export interface DayQualityBreakdown {
  total: number;
  physiological: number | null;
  sleep: number | null;
  behavioral: number;
  strainAlignment: number | null;
  dataCompleteness: number;
}

const BASE_WEIGHTS = {
  physiological: 0.4,
  sleep: 0.25,
  behavioral: 0.25,
  strainAlignment: 0.1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computePhysiological(recovery?: number | null): number | null {
  if (recovery == null) return null;
  return clamp(recovery, 0, 100);
}

function computeSleep(metrics: DayMetrics): number | null {
  const subScores: { score: number; weight: number }[] = [];

  if (metrics.sleepPerformance != null) {
    subScores.push({ score: clamp(metrics.sleepPerformance, 0, 100), weight: 0.6 });
  }

  if (metrics.sleepHours != null) {
    const hoursScore = Math.min(100, (metrics.sleepHours / 8) * 100);
    subScores.push({ score: clamp(hoursScore, 0, 100), weight: 0.2 });
  }

  const hasDeepRem =
    metrics.deepSleepMins != null &&
    metrics.remSleepMins != null &&
    metrics.lightSleepMins != null &&
    metrics.awakeSleepMins != null;

  if (hasDeepRem) {
    const deep = metrics.deepSleepMins!;
    const rem = metrics.remSleepMins!;
    const light = metrics.lightSleepMins!;
    const awake = metrics.awakeSleepMins!;
    const total = deep + rem + light + awake;

    if (total > 0) {
      const deepRemPct = ((deep + rem) / total) * 100;
      const deepRemScore = Math.min(100, (deepRemPct / 40) * 100);
      subScores.push({ score: clamp(deepRemScore, 0, 100), weight: 0.2 });
    }
  }

  if (subScores.length === 0) return null;

  const totalWeight = subScores.reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = subScores.reduce((sum, s) => sum + s.score * (s.weight / totalWeight), 0);
  return clamp(weightedSum, 0, 100);
}

function computeBehavioral(completionPct: number, streakDays: number): number {
  const streakMultiplier = 1 + 0.02 * Math.min(streakDays, 10);
  const cappedMultiplier = Math.min(streakMultiplier, 1.2);
  return clamp(completionPct * cappedMultiplier, 0, 100);
}

function computeStrainAlignment(
  strain?: number | null,
  recovery?: number | null
): number | null {
  if (strain == null || recovery == null) return null;

  let optimalPeak: number;
  if (recovery >= 67) {
    optimalPeak = 14;
  } else if (recovery >= 34) {
    optimalPeak = 8.5;
  } else {
    optimalPeak = 4;
  }

  const scaleFactor = 10;
  const score = 100 - Math.min(100, Math.abs(strain - optimalPeak) * scaleFactor);
  return clamp(score, 0, 100);
}

function computeComposite(scores: {
  physiological: number | null;
  sleep: number | null;
  behavioral: number;
  strainAlignment: number | null;
}): { total: number; dataCompleteness: number } {
  const domains: { key: keyof typeof BASE_WEIGHTS; score: number | null }[] = [
    { key: "physiological", score: scores.physiological },
    { key: "sleep", score: scores.sleep },
    { key: "behavioral", score: scores.behavioral },
    { key: "strainAlignment", score: scores.strainAlignment },
  ];

  const activeDomains = domains.filter((d) => d.score != null);
  const dataCompleteness = activeDomains.length / domains.length;

  if (activeDomains.length === 0) {
    return { total: 0, dataCompleteness: 0 };
  }

  const activeWeightSum = activeDomains.reduce((sum, d) => sum + BASE_WEIGHTS[d.key], 0);
  const total = activeDomains.reduce(
    (sum, d) => sum + d.score! * (BASE_WEIGHTS[d.key] / activeWeightSum),
    0
  );

  return { total: clamp(Math.round(total * 10) / 10, 0, 100), dataCompleteness };
}

export function computeDayQualityScore(metrics: DayMetrics): DayQualityBreakdown {
  const physiological = computePhysiological(metrics.recovery);
  const sleep = computeSleep(metrics);
  const behavioral = computeBehavioral(metrics.habitCompletionPct, metrics.streakDays);
  const strainAlignment = computeStrainAlignment(metrics.strain, metrics.recovery);

  const { total, dataCompleteness } = computeComposite({
    physiological,
    sleep,
    behavioral,
    strainAlignment,
  });

  return { total, physiological, sleep, behavioral, strainAlignment, dataCompleteness };
}

export function computeDayQualityScoreExcluding(
  metrics: DayMetrics,
  _excludeCompleted: boolean
): DayQualityBreakdown {
  return computeDayQualityScore(metrics);
}
