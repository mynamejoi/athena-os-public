import { SupabaseClient } from '@supabase/supabase-js';
import { SINGLE_USER_ID } from '@/lib/constants';
import { toETDateString, getETDayOfWeek } from '@/lib/date-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReportCadence = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface HabitDayDetail {
    date: string;
    dayOfWeek: string;
    completed: number;
    total: number;
    completionRate: number;
    missed: string[];
    completedHabits: string[];
}

export interface BiometricSummary {
    recovery: { values: (number | null)[]; avg: number | null; };
    sleep: { values: (number | null)[]; avg: number | null; };
    strain: { values: (number | null)[]; avg: number | null; };
    hrv: { values: (number | null)[]; avg: number | null; };
    rhr: { values: (number | null)[]; avg: number | null; };
    sleepHours: { values: (number | null)[]; avg: number | null; };
}

export interface StreakInfo {
    habit: string;
    current: number;
    previousStreak: number;
}

export interface WorkoutSummary {
    date: string;
    sport: string;
    strain: number | null;
    calories: number | null;
    durationMinutes: number | null;
}

export interface GoalProgress {
    id: string;
    title: string;
    status: string;
    progress: number | null;
    targetDate: string | null;
}

export interface ReportDataPayload {
    cadence: ReportCadence;
    periodStart: string;
    periodEnd: string;
    priorPeriodStart: string;
    priorPeriodEnd: string;

    // Habits
    habitDays: HabitDayDetail[];
    habitOverallRate: number | null;
    habitStreaks: StreakInfo[];

    // Biometrics
    biometrics: BiometricSummary;
    priorBiometrics: BiometricSummary;

    // Daily summaries
    dailySummaries: Array<{
        date: string;
        dayPercentage: number | null;
        win: string | null;
        journal: string | null;
    }>;

    // Workouts
    workouts: WorkoutSummary[];
    workoutExercises: Array<{
        date: string;
        exercise: string;
        sets: number | null;
        reps: number | null;
        weight: number | null;
    }> | null;

    // Coach notes (weekly+)
    coachNotes: Array<{
        date: string;
        note: string;
    }> | null;

    // Goals & projects (monthly+)
    goals: GoalProgress[] | null;
    projects: Array<{
        id: string;
        title: string;
        status: string;
        progress: number | null;
    }> | null;
    tasks: Array<{
        title: string;
        status: string;
        projectTitle: string | null;
    }> | null;

    // Books
    books: Array<{
        title: string;
        author: string | null;
        status: string;
        rating: number | null;
        dateFinished: string | null;
        currentPage: number | null;
        totalPages: number | null;
    }>;

    // Yearly extras
    yearlyGoals: Array<{
        id: string;
        title: string;
        status: string;
        progress: number | null;
    }> | null;
    memories: Array<{
        date: string;
        content: string;
        tags: string[] | null;
    }> | null;

    // Habit configs (for labeling)
    habitConfigs: Array<{
        title: string;
        emoji: string | null;
    }>;

    // Analytics-derived insights (daily: HRV only; weekly: all; monthly: all except coachCompliance)
    analyticsInsights: {
        hrvTrend: { current3d: number | null; avg7d: number | null; direction: 'rising' | 'stable' | 'falling' } | null;
        rhrTrend: { currentAvg: number | null; priorAvg: number | null; changePercent: number | null } | null;
        sleepStages: { deepPctChange: number | null; remPctChange: number | null; note: string | null } | null;
        bedtimeConsistency: { stdDevHours: number | null; priorStdDevHours: number | null; note: string | null } | null;
        behaviorCorrelations: { behavior: string; withRecovery: number; withoutRecovery: number; delta: number }[] | null;
        coachCompliance: { completed: number; missed: number; total: number; pct: number } | null;
    } | null;

    // This week's workout plan (for weekly reports)
    thisWeekPlan?: Record<string, string> | null;

    // Monthly goals with measurable targets (monthly+)
    monthlyGoals: Array<{
        title: string;
        category: string | null;
        current: number | null;
        target: number | null;
        unit: string | null;
        linkedMetric: string | null;
    }> | null;

    // Project velocity & deadlines (weekly+)
    projectVelocity: Array<{
        name: string;
        tasksCompleted: number;
        totalTasks: number;
        velocity: number;
        deadline: string | null;
        daysRemaining: number | null;
    }> | null;

    // Exercise PRs (weekly+)
    exercisePRs: Array<{
        exercise: string;
        newMax: number;
        previousMax: number;
    }> | null;

    // Day-of-week recovery patterns (monthly+)
    dayOfWeekPatterns: Array<{
        day: string;
        avgRecovery: number;
    }> | null;

    // Workout split counts (monthly+)
    workoutSplitCounts: Record<string, number> | null;

