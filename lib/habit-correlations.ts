import { subDays, differenceInDays, format, parseISO, getDay, getISOWeek, getISOWeekYear, addDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { computeDayQualityScore, type DayMetrics } from '@/lib/day-quality-score'

export interface FrequencyBucket {
  daysPerWeek: number
  avgDayScore: number
  weekCount: number
}

export interface HabitInsight {
  habitId: string
  habitTitle: string
  habitIcon: string
  category: 'good' | 'bad'
  avgScoreCompleted: number | null
  avgScoreSkipped: number | null
  impactScore: number
  avgRecoveryAfterCompleted: number | null
  avgRecoveryAfterSkipped: number | null
  recoveryImpact: number
  currentFrequency: number[] | null
  completionRate: number
  optimalDaysPerWeek: number | null
  frequencyAnalysis: FrequencyBucket[]
  streakEffect: { avgScoreNoStreak: number | null; avgScoreOnStreak: number | null }
  sampleSize: number
}

export interface CorrelationResult {
  insights: HabitInsight[]
  periodDays: number
  dataQuality: 'insufficient' | 'limited' | 'good' | 'excellent'
}

interface Habit {
  id: string
  title: string
  category: string
  frequency: number[] | null
  icon: string
}

interface DailyTask {
  date: string
  title: string
  status: string
  source_habit_id: string | null
  is_one_off: boolean
}

interface WhoopRow {
  date: string
  recovery_score: number | null
  strain: number | null
  sleep_performance: number | null
  sleep_hours: number | null
  sleep_stage_deep_minutes: number | null
  sleep_stage_rem_minutes: number | null
  sleep_stage_light_minutes: number | null
  sleep_stage_awake_minutes: number | null
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function weekKey(date: Date): string {
  return `${getISOWeekYear(date)}-W${getISOWeek(date)}`
}

function sundayBasedDay(dateStr: string): number {
  return getDay(parseISO(dateStr))
}

function isScheduledOn(frequency: number[] | null, dateStr: string): boolean {
  if (!frequency || frequency.length === 0) return true
  return frequency.includes(sundayBasedDay(dateStr))
}

export async function analyzeHabitCorrelations(
  range?: { start: string; end: string }
): Promise<CorrelationResult> {
  const endDate = range ? parseISO(range.end) : new Date()
  const startDate = range ? parseISO(range.start) : subDays(endDate, 90)
  const startStr = format(startDate, 'yyyy-MM-dd')
  const endStr = format(endDate, 'yyyy-MM-dd')

  const [habitsRes, tasksRes, whoopRes] = await Promise.all([
    supabase
      .from('today_habits')
      .select('id, title, category, frequency, icon'),
    supabase
      .from('daily_tasks')
      .select('date, title, status, source_habit_id, is_one_off')
      .eq('is_one_off', false)
      .gte('date', startStr)
      .lte('date', endStr),
    supabase
      .from('whoop_data')
      .select('date, recovery_score, strain, sleep_performance, sleep_hours, sleep_stage_deep_minutes, sleep_stage_rem_minutes, sleep_stage_light_minutes, sleep_stage_awake_minutes')
      .gte('date', startStr)
      .lte('date', format(addDays(endDate, 1), 'yyyy-MM-dd')),
  ])

  const habits: Habit[] = habitsRes.data || []
  const tasks: DailyTask[] = tasksRes.data || []
  const whoopRows: WhoopRow[] = whoopRes.data || []

  // WHOOP metrics by date
  const whoopByDate = new Map<string, WhoopRow>()
  for (const w of whoopRows) {
    whoopByDate.set(w.date, w)
  }

  // Per-date task counts
  const totalTasksByDate = new Map<string, number>()
  const completedTasksByDate = new Map<string, number>()
  const completedByHabitAndDate = new Map<string, Set<string>>()

  for (const t of tasks) {
    totalTasksByDate.set(t.date, (totalTasksByDate.get(t.date) || 0) + 1)
    if (t.status === 'Completed') {
      completedTasksByDate.set(t.date, (completedTasksByDate.get(t.date) || 0) + 1)
      if (t.source_habit_id) {
        if (!completedByHabitAndDate.has(t.source_habit_id)) {
          completedByHabitAndDate.set(t.source_habit_id, new Set())
        }
        completedByHabitAndDate.get(t.source_habit_id)!.add(t.date)
      }
    }
  }

  const allDates: string[] = []
  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    allDates.push(format(d, 'yyyy-MM-dd'))
  }

  // Compute completion streak per date (consecutive days with >70% completion)
  const streakByDate = new Map<string, number>()
  let currentStreak = 0
  for (const d of allDates) {
    const total = totalTasksByDate.get(d) || 0
    const completed = completedTasksByDate.get(d) || 0
    const pct = total > 0 ? (completed / total) * 100 : 0
    if (pct >= 70) {
      currentStreak++
    } else {
      currentStreak = 0
    }
    streakByDate.set(d, currentStreak)
  }

  // Compute composite Day Quality Score per date
  function dayQualityForDate(date: string, excludeHabitId?: string, wasCompleted?: boolean): number | null {
    const total = totalTasksByDate.get(date) || 0
    const completed = completedTasksByDate.get(date) || 0

    let habitPct: number
    if (excludeHabitId !== undefined) {
      const otherTotal = total - 1
      const otherCompleted = wasCompleted ? completed - 1 : completed
      if (otherTotal <= 0) return null
      habitPct = (otherCompleted / otherTotal) * 100
    } else {
      if (total <= 0) return null
      habitPct = (completed / total) * 100
    }

    const whoop = whoopByDate.get(date)
    const streak = streakByDate.get(date) || 0

    const metrics: DayMetrics = {
      recovery: whoop?.recovery_score,
      strain: whoop?.strain,
      sleepPerformance: whoop?.sleep_performance,
      sleepHours: whoop?.sleep_hours,
      deepSleepMins: whoop?.sleep_stage_deep_minutes,
      remSleepMins: whoop?.sleep_stage_rem_minutes,
      lightSleepMins: whoop?.sleep_stage_light_minutes,
      awakeSleepMins: whoop?.sleep_stage_awake_minutes,
      habitCompletionPct: habitPct,
      streakDays: streak,
    }

    return computeDayQualityScore(metrics).total
  }

  const daysWithData = allDates.filter(d => (totalTasksByDate.get(d) || 0) > 0 || whoopByDate.has(d)).length

  const insights: HabitInsight[] = habits.map(habit => {
    const completedDates = completedByHabitAndDate.get(habit.id) || new Set<string>()

    const scheduledDates = allDates.filter(d => isScheduledOn(habit.frequency, d))
    const completedOnScheduled = scheduledDates.filter(d => completedDates.has(d))
    const skippedOnScheduled = scheduledDates.filter(d => !completedDates.has(d))

    // Composite Day Quality Score excluding this habit
    const scoresCompleted = completedOnScheduled
      .map(d => dayQualityForDate(d, habit.id, true))
      .filter((v): v is number => v != null)
    const scoresSkipped = skippedOnScheduled
      .map(d => dayQualityForDate(d, habit.id, false))
      .filter((v): v is number => v != null)

    const avgScoreCompleted = avg(scoresCompleted)
    const avgScoreSkipped = avg(scoresSkipped)
    const impactScore = (avgScoreCompleted ?? 0) - (avgScoreSkipped ?? 0)

    // Next-day recovery impact
    const recoveryCompleted = completedOnScheduled
      .map(d => whoopByDate.get(format(addDays(parseISO(d), 1), 'yyyy-MM-dd'))?.recovery_score)
      .filter((v): v is number => v != null)
    const recoverySkipped = skippedOnScheduled
      .map(d => whoopByDate.get(format(addDays(parseISO(d), 1), 'yyyy-MM-dd'))?.recovery_score)
      .filter((v): v is number => v != null)

    const avgRecoveryAfterCompleted = avg(recoveryCompleted)
    const avgRecoveryAfterSkipped = avg(recoverySkipped)
    const recoveryImpact = (avgRecoveryAfterCompleted ?? 0) - (avgRecoveryAfterSkipped ?? 0)

    const completionRate = scheduledDates.length > 0
      ? (completedOnScheduled.length / scheduledDates.length) * 100
      : 0

    // Frequency analysis using composite score
    const weekCompletions = new Map<string, number>()
    const weekDayScores = new Map<string, number[]>()

    for (const d of allDates) {
      const wk = weekKey(parseISO(d))
      if (!weekCompletions.has(wk)) weekCompletions.set(wk, 0)
      if (completedDates.has(d)) {
        weekCompletions.set(wk, weekCompletions.get(wk)! + 1)
      }
      const score = dayQualityForDate(d)
      if (score != null) {
        if (!weekDayScores.has(wk)) weekDayScores.set(wk, [])
        weekDayScores.get(wk)!.push(score)
      }
    }

    const bucketScores = new Map<number, { totalScore: number; totalDays: number; weekCount: number }>()
    for (const [wk, count] of weekCompletions) {
      const scores = weekDayScores.get(wk)
      if (!scores || scores.length === 0) continue
      if (!bucketScores.has(count)) bucketScores.set(count, { totalScore: 0, totalDays: 0, weekCount: 0 })
      const bucket = bucketScores.get(count)!
      bucket.totalScore += scores.reduce((a, b) => a + b, 0)
      bucket.totalDays += scores.length
      bucket.weekCount += 1
    }

    const frequencyAnalysis: FrequencyBucket[] = Array.from(bucketScores.entries())
      .map(([daysPerWeek, b]) => ({
        daysPerWeek,
        avgDayScore: b.totalScore / b.totalDays,
        weekCount: b.weekCount,
      }))
      .sort((a, b) => a.daysPerWeek - b.daysPerWeek)

    let optimalDaysPerWeek: number | null = null
    if (frequencyAnalysis.length > 0) {
      const eligible = frequencyAnalysis.filter(b => b.weekCount >= 2 && b.daysPerWeek >= 1)
      if (eligible.length > 0) {
        optimalDaysPerWeek = eligible.reduce((best, b) =>
          b.avgDayScore > best.avgDayScore ? b : best
        ).daysPerWeek
      }
    }

    // Streak effect using composite score
    const sortedCompletedDates = Array.from(completedDates).sort()
    const streakDaysSet = new Set<string>()
    let runStart = 0
    for (let i = 1; i <= sortedCompletedDates.length; i++) {
      const isConsecutive = i < sortedCompletedDates.length &&
        format(addDays(parseISO(sortedCompletedDates[i - 1]), 1), 'yyyy-MM-dd') === sortedCompletedDates[i]
      if (!isConsecutive) {
        const runLength = i - runStart
        if (runLength >= 3) {
          for (let j = runStart; j < i; j++) {
            streakDaysSet.add(sortedCompletedDates[j])
          }
        }
        runStart = i
      }
    }

    const streakScores = Array.from(streakDaysSet)
      .map(d => dayQualityForDate(d))
      .filter((v): v is number => v != null)
    const nonStreakCompletedDates = completedOnScheduled.filter(d => !streakDaysSet.has(d))
    const nonStreakScores = nonStreakCompletedDates
      .map(d => dayQualityForDate(d))
      .filter((v): v is number => v != null)

    return {
      habitId: habit.id,
      habitTitle: habit.title,
      habitIcon: habit.icon || '',
      category: (habit.category === 'bad' ? 'bad' : 'good') as 'good' | 'bad',
      avgScoreCompleted,
      avgScoreSkipped,
      impactScore,
      avgRecoveryAfterCompleted,
      avgRecoveryAfterSkipped,
      recoveryImpact,
      currentFrequency: habit.frequency,
      completionRate,
      optimalDaysPerWeek,
      frequencyAnalysis,
      streakEffect: {
        avgScoreNoStreak: avg(nonStreakScores),
        avgScoreOnStreak: avg(streakScores),
      },
      sampleSize: scheduledDates.length,
    }
  })

  insights.sort((a, b) => b.impactScore - a.impactScore)

  let dataQuality: CorrelationResult['dataQuality']
  if (daysWithData < 14) dataQuality = 'insufficient'
  else if (daysWithData < 30) dataQuality = 'limited'
  else if (daysWithData < 60) dataQuality = 'good'
  else dataQuality = 'excellent'

  return { insights, periodDays: differenceInDays(endDate, startDate) + 1, dataQuality }
}
