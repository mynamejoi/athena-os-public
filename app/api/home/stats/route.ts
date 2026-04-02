import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { toETDateString, getETYesterday, formatDateStr } from '@/lib/date-utils';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const today = toETDateString();
    const yesterday = getETYesterday();

    // Fetch all in parallel
    // Compute week start (Sunday) in ET
    const todayParsed = new Date(today + 'T12:00:00');
    const weekStartDate = new Date(todayParsed);
    weekStartDate.setDate(todayParsed.getDate() - todayParsed.getDay());
    const weekStart = formatDateStr(weekStartDate);

    // Relative dates
    const thirtyDaysAgo = toETDateString(new Date(Date.now() - 30 * 86400000));
    const sevenDaysAgo = toETDateString(new Date(Date.now() - 7 * 86400000));
    const fourteenDaysAgo = toETDateString(new Date(Date.now() - 14 * 86400000));

    const [
      whoopTodayResult, whoopYesterdayResult,
      tasksTodayResult, tasksYesterdayResult,
      projectTasksResult, streaksResult,
      activeProjectsResult, activeBooksResult,
      whoopWorkoutsWeekResult, weeklyPlanResult, gymTasksWeekResult,
      // 30-day averages
      whoop30dResult, habits30dResult, tasksDue30dResult,
      workouts30dResult,
      // Project momentum
      projectTasksThisWeekResult, projectTasksLastWeekResult,
    ] = await Promise.all([
      // Today's whoop data (with HRV + RHR)
      supabase
        .from('whoop_data')
        .select('recovery_score, strain, sleep_hours, sleep_performance, hrv, resting_hr')
        .eq('date', today)
        .maybeSingle(),

      // Yesterday's whoop data (fallback)
      supabase
        .from('whoop_data')
        .select('recovery_score, strain, sleep_hours, sleep_performance, hrv, resting_hr')
        .eq('date', yesterday)
        .maybeSingle(),

      // Today's daily tasks (habits)
      supabase
        .from('daily_tasks')
        .select('status, is_one_off')
        .eq('date', today),

      // Yesterday's daily tasks (fallback)
      supabase
        .from('daily_tasks')
        .select('status, is_one_off')
        .eq('date', yesterday),

      // Project tasks due today (from tasks table)
      supabase
        .from('tasks')
        .select('id, status, due_date')
        .eq('due_date', today)
        .neq('status', 'Done'),

      // Athena usage streak - distinct dates with any completed task
      supabase
        .from('daily_tasks')
        .select('date')
        .eq('status', 'Completed')
        .order('date', { ascending: false })
        .limit(1000),

      // Active project count
      supabase
        .from('projects')
        .select('id')
        .in('status', ['In Progress', 'active', 'Active']),

      // Active books count
      supabase
        .from('books')
        .select('id')
        .in('status', ['active', 'reading', 'Reading', 'in_progress']),

      // Whoop workouts this week (by date for deduplication)
      supabase
        .from('whoop_workouts')
        .select('date')
        .gte('date', weekStart),

      // Weekly workout plan (to get planned count)
      supabase
        .from('workout_weekly_plans')
        .select('plan')
        .eq('week_start', weekStart)
        .maybeSingle(),

      // Gym daily tasks this week (completed = workout done)
      supabase
        .from('daily_tasks')
        .select('date, status, title')
        .gte('date', weekStart)
        .or('title.ilike.%gym%,title.ilike.push%,title.ilike.pull%,title.ilike.legs'),

      // 30-day WHOOP averages (HRV, RHR)
      supabase
        .from('whoop_data')
        .select('hrv, resting_hr')
        .gte('date', thirtyDaysAgo)
        .not('hrv', 'is', null),

      // 30-day habits (for avg day score + avg remaining)
      supabase
        .from('daily_tasks')
        .select('date, status, is_one_off')
        .gte('date', thirtyDaysAgo),

      // 30-day tasks due per day (for avg)
      supabase
        .from('tasks')
        .select('due_date, status')
        .gte('due_date', thirtyDaysAgo)
        .lte('due_date', today)
        .neq('status', 'Done'),

      // 30-day workouts (for avg per week)
      supabase
        .from('whoop_workouts')
        .select('id')
        .gte('date', thirtyDaysAgo),

      // Project tasks this week - all (for total) and done (for completed)
      supabase
        .from('tasks')
        .select('id, status')
        .gte('due_date', sevenDaysAgo),

      // Project tasks last week (for comparison)
      supabase
        .from('tasks')
        .select('id, status')
        .gte('due_date', fourteenDaysAgo)
        .lt('due_date', sevenDaysAgo),
    ]);

    // Health stats — use today, fall back to yesterday
    const whoop = whoopTodayResult.data ?? whoopYesterdayResult.data;
    const healthDate = whoopTodayResult.data ? today : (whoopYesterdayResult.data ? yesterday : null);
    const health = {
      recovery: whoop?.recovery_score ?? null,
      strain: whoop?.strain ?? null,
      sleepHours: whoop?.sleep_hours ?? null,
      sleepScore: whoop?.sleep_performance ?? null,
      hrv: whoop?.hrv ?? null,
      restingHr: whoop?.resting_hr ?? null,
      date: healthDate,
    };

    // 30-day WHOOP averages
    const whoop30d = whoop30dResult.data || [];
    const avgHrv = whoop30d.length > 0
      ? Math.round(whoop30d.reduce((s, r) => s + (r.hrv || 0), 0) / whoop30d.length)
      : null;
    const avgRhr = whoop30d.length > 0
      ? Math.round(whoop30d.reduce((s, r) => s + (r.resting_hr || 0), 0) / whoop30d.length)
      : null;

    // Daily task stats — use today, fall back to yesterday
    const todayTasks = tasksTodayResult.data || [];
    const yesterdayTasks = tasksYesterdayResult.data || [];
    const tasks = todayTasks.length > 0 ? todayTasks : yesterdayTasks;
    const habitsCompleted = tasks.filter(t => t.status === 'Completed' && !t.is_one_off).length;
    const habitsTotal = tasks.filter(t => !t.is_one_off).length;
    const habitsDate = todayTasks.length > 0 ? today : (yesterdayTasks.length > 0 ? yesterday : null);

    // Project tasks due today
    const projectTasksDueToday = projectTasksResult.data?.length ?? 0;

    // Calculate Athena usage streak (consecutive days with any completed task)
    const streakData = streaksResult.data || [];
    const activeDates = new Set(streakData.map(row => row.date));

    let athenaStreak = 0;
    const todayDate = new Date(today + 'T12:00:00');
    const checkDate = new Date(todayDate);
    // If today has no completions yet, start from yesterday
    if (!activeDates.has(today)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (activeDates.has(formatDate(checkDate))) {
      athenaStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // 30-day habit averages (day score + remaining)
    const habits30d = habits30dResult.data || [];
    const habitsByDate: Record<string, { completed: number; total: number }> = {};
    for (const t of habits30d) {
      if (t.is_one_off) continue;
      if (!habitsByDate[t.date]) habitsByDate[t.date] = { completed: 0, total: 0 };
      habitsByDate[t.date].total++;
      if (t.status === 'Completed') habitsByDate[t.date].completed++;
    }
    const habitDays = Object.values(habitsByDate);
    const avgDayScore = habitDays.length > 0
      ? Math.round(habitDays.reduce((s, d) => s + (d.total > 0 ? (d.completed / d.total) * 100 : 0), 0) / habitDays.length)
      : null;
    const avgHabitsRemaining = habitDays.length > 0
      ? +(habitDays.reduce((s, d) => s + (d.total - d.completed), 0) / habitDays.length).toFixed(1)
      : null;

    // 30-day avg tasks due per day
    const tasksDue30d = tasksDue30dResult.data || [];
    const tasksDueByDate: Record<string, number> = {};
    for (const t of tasksDue30d) {
      if (t.due_date) tasksDueByDate[t.due_date] = (tasksDueByDate[t.due_date] || 0) + 1;
    }
    const dueDays = Object.values(tasksDueByDate);
    const avgTasksDuePerDay = dueDays.length > 0
      ? +(dueDays.reduce((s, n) => s + n, 0) / 30).toFixed(1)
      : null;

    // 30-day workouts per week avg
    const workouts30dCount = workouts30dResult.data?.length ?? 0;
    const avgWorkoutsPerWeek = +(workouts30dCount / (30 / 7)).toFixed(1);

    // Project tasks this week: completed vs total
    const projectTasksThisWeekAll = projectTasksThisWeekResult.data || [];
    const projectTasksThisWeekDone = projectTasksThisWeekAll.filter(t => t.status === 'Done').length;
    const projectTasksThisWeekTotal = projectTasksThisWeekAll.length;
    const projectTasksLastWeekAll = projectTasksLastWeekResult.data || [];
    const projectTasksLastWeekDone = projectTasksLastWeekAll.filter(t => t.status === 'Done').length;

    // Longest streak from the streak data we already have (current year only)
    let longestStreak = 0;
    let currentRun = 0;
    const currentYear = today.slice(0, 4);
    const sortedDates = [...activeDates].filter(d => d >= `${currentYear}-01-01`).sort().reverse();
    for (let i = 0; i < sortedDates.length; i++) {
      const d = new Date(sortedDates[i] + 'T00:00:00');
      const prev = i > 0 ? new Date(sortedDates[i - 1] + 'T00:00:00') : null;
      if (prev && (prev.getTime() - d.getTime()) === 86400000) {
        currentRun++;
      } else {
        currentRun = 1;
      }
      if (currentRun > longestStreak) longestStreak = currentRun;
    }

    // Workouts this week: completed vs planned
    // Planned = non-Rest days from weekly plan
    let workoutsPlanned = 0;
    if (weeklyPlanResult.data?.plan) {
      const plan = weeklyPlanResult.data.plan as Record<string, any>;
      workoutsPlanned = Object.values(plan).filter(v => {
        const t = typeof v === 'string' ? v : v?.type;
        return t && t !== 'Rest';
      }).length;
    }
    // Completed = unique dates where EITHER a whoop_workout exists OR a gym daily_task is completed
    const workoutDates = new Set<string>();
    for (const w of (whoopWorkoutsWeekResult.data || [])) {
      if (w.date) workoutDates.add(w.date);
    }
    for (const t of (gymTasksWeekResult.data || [])) {
      if (t.status === 'Completed' && t.date) workoutDates.add(t.date);
    }
    const workoutsCompleted = workoutDates.size;

    return NextResponse.json({
      health: {
        ...health,
        avgHrv,
        avgRhr,
      },
      development: {
        habitsCompleted,
        habitsTotal,
        habitsDate,
        projectTasksDueToday,
        athenaStreak,
        longestStreak,
        activeProjectCount: activeProjectsResult.data?.length ?? 0,
        activeBooksCount: activeBooksResult.data?.length ?? 0,
        workoutsCompleted,
        workoutsPlanned,
        projectTasksThisWeekDone,
        projectTasksThisWeekTotal,
        projectTasksLastWeekDone,
      },
      averages: {
        dayScore: avgDayScore,
        habitsRemaining: avgHabitsRemaining,
        hrv: avgHrv,
        rhr: avgRhr,
        tasksDuePerDay: avgTasksDuePerDay,
        workoutsPerWeek: avgWorkoutsPerWeek,
      },
    });
  } catch (e: any) {
    console.error('Home stats error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