    // Daily morning briefing extras
    todayContext?: {
        todayDate: string;
        todayDayOfWeek: string;
        // Today's WHOOP data (this morning's recovery, last night's sleep)
        todayRecovery: number | null;
        todaySleepScore: number | null;
        todaySleepHours: number | null;
        todayHrv: number | null;
        todayRhr: number | null;
        todayStrain: number | null;
        // Sleep stage percentages
        todayDeepPct: number | null;
        todayRemPct: number | null;
        // Context
        activeProjects: Array<{ name: string; tasksDone: number; tasksTotal: number; deadline: string | null }>;
        upcomingTasks: Array<{ title: string; projectName: string | null; status: string; priority: string | null }>;
        todayHabits: string[];
        plannedWorkout: string | null;
        weekWorkoutPlan: Record<string, string> | null;
        todayCoachAdvice: string | null;
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function dayOfWeek(dateStr: string): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[new Date(dateStr + 'T00:00:00').getDay()];
}

function safeAvg(values: (number | null)[]): number | null {
    const nums = values.filter((v): v is number => v != null && !isNaN(v));
    if (nums.length === 0) return null;
    return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10;
}

function computePriorPeriod(cadence: ReportCadence, periodStart: string, periodEnd: string): { start: string; end: string } {
    const s = new Date(periodStart + 'T00:00:00');
    const e = new Date(periodEnd + 'T00:00:00');
    const durationMs = e.getTime() - s.getTime();

    const priorEnd = new Date(s.getTime() - 86400000); // day before period start
    const priorStart = new Date(priorEnd.getTime() - durationMs);

    return { start: formatDate(priorStart), end: formatDate(priorEnd) };
}

function buildBiometricSummary(whoopRows: any[]): BiometricSummary {
    return {
        recovery: {
            values: whoopRows.map(w => w.recovery_score ?? null),
            avg: safeAvg(whoopRows.map(w => w.recovery_score)),
        },
        sleep: {
            values: whoopRows.map(w => w.sleep_performance ?? null),
            avg: safeAvg(whoopRows.map(w => w.sleep_performance)),
        },
        strain: {
            values: whoopRows.map(w => w.strain ?? null),
            avg: safeAvg(whoopRows.map(w => w.strain)),
        },
        hrv: {
            values: whoopRows.map(w => w.hrv ?? null),
            avg: safeAvg(whoopRows.map(w => w.hrv)),
        },
        rhr: {
            values: whoopRows.map(w => w.resting_hr ?? null),
            avg: safeAvg(whoopRows.map(w => w.resting_hr)),
        },
        sleepHours: {
            values: whoopRows.map(w => w.sleep_hours ?? null),
            avg: safeAvg(whoopRows.map(w => w.sleep_hours)),
        },
    };
}

type Schedule = { type: 'frequency'; days: number[] | null } | { type: 'dates'; dates: Set<string> };

function isScheduledDay(schedule: Schedule, date: Date): boolean {
    if (schedule.type === 'dates') {
        return schedule.dates.has(formatDate(date));
    }
    if (!schedule.days) return true;
    return schedule.days.includes(date.getDay());
}

function hasScheduledMissedDayBetween(
    schedule: Schedule,
    fromStr: string,
    toStr: string,
    completedDates: Set<string>
): boolean {
    const from = new Date(fromStr + 'T00:00:00');
    const to = new Date(toStr + 'T00:00:00');
    const check = new Date(from);
    check.setDate(check.getDate() + 1);
    while (check < to) {
        if (isScheduledDay(schedule, check) && !completedDates.has(formatDate(check))) {
            return true;
        }
        check.setDate(check.getDate() + 1);
    }
    return false;
}

function computeStreaks(
    tasks: Array<{ title: string; date: string; status: string; is_one_off: boolean }>,
    habitSchedules?: Record<string, Schedule>
): StreakInfo[] {
    // Group completed, non-one-off tasks by habit title
    const habitDates: Record<string, Set<string>> = {};
    for (const row of tasks) {
        if (row.status !== 'Completed' || row.is_one_off) continue;
        if (!habitDates[row.title]) habitDates[row.title] = new Set();
        habitDates[row.title].add(row.date);
    }

    // For tasks without a schedule entry, build date-based schedule from all task occurrences
    if (habitSchedules) {
        const allTaskDates: Record<string, Set<string>> = {};
        for (const row of tasks) {
            if (row.is_one_off) continue;
            if (!allTaskDates[row.title]) allTaskDates[row.title] = new Set();
            allTaskDates[row.title].add(row.date);
        }
        for (const title of Object.keys(habitDates)) {
            if (!(title in habitSchedules) && allTaskDates[title]) {
                habitSchedules[title] = { type: 'dates', dates: allTaskDates[title] };
            }
        }
    }

    // Use ET timezone (matches user's timezone)
    const now = new Date();
    const todayStr = toETDateString(now);
    const today = new Date(todayStr + 'T12:00:00');

    const streaks: StreakInfo[] = [];

    for (const [title, dates] of Object.entries(habitDates)) {
        const schedule: Schedule = habitSchedules?.[title] ?? { type: 'frequency', days: null };

        // Walk backward to find current streak, then the previous streak (the one that broke)
        let currentStreak = 0;
        let previousStreak = 0;
        const checkDate = new Date(today);

        // If today is scheduled but not completed, step back one day to start counting
        if (isScheduledDay(schedule, checkDate) && !dates.has(todayStr)) {
            checkDate.setDate(checkDate.getDate() - 1);
        } else if (!isScheduledDay(schedule, checkDate)) {
            checkDate.setDate(checkDate.getDate() - 1);
        }

        // Count current streak
        for (let i = 0; i < 365; i++) {
            const dateStr = formatDate(checkDate);
            if (!isScheduledDay(schedule, checkDate)) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }
            if (dates.has(dateStr)) {
                currentStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        // Skip past the gap (missed scheduled days) to find the previous streak
        for (let i = 0; i < 365; i++) {
            const dateStr = formatDate(checkDate);
            if (!isScheduledDay(schedule, checkDate)) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }
            if (!dates.has(dateStr)) {
                // Still in the gap
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        // Count the previous streak (the one that broke)
        for (let i = 0; i < 365; i++) {
            const dateStr = formatDate(checkDate);
            if (!isScheduledDay(schedule, checkDate)) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }
            if (dates.has(dateStr)) {
                previousStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        streaks.push({ habit: title, current: currentStreak, previousStreak });
    }

    return streaks.sort((a, b) => b.current - a.current);
}

// ─── Main Assembly ───────────────────────────────────────────────────────────

export async function assembleReportData(
    supabase: SupabaseClient,
    cadence: ReportCadence,
    periodStart: string,
    periodEnd: string,
): Promise<ReportDataPayload> {
    const prior = computePriorPeriod(cadence, periodStart, periodEnd);

    const includeWeekly = cadence === 'weekly' || cadence === 'monthly' || cadence === 'yearly';
    const includeMonthly = cadence === 'monthly' || cadence === 'yearly';
    const includeYearly = cadence === 'yearly';

    // ── Parallel fetches ─────────────────────────────────────────────────────

    const fetchPromises: Record<string, PromiseLike<any>> = {};

    // ALL cadences
    fetchPromises.dailySummaries = supabase
        .from('daily_summaries')
        .select('date, day_percentage, win_of_the_day, journal_entry')
        .gte('date', periodStart)
        .lte('date', periodEnd)
        .order('date', { ascending: true })
        .then(r => r.data || []);

    fetchPromises.dailyTasks = supabase
        .from('daily_tasks')
        .select('title, date, status, is_one_off')
        .gte('date', periodStart)
        .lte('date', periodEnd)
        .then(r => r.data || []);

    // For streaks we need current year history
    const currentYear = toETDateString(new Date()).slice(0, 4);
    fetchPromises.allTasks = supabase
        .from('daily_tasks')
        .select('title, date, status, is_one_off')
        .eq('status', 'Completed')
        .eq('is_one_off', false)
        .gte('date', `${currentYear}-01-01`)
        .order('date', { ascending: false })
        .limit(5000)
        .then(r => r.data || []);

    fetchPromises.habitFrequencies = supabase
        .from('today_habits')
        .select('title, frequency')
        .then(r => r.data || []);

    fetchPromises.whoopData = supabase
        .from('whoop_data')
        .select('date, recovery_score, strain, sleep_performance, hrv, resting_hr, sleep_hours, calories_burned, sleep_stage_deep_minutes, sleep_stage_rem_minutes, sleep_stage_light_minutes, sleep_stage_awake_minutes, sleep_start')
        .gte('date', periodStart)
        .lte('date', periodEnd)
        .order('date', { ascending: true })
        .then(r => r.data || []);

    fetchPromises.priorWhoop = supabase
        .from('whoop_data')
        .select('date, recovery_score, strain, sleep_performance, hrv, resting_hr, sleep_hours, calories_burned, sleep_stage_deep_minutes, sleep_stage_rem_minutes, sleep_stage_light_minutes, sleep_stage_awake_minutes, sleep_start')
        .gte('date', prior.start)
        .lte('date', prior.end)
        .order('date', { ascending: true })
        .then(r => r.data || []);

    fetchPromises.whoopWorkouts = supabase
        .from('whoop_workouts')
        .select('date, sport_name, workout_label, strain, calories, duration_minutes')
        .eq('user_id', SINGLE_USER_ID)
        .gte('date', periodStart)
        .lte('date', periodEnd)
        .order('date', { ascending: true })
        .then(r => r.data || []);

    // Extended HRV window: 7 days before period start for rolling average computation
    const extendedHrvStart = new Date(new Date(periodStart + 'T00:00:00').getTime() - 7 * 86400000);
    const dayAfterPeriod = formatDate(new Date(new Date(periodEnd + 'T00:00:00').getTime() + 86400000));
    fetchPromises.extendedHrvWhoop = supabase
        .from('whoop_data')
        .select('date, hrv, resting_hr, recovery_score')
        .gte('date', formatDate(extendedHrvStart))
        .lte('date', dayAfterPeriod)
        .order('date', { ascending: true })
        .then(r => r.data || []);

    fetchPromises.books = supabase
        .from('books')
        .select('title, author, status, rating, date_finished, current_page, total_pages')
        .then(r => r.data || []);

    fetchPromises.habitConfigs = supabase
        .from('habit_configs')
        .select('title, emoji')
        .eq('active', true)
        .then(r => r.data || []);

    // weekly+
    if (includeWeekly) {
        fetchPromises.workoutExercises = supabase
            .from('workout_exercises')
            .select('date, exercise, sets, reps, weight')
            .gte('date', periodStart)
            .lte('date', periodEnd)
            .order('date', { ascending: true })
            .then(r => r.data || []);

        fetchPromises.coachNotes = supabase
            .from('coach_notes')
            .select('date, note')
            .gte('date', periodStart)
            .lte('date', periodEnd)
            .order('date', { ascending: true })
            .then(r => r.data || []);

        // Workout weekly plan for coach compliance (weekly reports)
        // The period typically covers a Sun–Sat week; week_start aligns with the Sunday
        fetchPromises.compliancePlan = supabase
            .from('workout_weekly_plans')
            .select('plan')
            .eq('user_id', SINGLE_USER_ID)
            .eq('week_start', periodStart)
            .maybeSingle()
            .then(r => r.data);

        // Prior period exercises for PR detection
        fetchPromises.priorWorkoutExercises = supabase
            .from('workout_exercises')
            .select('date, exercise, sets, reps, weight')
            .gte('date', prior.start)
            .lte('date', prior.end)
            .order('date', { ascending: true })
            .then(r => r.data || []);

        // Projects & tasks for velocity (weekly+)
        fetchPromises.weeklyProjects = supabase
            .from('projects')
            .select('id, name, status, deadline')
            .eq('status', 'active')
            .then(r => r.data || []);

        fetchPromises.weeklyTasks = supabase
            .from('tasks')
            .select('name, status, section_id, completed_at')
            .then(r => r.data || []);

        fetchPromises.weeklySections = supabase
            .from('sections')
            .select('id, project_id')
            .then(r => r.data || []);
    }

    // monthly+
    if (includeMonthly) {
        fetchPromises.goals = supabase
            .from('goals')
            .select('id, title, status, progress, target_date')
            .then(r => r.data || []);

        fetchPromises.projects = supabase
            .from('projects')
            .select('id, title, status, progress')
            .then(r => r.data || []);

        fetchPromises.tasks = supabase
            .from('tasks')
            .select('title, status, project_id')
            .then(r => r.data || []);

        fetchPromises.monthlyGoals = supabase
            .from('goals')
            .select('id, title, category, current_value, target_value, unit, linked_metric')
            .gte('target_date', periodStart)
            .lte('target_date', periodEnd)
            .then(r => r.data || []);

    }

    // yearly
    if (includeYearly) {
        fetchPromises.yearlyGoals = supabase
            .from('yearly_goals')
            .select('id, title, status, progress')
            .then(r => r.data || []);

        fetchPromises.memories = supabase
            .from('memories')
            .select('date, content, tags')
            .gte('date', periodStart)
            .lte('date', periodEnd)
            .order('date', { ascending: true })
            .then(r => r.data || []);
    }

    // Await all in parallel
    const keys = Object.keys(fetchPromises);
    const results = await Promise.all(Object.values(fetchPromises));
    const data: Record<string, any> = {};
    keys.forEach((key, i) => { data[key] = results[i]; });

    // ── Derived metrics ──────────────────────────────────────────────────────

    // Habit completion per day
    const tasksByDate: Record<string, { completed: string[]; missed: string[]; total: number }> = {};
    for (const t of (data.dailyTasks as any[])) {
        if (t.is_one_off) continue;
        if (!tasksByDate[t.date]) tasksByDate[t.date] = { completed: [], missed: [], total: 0 };
        tasksByDate[t.date].total++;
        if (t.status === 'Completed') {
            tasksByDate[t.date].completed.push(t.title);
        } else {
            tasksByDate[t.date].missed.push(t.title);
        }
    }

    const habitDays: HabitDayDetail[] = Object.entries(tasksByDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, info]) => ({
            date,
            dayOfWeek: dayOfWeek(date),
            completed: info.completed.length,
            total: info.total,
            completionRate: info.total > 0 ? Math.round((info.completed.length / info.total) * 100) : 0,
            missed: info.missed,
            completedHabits: info.completed,
        }));

    const allRates = habitDays.map(d => d.completionRate);
    const habitOverallRate = allRates.length > 0
        ? Math.round(allRates.reduce((s, v) => s + v, 0) / allRates.length)
        : null;

    // Streaks
    const scheduleMap: Record<string, Schedule> = {};
    for (const h of (data.habitFrequencies as any[] || [])) {
        scheduleMap[h.title] = { type: 'frequency', days: h.frequency };
    }
    const habitStreaks = computeStreaks(data.allTasks, scheduleMap);

    // Biometrics
    const biometrics = buildBiometricSummary(data.whoopData);
    const priorBiometrics = buildBiometricSummary(data.priorWhoop);

    // Workouts
    const workouts: WorkoutSummary[] = (data.whoopWorkouts as any[]).map(w => ({
        date: w.date,
        sport: w.workout_label || (w.sport_name === 'CrossFit' || w.sport_name === 'Functional Fitness' ? 'Gym' : w.sport_name) || 'Gym',
        strain: w.strain,
        calories: w.calories,
        durationMinutes: w.duration_minutes,
    }));

    // Daily summaries — recalculate day_percentage from actual task data
    // (stored day_percentage can be stale if tasks were completed after viewing the day)
    const taskCountsByDate = new Map<string, { total: number; completed: number }>();
    for (const t of (data.dailyTasks as any[])) {
        if (t.is_one_off) continue;
        const entry = taskCountsByDate.get(t.date) || { total: 0, completed: 0 };
        entry.total++;
        if (t.status === 'Completed') entry.completed++;
        taskCountsByDate.set(t.date, entry);
    }

    const dailySummaries = (data.dailySummaries as any[]).map(s => {
        const counts = taskCountsByDate.get(s.date);
        const recalculated = counts && counts.total > 0
            ? Math.round((counts.completed / counts.total) * 100)
            : s.day_percentage;
        return {
            date: s.date,
            dayPercentage: recalculated,
            win: s.win_of_the_day,
            journal: s.journal_entry,
        };
    });

    // Books
    const books = (data.books as any[]).map(b => ({
        title: b.title,
        author: b.author,
        status: b.status,
        rating: b.rating,
        dateFinished: b.date_finished,
        currentPage: b.current_page ?? null,
        totalPages: b.total_pages ?? null,
    }));

    // Habit configs
    const habitConfigs = (data.habitConfigs as any[]).map(h => ({
        title: h.title,
        emoji: h.emoji,
    }));

    // Exercise PRs (weekly+): compare max weight per exercise vs prior period
    let exercisePRs: Array<{ exercise: string; newMax: number; previousMax: number }> | null = null;
    if (includeWeekly && data.workoutExercises && data.priorWorkoutExercises) {
        const maxWeight = (rows: any[]): Record<string, number> => {
            const result: Record<string, number> = {};
            for (const r of rows) {
                if (r.exercise && r.weight != null) {
                    result[r.exercise] = Math.max(result[r.exercise] ?? 0, r.weight);
                }
            }
            return result;
        };
        const currentMaxes = maxWeight(data.workoutExercises);
        const priorMaxes = maxWeight(data.priorWorkoutExercises);
        const prs: Array<{ exercise: string; newMax: number; previousMax: number }> = [];
        for (const [exercise, newMax] of Object.entries(currentMaxes)) {
            const prev = priorMaxes[exercise];
            if (prev != null && newMax > prev) {
                prs.push({ exercise, newMax, previousMax: prev });
            }
        }
        exercisePRs = prs.length > 0 ? prs : null;
    }

    // Project velocity & deadlines (weekly+)
    let projectVelocity: Array<{
        name: string; tasksCompleted: number; totalTasks: number;
        velocity: number; deadline: string | null; daysRemaining: number | null;
    }> | null = null;
    if (includeWeekly && data.weeklyProjects) {
        const sections = (data.weeklySections || []) as any[];
        const allTasks = (data.weeklyTasks || []) as any[];
        const periodMs = new Date(periodEnd + 'T00:00:00').getTime() - new Date(periodStart + 'T00:00:00').getTime();
        const weeksInPeriod = Math.max(periodMs / (7 * 86400000), 1);
        const todayMs = Date.now();

        const velocityList: Array<{
            name: string; tasksCompleted: number; totalTasks: number;
            velocity: number; deadline: string | null; daysRemaining: number | null;
        }> = [];
        for (const proj of (data.weeklyProjects as any[])) {
            const projSectionIds = sections
                .filter((s: any) => s.project_id === proj.id)
                .map((s: any) => s.id);
            const projTasks = allTasks.filter((t: any) => projSectionIds.includes(t.section_id));
            const completedInPeriod = projTasks.filter((t: any) =>
                t.completed_at && t.completed_at >= periodStart && t.completed_at <= periodEnd
            ).length;
            const velocity = Math.round((completedInPeriod / weeksInPeriod) * 10) / 10;
            const deadlineStr: string | null = proj.deadline || null;
            let daysRemaining: number | null = null;
            if (deadlineStr) {
                daysRemaining = Math.ceil((new Date(deadlineStr + 'T00:00:00').getTime() - todayMs) / 86400000);
            }
            velocityList.push({
                name: proj.name,
                tasksCompleted: completedInPeriod,
                totalTasks: projTasks.length,
                velocity,
                deadline: deadlineStr,
                daysRemaining,
            });
        }
        projectVelocity = velocityList.length > 0 ? velocityList : null;
    }

    // Monthly goals with measurable targets
    const monthlyGoals = includeMonthly && data.monthlyGoals
        ? (data.monthlyGoals as any[]).map((g: any) => ({
            title: g.title,
            category: g.category ?? null,
            current: g.current_value ?? null,
            target: g.target_value ?? null,
            unit: g.unit ?? null,
            linkedMetric: g.linked_metric ?? null,
        }))
        : null;

    // Day-of-week recovery patterns (monthly+)
    let dayOfWeekPatterns: Array<{ day: string; avgRecovery: number }> | null = null;
    if (includeMonthly && data.whoopData) {
        const dowBuckets: Record<string, number[]> = {};
        for (const w of (data.whoopData as any[])) {
            if (w.recovery_score == null) continue;
            const dow = dayOfWeek(w.date);
            if (!dowBuckets[dow]) dowBuckets[dow] = [];
            dowBuckets[dow].push(w.recovery_score);
        }
        const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const patterns: Array<{ day: string; avgRecovery: number }> = [];
        for (const day of orderedDays) {
            const vals = dowBuckets[day];
            if (vals && vals.length > 0) {
                const avg = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
                patterns.push({ day, avgRecovery: avg });
            }
        }
        dayOfWeekPatterns = patterns.length > 0 ? patterns : null;
    }

    // Workout split counts (monthly+)
    let workoutSplitCounts: Record<string, number> | null = null;
    if (includeMonthly && workouts.length > 0) {
        const counts: Record<string, number> = {};
        for (const w of workouts) {
            const label = w.sport || 'Unknown';
            counts[label] = (counts[label] || 0) + 1;
        }
        workoutSplitCounts = counts;
    }

    // ── Analytics Insights ────────────────────────────────────────────────────
    const analyticsInsights: ReportDataPayload['analyticsInsights'] = (() => {
        const extendedWhoop = (data.extendedHrvWhoop || []) as any[];
        const whoopRows = data.whoopData as any[];
        const priorWhoopRows = data.priorWhoop as any[];

        // --- HRV Trend (all cadences) ---
        let hrvTrend: NonNullable<ReportDataPayload['analyticsInsights']>['hrvTrend'] = null;
        {
            const hrvValues = extendedWhoop
                .map((w: any) => ({ date: w.date, hrv: w.hrv as number | null }))
                .filter((w: { hrv: number | null }) => w.hrv != null);

            if (hrvValues.length >= 3) {
                const last7 = hrvValues.slice(-7);
                const avg7d = safeAvg(last7.map(v => v.hrv));

                if (cadence === 'daily') {
                    // Compare today's HRV vs 7-day average
                    const todayHrv = hrvValues[hrvValues.length - 1]?.hrv ?? null;
                    const direction = todayHrv != null && avg7d != null
                        ? todayHrv > avg7d * 1.05 ? 'rising' : todayHrv < avg7d * 0.95 ? 'falling' : 'stable'
                        : 'stable';
                    hrvTrend = { current3d: todayHrv, avg7d, direction };
                } else {
                    // Weekly/monthly: compare 3-day avg vs 7-day avg
                    const last3 = hrvValues.slice(-3);
                    const avg3d = safeAvg(last3.map(v => v.hrv));
                    const direction = avg3d != null && avg7d != null
                        ? avg3d > avg7d * 1.05 ? 'rising' : avg3d < avg7d * 0.95 ? 'falling' : 'stable'
                        : 'stable';
                    hrvTrend = { current3d: avg3d, avg7d, direction };
                }
            }
        }

        // --- RHR Trend (weekly/monthly) ---
        let rhrTrend: NonNullable<ReportDataPayload['analyticsInsights']>['rhrTrend'] = null;
        if (includeWeekly) {
            const currentRhrs = whoopRows.map((w: any) => w.resting_hr as number | null).filter((v): v is number => v != null);
            const priorRhrs = priorWhoopRows.map((w: any) => w.resting_hr as number | null).filter((v): v is number => v != null);
            const currentAvg = safeAvg(currentRhrs);
            const priorAvg = safeAvg(priorRhrs);
            const changePercent = currentAvg != null && priorAvg != null && priorAvg > 0
                ? Math.round(((currentAvg - priorAvg) / priorAvg) * 1000) / 10
                : null;
            if (currentAvg != null || priorAvg != null) {
                rhrTrend = { currentAvg, priorAvg, changePercent };
            }
        }

        // --- Sleep Stage Changes (weekly/monthly) ---
        let sleepStages: NonNullable<ReportDataPayload['analyticsInsights']>['sleepStages'] = null;
        if (includeWeekly) {
            const computeSleepPcts = (rows: any[]): { deepPct: number | null; remPct: number | null } => {
                const deepPcts: number[] = [];
                const remPcts: number[] = [];
                for (const w of rows) {
                    const deep = w.sleep_stage_deep_minutes as number | null;
                    const rem = w.sleep_stage_rem_minutes as number | null;
                    const light = w.sleep_stage_light_minutes as number | null;
                    const awake = w.sleep_stage_awake_minutes as number | null;
                    if (deep != null && rem != null && light != null && awake != null) {
                        const total = deep + rem + light + awake;
                        if (total > 0) {
                            deepPcts.push((deep / total) * 100);
                            remPcts.push((rem / total) * 100);
                        }
                    }
                }
                return {
                    deepPct: safeAvg(deepPcts),
                    remPct: safeAvg(remPcts),
                };
            };
            const current = computeSleepPcts(whoopRows);
            const prior = computeSleepPcts(priorWhoopRows);
            const deepPctChange = current.deepPct != null && prior.deepPct != null
                ? Math.round((current.deepPct - prior.deepPct) * 10) / 10
                : null;
            const remPctChange = current.remPct != null && prior.remPct != null
                ? Math.round((current.remPct - prior.remPct) * 10) / 10
                : null;
            let note: string | null = null;
            if (deepPctChange != null && Math.abs(deepPctChange) > 10) {
                note = `Deep sleep ${deepPctChange > 0 ? 'increased' : 'decreased'} significantly (${deepPctChange > 0 ? '+' : ''}${deepPctChange}pp)`;
            } else if (remPctChange != null && Math.abs(remPctChange) > 10) {
                note = `REM sleep ${remPctChange > 0 ? 'increased' : 'decreased'} significantly (${remPctChange > 0 ? '+' : ''}${remPctChange}pp)`;
            }
            if (deepPctChange != null || remPctChange != null) {
                sleepStages = { deepPctChange, remPctChange, note };
            }
        }

        // --- Bedtime Consistency (weekly/monthly) ---
        let bedtimeConsistency: NonNullable<ReportDataPayload['analyticsInsights']>['bedtimeConsistency'] = null;
        if (includeWeekly) {
            const extractBedtimeHours = (rows: any[]): number[] => {
                const hours: number[] = [];
                for (const w of rows) {
                    const sleepStart = w.sleep_start as string | null;
                    if (sleepStart) {
                        const d = new Date(sleepStart);
                        // Convert to decimal hours, wrapping past midnight (e.g., 11pm = 23, 1am = 25)
                        let h = d.getHours() + d.getMinutes() / 60;
                        if (h < 12) h += 24; // treat early morning as "late night"
                        hours.push(h);
                    }
                }
                return hours;
            };
            const computeStdDev = (values: number[]): number | null => {
                if (values.length < 2) return null;
                const mean = values.reduce((s, v) => s + v, 0) / values.length;
                const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
                return Math.round(Math.sqrt(variance) * 100) / 100;
            };
            const currentBedtimes = extractBedtimeHours(whoopRows);
            const priorBedtimes = extractBedtimeHours(priorWhoopRows);
            const stdDevHours = computeStdDev(currentBedtimes);
            const priorStdDevHours = computeStdDev(priorBedtimes);
            let note: string | null = null;
            if (stdDevHours != null && priorStdDevHours != null && stdDevHours > priorStdDevHours * 1.25) {
                note = 'Bedtime variance increased — less consistent than prior period';
            }
            if (stdDevHours != null || priorStdDevHours != null) {
                bedtimeConsistency = { stdDevHours, priorStdDevHours, note };
            }
        }

        // --- Behavior-Recovery Correlations (weekly/monthly) ---
        let behaviorCorrelations: NonNullable<ReportDataPayload['analyticsInsights']>['behaviorCorrelations'] = null;
        if (includeWeekly) {
            const targetBehaviors = ['Gym', 'Read', 'Meditation', 'Journal'];
            const dailyTaskRows = data.dailyTasks as any[];
            // Build a map of date -> set of completed habit titles
            const completedByDate: Record<string, Set<string>> = {};
            for (const t of dailyTaskRows) {
                if (t.status === 'Completed' && !t.is_one_off) {
                    if (!completedByDate[t.date]) completedByDate[t.date] = new Set();
                    completedByDate[t.date].add(t.title);
                }
            }
            // Build a map of date -> recovery from extended whoop (includes day after period)
            const recoveryByDate: Record<string, number> = {};
            for (const w of extendedWhoop) {
                if (w.recovery_score != null) recoveryByDate[w.date] = w.recovery_score;
            }
            // For each target behavior, compute avg next-day recovery with vs without
            const correlations: { behavior: string; withRecovery: number; withoutRecovery: number; delta: number }[] = [];
            for (const behavior of targetBehaviors) {
                const withRecoveries: number[] = [];
                const withoutRecoveries: number[] = [];
                // Check each date in the period
                const periodDates = Object.keys(completedByDate).length > 0
                    ? [...new Set([...Object.keys(completedByDate), ...dailyTaskRows.map((t: any) => t.date)])]
                    : [];
                const uniqueDates = [...new Set(periodDates)].filter(d => d >= periodStart && d <= periodEnd);
                for (const date of uniqueDates) {
                    const nextDay = formatDate(new Date(new Date(date + 'T00:00:00').getTime() + 86400000));
                    const nextDayRecovery = recoveryByDate[nextDay];
                    if (nextDayRecovery == null) continue;
                    // Check if any completed habit title contains the behavior keyword
                    const completed = completedByDate[date];
                    const didBehavior = completed && [...completed].some(title =>
                        title.toLowerCase().includes(behavior.toLowerCase())
                    );
                    if (didBehavior) {
                        withRecoveries.push(nextDayRecovery);
                    } else {
                        withoutRecoveries.push(nextDayRecovery);
                    }
                }
                if (withRecoveries.length >= 3 && withoutRecoveries.length >= 1) {
                    const withAvg = safeAvg(withRecoveries)!;
                    const withoutAvg = safeAvg(withoutRecoveries)!;
                    const delta = Math.round((withAvg - withoutAvg) * 10) / 10;
                    correlations.push({ behavior, withRecovery: withAvg, withoutRecovery: withoutAvg, delta });
                }
            }
            // Sort by absolute delta descending, take top 3
            correlations.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
            behaviorCorrelations = correlations.length > 0 ? correlations.slice(0, 3) : null;
        }

        // --- Coach Compliance (weekly only) ---
        let coachCompliance: NonNullable<ReportDataPayload['analyticsInsights']>['coachCompliance'] = null;
        if (cadence === 'weekly' && data.compliancePlan) {
            const plan = (data.compliancePlan as any)?.plan as Record<string, any> | undefined;
            if (plan) {
                const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                let totalPlanned = 0;
                let completedCount = 0;

                // Build set of dates that had workouts
                const workoutDates = new Set(workouts.map(w => w.date));

                for (const day of dayOrder) {
                    const val = plan[day];
                    const type = typeof val === 'string' ? val : val?.type;
                    if (type && type !== 'Rest') {
                        totalPlanned++;
                        // Check if there was a workout on that day of the week within the period
                        const dayIndex = dayOrder.indexOf(day);
                        const periodStartDate = new Date(periodStart + 'T00:00:00');
                        const startDow = periodStartDate.getDay();
                        let daysOffset = dayIndex - startDow;
                        if (daysOffset < 0) daysOffset += 7;
                        const targetDate = formatDate(new Date(periodStartDate.getTime() + daysOffset * 86400000));
                        if (workoutDates.has(targetDate)) {
                            completedCount++;
                        }
                    }
                }
                if (totalPlanned > 0) {
                    coachCompliance = {
                        completed: completedCount,
                        missed: totalPlanned - completedCount,
                        total: totalPlanned,
                        pct: Math.round((completedCount / totalPlanned) * 100),
                    };
                }
            }
        }

        // Only return insights if at least one metric was computed
        if (hrvTrend || rhrTrend || sleepStages || bedtimeConsistency || behaviorCorrelations || coachCompliance) {
            return { hrvTrend, rhrTrend, sleepStages, bedtimeConsistency, behaviorCorrelations, coachCompliance };
        }
        return null;
    })();

    // Build payload
    const payload: ReportDataPayload = {
        cadence,
        periodStart,
        periodEnd,
        priorPeriodStart: prior.start,
        priorPeriodEnd: prior.end,
        habitDays,
        habitOverallRate,
        habitStreaks,
        biometrics,
        priorBiometrics,
        dailySummaries,
        workouts,
        workoutExercises: includeWeekly ? (data.workoutExercises || []).map((e: any) => ({
            date: e.date,
            exercise: e.exercise,
            sets: e.sets,
            reps: e.reps,
            weight: e.weight,
        })) : null,
        coachNotes: includeWeekly ? (data.coachNotes || []).map((n: any) => ({
            date: n.date,
            note: n.note,
        })) : null,
        goals: includeMonthly ? (data.goals || []).map((g: any) => ({
            id: g.id,
            title: g.title,
            status: g.status,
            progress: g.progress,
            targetDate: g.target_date,
        })) : null,
        projects: includeMonthly ? (data.projects || []).map((p: any) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            progress: p.progress,
        })) : null,
        tasks: includeMonthly ? (data.tasks || []).map((t: any) => ({
            title: t.title,
            status: t.status,
            projectTitle: t.project_id,
        })) : null,
        books,
        yearlyGoals: includeYearly ? (data.yearlyGoals || []).map((g: any) => ({
            id: g.id,
            title: g.title,
            status: g.status,
            progress: g.progress,
        })) : null,
        memories: includeYearly ? (data.memories || []).map((m: any) => ({
            date: m.date,
            content: m.content,
            tags: m.tags,
        })) : null,
        habitConfigs,
        monthlyGoals: monthlyGoals ? (monthlyGoals.length > 0 ? monthlyGoals : null) : null,
        projectVelocity,
        exercisePRs,
        dayOfWeekPatterns,
        workoutSplitCounts: workoutSplitCounts ?? null,
        analyticsInsights,
    };

