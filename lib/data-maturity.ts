export interface DataMaturity {
  totalDays: number
  whoopDays: number
  habitDays: number
  workoutDays: number
  firstDataDate: string | null
  hasWhoop: boolean
}

export const FEATURE_THRESHOLDS = {
  morningBriefing: { totalDays: 1, label: 'Morning Briefing', description: 'AI-generated daily summary of your recovery, habits, and training plan' },
  weekStats: { totalDays: 3, label: 'Week Stats & Deltas', description: 'Prior-week comparisons showing improvement trends' },
  weeklyBriefing: { totalDays: 8, label: 'Weekly Report', description: 'Weekly review of health, habits, training, and projects' },
  monthHighlights: { totalDays: 8, label: 'Month Highlights', description: 'Best day, top streaks, and peak performance metrics' },
  yearHighlights: { totalDays: 30, label: 'Year Highlights', description: 'Yearly performance highlights and streak records' },
  monthlyBriefing: { totalDays: 32, label: 'Monthly Report', description: 'Monthly narrative with patterns, goals, and best/worst days' },
  yearlyBriefing: { totalDays: 90, label: 'Yearly Report', description: 'Yearly narrative with long-term patterns and milestones' },
  habitInsights: { totalDays: 14, label: 'Habit Insights', description: 'AI analysis of which habits impact your day quality most' },
  habitInsightsAI: { totalDays: 30, label: 'AI Habit Recommendations', description: 'Personalized AI suggestions for habit optimization' },
  trendLines: { totalDays: 7, label: 'Trend Lines', description: 'Visual trend lines for biometric and habit data' },
  coachNotes: { totalDays: 1, label: 'AI Coach Notes', description: 'AI workout prescriptions with exercises, sets, reps, and weights' },
  // WHOOP-specific analytics thresholds
  vitalsBaseline: { totalDays: 14, label: 'Vitals Baseline', description: 'Baseline biometric averages for comparison' },
  biomarkerSparklines: { totalDays: 7, label: 'Biomarker Sparklines', description: 'Inline sparkline charts for biometric trends' },
  acwr: { totalDays: 28, label: 'Acute:Chronic Workload Ratio', description: 'Training load balance indicator' },
  sleepArchitecture: { totalDays: 7, label: 'Sleep Architecture', description: 'Breakdown of sleep stages and patterns' },
  sleepConsistency: { totalDays: 14, label: 'Sleep Consistency', description: 'Sleep schedule regularity analysis' },
  correlationScatter: { totalDays: 14, label: 'Correlation Scatter', description: 'How biometrics correlate with performance' },
  bodyRadar: { totalDays: 30, label: 'Body Radar', description: 'Multi-axis body readiness visualization' },
  monthlyScorecard: { totalDays: 60, label: 'Monthly Scorecard', description: 'Comprehensive monthly performance scorecard' },
  periodization: { totalDays: 60, label: 'Periodization', description: 'Training periodization cycle analysis' },
  workoutDonut: { totalDays: 14, label: 'Workout Distribution', description: 'Workout type distribution chart' },
} as const

export type FeatureKey = keyof typeof FEATURE_THRESHOLDS

const WHOOP_FEATURES: FeatureKey[] = [
  'vitalsBaseline', 'biomarkerSparklines', 'trendLines', 'acwr',
  'sleepArchitecture', 'sleepConsistency', 'correlationScatter',
  'bodyRadar', 'periodization',
]

export function isFeatureUnlocked(maturity: DataMaturity, feature: FeatureKey): boolean {
  const threshold = FEATURE_THRESHOLDS[feature].totalDays
  const relevantDays = WHOOP_FEATURES.includes(feature) ? maturity.whoopDays : maturity.totalDays
  return relevantDays >= threshold
}

export function daysUntilUnlock(maturity: DataMaturity, feature: FeatureKey): number {
  const threshold = FEATURE_THRESHOLDS[feature].totalDays
  const relevantDays = WHOOP_FEATURES.includes(feature) ? maturity.whoopDays : maturity.totalDays
  return Math.max(0, threshold - relevantDays)
}

export async function fetchDataMaturity(): Promise<DataMaturity> {
  const res = await fetch('/api/productivity/data-maturity')
  if (!res.ok) throw new Error('Failed to fetch data maturity')
  return res.json()
}