    // For weekly reports, include this week's workout plan
    if (cadence === 'weekly') {
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay()); // Sunday
        const weekStartStr = formatDate(weekStart);

        const { data: planRow } = await supabase
            .from('workout_weekly_plans')
            .select('plan')
            .eq('user_id', SINGLE_USER_ID)
            .eq('week_start', weekStartStr)
            .maybeSingle();

        if (planRow?.plan) {
            const plan = planRow.plan as Record<string, any>;
            const simplePlan: Record<string, string> = {};
            Object.entries(plan).forEach(([day, val]) => {
                const t = typeof val === 'string' ? val : val?.type;
                if (t) simplePlan[day] = t;
            });
            payload.thisWeekPlan = simplePlan;
        }
    }

    // For daily morning briefing, add today's context (tasks, habits, workout plan)
    if (cadence === 'daily') {
        const now = new Date();
        const todayStr = toETDateString(now);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayDow = dayNames[getETDayOfWeek(now)];

        // Fetch today's WHOOP data (this morning's recovery/sleep), habits, and projects
        const [{ data: todayHabitTasks }, { data: activeProjects }, { data: todayWhoopRow }] = await Promise.all([
            supabase.from('daily_tasks').select('title, status').eq('date', todayStr),
            supabase.from('projects').select('id, name, status, deadline').eq('status', 'active'),
            supabase.from('whoop_data').select('recovery_score, sleep_performance, sleep_hours, hrv, resting_hr, strain, sleep_stage_deep_minutes, sleep_stage_rem_minutes, sleep_stage_light_minutes, sleep_stage_awake_minutes').eq('date', todayStr).maybeSingle(),
        ]);

        // For each active project, get task counts and in-progress/to-do tasks
        const projectDetails: Array<{ name: string; tasksDone: number; tasksTotal: number; deadline: string | null }> = [];
        const upcomingTasksList: Array<{ title: string; projectName: string | null; status: string; priority: string | null }> = [];

        if (activeProjects && activeProjects.length > 0) {
            // Get all sections for these projects
            const { data: allSections } = await supabase.from('sections').select('id, project_id')
                .in('project_id', activeProjects.map((p: any) => p.id));
            const sectionIds = (allSections || []).map((s: any) => s.id);
            const sectionToProject: Record<string, string> = {};
            for (const s of (allSections || [])) {
                const proj = activeProjects.find((p: any) => p.id === s.project_id);
                if (proj) sectionToProject[s.id] = proj.name;
            }

            if (sectionIds.length > 0) {
                const { data: allTasks } = await supabase.from('tasks').select('name, status, priority, section_id')
                    .in('section_id', sectionIds);

                // Build project summaries
                for (const proj of activeProjects) {
                    const projSections = (allSections || []).filter((s: any) => s.project_id === proj.id).map((s: any) => s.id);
                    const projTasks = (allTasks || []).filter((t: any) => projSections.includes(t.section_id));
                    const done = projTasks.filter((t: any) => t.status === 'Done').length;
                    projectDetails.push({ name: proj.name, tasksDone: done, tasksTotal: projTasks.length, deadline: proj.deadline || null });
                }

                // Get upcoming tasks (In Progress or To Do)
                const upcoming = (allTasks || []).filter((t: any) => t.status === 'In Progress' || t.status === 'To Do');
                for (const t of upcoming.slice(0, 10)) {
                    upcomingTasksList.push({
                        title: t.name,
                        projectName: t.section_id ? (sectionToProject[t.section_id] || null) : null,
                        status: t.status,
                        priority: t.priority || null,
                    });
                }
            }
        }

        // Fetch today's planned workout from workout_weekly_plans
        const todayDate = new Date(todayStr + 'T12:00:00');
        const weekStart = new Date(todayDate);
        weekStart.setDate(todayDate.getDate() - todayDate.getDay()); // Start of week (Sunday)
        const weekStartStr = formatDate(weekStart);

        const { data: weeklyPlanRow } = await supabase
            .from('workout_weekly_plans')
            .select('plan')
            .eq('user_id', SINGLE_USER_ID)
            .eq('week_start', weekStartStr)
            .maybeSingle();

        let plannedWorkout: string | null = null;
        const weekWorkoutPlan: Record<string, string> = {};

        if (weeklyPlanRow?.plan) {
            const plan = weeklyPlanRow.plan as Record<string, any>;
            Object.entries(plan).forEach(([day, val]) => {
                const t = typeof val === 'string' ? val : val?.type;
                if (t && t !== 'Rest') weekWorkoutPlan[day] = t;
            });
            // Get today's planned workout from the plan
            const todayPlan = plan[todayDow];
            if (todayPlan) {
                const todayType = typeof todayPlan === 'string' ? todayPlan : todayPlan?.type;
                if (todayType && todayType !== 'Rest') plannedWorkout = todayType;
            }
        } else {
            // Fallback: infer from daily tasks
            const workoutTask = (todayHabitTasks || []).find((t: any) => {
                const tl = t.title.toLowerCase();
                return tl.includes('gym') || tl.startsWith('push') || tl.startsWith('pull') || tl === 'legs' || tl === 'workout';
            });
            if (workoutTask) {
                // For "Push (Chest)" return "Push (Chest)", for legacy "Gym (Push Chest)" extract inner
                const legacyMatch = workoutTask.title.match(/^gym\s*\((.+)\)$/i);
                plannedWorkout = legacyMatch ? legacyMatch[1] : workoutTask.title;
            }
        }

        // Fetch today's pre-coach advice from coach_notes
        let todayCoachAdvice: string | null = null;
        {
            const { data: coachRow } = await supabase
                .from('coach_notes')
                .select('workout_type, notes, intensity, weight_notes, exercise_order, warm_up, warnings')
                .eq('coach_type', 'pre')
                .gte('created_at', todayStr + 'T00:00:00')
                .lte('created_at', todayStr + 'T23:59:59')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (coachRow) {
                const parts: string[] = [];
                parts.push(`Workout: ${coachRow.workout_type}`);
                if (coachRow.intensity) {
                    const label = coachRow.intensity === 'push' ? 'Push intensity' : coachRow.intensity === 'deload' ? 'Deload' : 'Maintain intensity';
                    parts.push(`Intensity: ${label}`);
                }
                const notes = coachRow.notes as string[];
                if (notes && notes.length > 0) {
                    parts.push(`Coach: ${notes[0]}`);
                }
                // Include ALL exercise targets so morning brief shows the full plan
                const weightNotes = coachRow.weight_notes as Record<string, string>;
                if (weightNotes && Object.keys(weightNotes).length > 0) {
                    const exerciseOrder = (coachRow.exercise_order as string[]) || [];
                    const orderedExercises = exerciseOrder.length > 0
                        ? exerciseOrder.filter(e => weightNotes[e]).map(e => `${e}: ${weightNotes[e]}`)
                        : Object.entries(weightNotes).map(([ex, target]) => `${ex}: ${target}`);
                    if (orderedExercises.length > 0) {
                        parts.push(`Exercises — ${orderedExercises.join(' | ')}`);
                    }
                }
                const warmUp = coachRow.warm_up as Record<string, string>;
                if (warmUp && Object.keys(warmUp).length > 0) {
                    const warmUpList = Object.entries(warmUp).map(([ex, sets]) => `${ex}: ${sets}`);
                    parts.push(`Warm-up — ${warmUpList.join(' | ')}`);
                }
                const warnings = coachRow.warnings as string[];
                if (warnings && warnings.length > 0 && warnings[0]) {
                    parts.push(`Warning: ${warnings[0]}`);
                }
                todayCoachAdvice = parts.join('\n');
            }
        }

        // Compute sleep stage percentages
        let todayDeepPct: number | null = null;
        let todayRemPct: number | null = null;
        if (todayWhoopRow) {
            const deep = todayWhoopRow.sleep_stage_deep_minutes as number | null;
            const rem = todayWhoopRow.sleep_stage_rem_minutes as number | null;
            const light = todayWhoopRow.sleep_stage_light_minutes as number | null;
            const awake = todayWhoopRow.sleep_stage_awake_minutes as number | null;
            if (deep != null && rem != null && light != null && awake != null) {
                const totalMinutes = deep + rem + light + awake;
                if (totalMinutes > 0) {
                    todayDeepPct = Math.round((deep / totalMinutes) * 1000) / 10;
                    todayRemPct = Math.round((rem / totalMinutes) * 1000) / 10;
                }
            }
        }

        payload.todayContext = {
            todayDate: todayStr,
            todayDayOfWeek: todayDow,
            todayRecovery: todayWhoopRow?.recovery_score ?? null,
            todaySleepScore: todayWhoopRow?.sleep_performance ?? null,
            todaySleepHours: todayWhoopRow?.sleep_hours ?? null,
            todayHrv: todayWhoopRow?.hrv ?? null,
            todayRhr: todayWhoopRow?.resting_hr ?? null,
            todayStrain: todayWhoopRow?.strain ?? null,
            todayDeepPct,
            todayRemPct,
            activeProjects: projectDetails,
            upcomingTasks: upcomingTasksList,
            todayHabits: (todayHabitTasks || []).map((t: any) => t.title),
            plannedWorkout,
            weekWorkoutPlan: Object.keys(weekWorkoutPlan).length > 0 ? weekWorkoutPlan : null,
            todayCoachAdvice,
        };
    }

    return payload;
}
