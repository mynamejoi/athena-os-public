'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    format, startOfWeek, endOfWeek, eachDayOfInterval,
    addWeeks, subWeeks, isSameDay, isAfter, parseISO
} from 'date-fns';
import {
    ChevronLeft, ChevronRight, ChevronDown, Zap, Moon,
    Check, Dumbbell, Heart, ListChecks, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { getDayScoreColor, getRecoveryColor } from '@/lib/theme';
import { AthenaNavBar } from './AthenaNavBar';
import WeeklyReportPanel from './reports/WeeklyReportPanel';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { SparklineRow } from './charts/SparklineRow';
import { MobileDrawerSheet } from '@/components/mobile/MobileDrawerSheet';
import { DataMaturityProvider, DataGate } from '@/components/productivity/DataGate';

// --- Types ---
interface WeekDayData {
    date: Date;
    dateStr: string;
    dayScore: number;
    recovery: number | null;
    sleepScore: number | null;
    strain: number | null;
    sleepHours: number | null;
    hrv: number | null;
    rhr: number | null;
    calories: number | null;
    habitsCompleted: number;
    totalHabits: number;
    tasksCompleted: number;
    totalTasks: number;
    hasData: boolean;
}

interface HabitRow {
    title: string;
    days: boolean[]; // 7 booleans, Sun-Sat
}

interface WorkoutEntry {
    date: string;
    sportName: string;
    strain: number | null;
    durationMinutes: number | null;
}


// --- Workout label normalization (matches DevelopmentWorkoutsWorkspace) ---
function getWorkoutSplitFromTask(tasks: any[], date: string): string | null {
    const workoutTask = tasks.find((t: any) => {
        if (t.date !== date) return false;
        const tl = t.title.toLowerCase();
        return tl.includes('gym') || tl.startsWith('push') || tl.startsWith('pull') || tl === 'legs';
    });
    if (!workoutTask) return null;
    if (workoutTask.title.toLowerCase().startsWith('gym')) {
        const match = workoutTask.title.match(/\((.+)\)\s*$/);
        return match ? match[1] : workoutTask.title;
    }
    return workoutTask.title;
}

function normalizeType(sportName: string, workoutLabel?: string, split?: string | null): string {
    let type = workoutLabel || sportName || 'Other';
    if (type === 'Leg Day' || type === 'Leg') type = 'Legs';
    else if (type === 'Push Day') type = 'Push (Chest)';
    else if (type === 'Pull Day') type = 'Pull (Bicep)';
    else if (type === 'Push') type = 'Push (Chest)';
    else if (type === 'Pull') type = 'Pull (Bicep)';

    if (workoutLabel && workoutLabel !== sportName) return type;

    const isLifting = ['Functional Fitness', 'Weightlifting', 'Gym', 'Powerlifting', 'CrossFit', 'Box Fitness'].includes(sportName);
    if (split && isLifting) {
        if (/^push\s*\(chest\)$/i.test(split) || /^push\s+chest$/i.test(split)) type = 'Push (Chest)';
        else if (/^push\s*\(tricep\)$/i.test(split) || /^push\s+tricep$/i.test(split)) type = 'Push (Tricep)';
        else if (/^pull\s*\(back\)$/i.test(split) || /^pull\s+back$/i.test(split)) type = 'Pull (Back)';
        else if (/^pull\s*\(bicep\)$/i.test(split) || /^pull\s+bicep$/i.test(split)) type = 'Pull (Bicep)';
        else if (split === 'Leg Day' || split === 'Legs') type = 'Legs';
        else if (split === 'Push Day' || split === 'Push') type = 'Push (Chest)';
        else if (split === 'Pull Day' || split === 'Pull') type = 'Pull (Bicep)';
        else type = split;
    }

    if (type === 'Activity' || type === 'General Activity' || type === 'Sport -1') type = 'Other';
    if (type === 'Functional Fitness') type = 'Gym';
    // Normalize WHOOP API hyphenated sport names
    const lower = type.toLowerCase();
    if (lower === 'hiking-rucking' || lower === 'hiking' || lower === 'rucking') type = 'Hiking';
    else if (lower === 'walking' || lower === 'walk') type = 'Walk';
    return type;
}

// --- Animations ---
const fadeSlide = {
    hidden: { opacity: 0, y: 14 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.06, duration: 0.55, ease: [0.25, 0.1, 0.25, 1.0] as const }
    })
};

const sectionFade = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } }
};

export default function WeekViewV2() {
    const { whoopEnabled } = useWhoopMode();
    const supabase = createClient();
    const today = new Date();

    const [currentWeekStart, setCurrentWeekStart] = useState(() =>
        startOfWeek(new Date(), { weekStartsOn: 0 }) // Sunday
    );
    const [weekData, setWeekData] = useState<WeekDayData[]>([]);
    const [habitRows, setHabitRows] = useState<HabitRow[]>([]);
    const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
    const [projectTasksDone, setProjectTasksDone] = useState(0);
    const [projectTasksTotal, setProjectTasksTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [mobileReportDrawerOpen, setMobileReportDrawerOpen] = useState(false);
    const [mobileDayDrawerOpen, setMobileDayDrawerOpen] = useState(false);
    const [mobileWorkoutsDrawerOpen, setMobileWorkoutsDrawerOpen] = useState(false);
    const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
    const [prevWeekDeltas, setPrevWeekDeltas] = useState<{
        habits: number | null;
        recovery: number | null;
        strain: number | null;
        sleep: number | null;
    }>({ habits: null, recovery: null, strain: null, sleep: null });

    const weekEnd = useMemo(() => endOfWeek(currentWeekStart, { weekStartsOn: 0 }), [currentWeekStart]);
    const weekDays = useMemo(() => eachDayOfInterval({ start: currentWeekStart, end: weekEnd }), [currentWeekStart, weekEnd]);

    // --- Data Fetching ---
    const fetchWeekData = async () => {
        setIsLoading(true);
        const startStr = format(currentWeekStart, 'yyyy-MM-dd');
        const endStr = format(weekEnd, 'yyyy-MM-dd');

        try {
            // Fetch workouts via API (same pattern as MonthViewV2)
            const workoutsRes = await fetch(`/api/productivity/workouts?start_date=${startStr}&end_date=${endStr}`);
            const workoutsApiData = await workoutsRes.json();

            // Previous week date range
            const prevWeekStart = subWeeks(currentWeekStart, 1);
            const prevWeekEnd = endOfWeek(prevWeekStart, { weekStartsOn: 0 });
            const prevStartStr = format(prevWeekStart, 'yyyy-MM-dd');
            const prevEndStr = format(prevWeekEnd, 'yyyy-MM-dd');

            const [
                { data: tasksData },
                { data: summariesData },
                { data: whoopDataRaw },
                { data: prevTasksData },
                { data: prevWhoopData }
            ] = await Promise.all([
                supabase.from('daily_tasks').select('*').gte('date', startStr).lte('date', endStr),
                supabase.from('daily_summaries').select('*').gte('date', startStr).lte('date', endStr),
                supabase.from('whoop_data').select('*').gte('date', startStr).lte('date', endStr),
                supabase.from('daily_tasks').select('*').gte('date', prevStartStr).lte('date', prevEndStr),
                supabase.from('whoop_data').select('*').gte('date', prevStartStr).lte('date', prevEndStr)
            ]);

            // Build per-day data
            const processed: WeekDayData[] = weekDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayTasks = tasksData?.filter(t => t.date === dayStr) || [];
                const habits = dayTasks.filter(t => !t.is_one_off);
                const completedHabits = habits.filter(t => t.status === 'Completed').length;
                const completedTasks = dayTasks.filter(t => t.status === 'Completed').length;
                const totalTasks = dayTasks.length;
                const dayScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                const whoop = whoopDataRaw?.find(w => w.date === dayStr);

                return {
                    date: day,
                    dateStr: dayStr,
                    dayScore,
                    recovery: whoop?.recovery_score ?? null,
                    sleepScore: whoop?.sleep_performance ?? null,
                    strain: whoop?.strain ?? null,
                    sleepHours: whoop?.sleep_hours ?? null,
                    hrv: whoop?.hrv ?? null,
                    rhr: whoop?.resting_hr ?? null,
                    calories: whoop?.calories_burned ?? null,
                    habitsCompleted: completedHabits,
                    totalHabits: habits.length,
                    tasksCompleted: completedTasks,
                    totalTasks,
                    hasData: totalTasks > 0 || !!whoop
                };
            });

            setWeekData(processed);

            // Build habit grid rows — consolidate gym variants into single "Gym" row
            const allHabitTitles = new Set<string>();
            const gymKeywords = ['gym', 'push', 'pull', 'legs', 'leg day', 'functional fitness', 'lifting'];
            const recurringTasks = (tasksData || []).filter(t => !t.is_one_off);
            recurringTasks.forEach(t => {
                const isGym = gymKeywords.some(k => t.title.toLowerCase().includes(k));
                allHabitTitles.add(isGym ? 'Gym' : t.title);
            });

            const rows: HabitRow[] = Array.from(allHabitTitles).sort().map(title => {
                const days = weekDays.map(day => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    if (title === 'Gym') {
                        // Any gym-related task completed counts
                        return recurringTasks.some(t =>
                            t.date === dayStr &&
                            t.status === 'Completed' &&
                            gymKeywords.some(k => t.title.toLowerCase().includes(k))
                        );
                    }
                    const task = recurringTasks.find(t => t.date === dayStr && t.title === title);
                    return task?.status === 'Completed';
                });
                return { title, days };
            });
            setHabitRows(rows);

            // Build workouts list with normalized labels (matching workout page)
            const allTasks = tasksData || [];
            const wkouts: WorkoutEntry[] = (workoutsApiData.workouts || [])
                .filter((w: any) => {
                    const type = normalizeType(w.sport_name, w.workout_label, getWorkoutSplitFromTask(allTasks, w.date));
                    return !['Steam Room', 'Sauna', 'Ice Bath'].includes(type);
                })
                .map((w: any) => {
                    const split = getWorkoutSplitFromTask(allTasks, w.date);
                    const displayType = normalizeType(w.sport_name, w.workout_label, split);
                    return {
                        date: w.date,
                        sportName: displayType,
                        strain: w.strain ?? null,
                        durationMinutes: w.duration_minutes ?? null,
                    };
                });
            setWorkouts(wkouts);

            // Fetch project tasks completed this week
            const [
                { data: doneProjectTasks },
                { count: totalProjectTasks }
            ] = await Promise.all([
                supabase.from('tasks').select('id').eq('status', 'Done')
                    .gte('completed_at', startStr).lte('completed_at', endStr + 'T23:59:59.999Z'),
                supabase.from('tasks').select('*', { count: 'exact', head: true })
                    .neq('status', 'Done')
            ]);
            setProjectTasksDone(doneProjectTasks?.length || 0);
            setProjectTasksTotal((doneProjectTasks?.length || 0) + (totalProjectTasks || 0));

            // --- Compute previous week deltas ---
            const prevWeekDays = eachDayOfInterval({ start: prevWeekStart, end: prevWeekEnd });
            const prevProcessed = prevWeekDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayTasks = prevTasksData?.filter(t => t.date === dayStr) || [];
                const habits = dayTasks.filter(t => !t.is_one_off);
                const completedHabits = habits.filter(t => t.status === 'Completed').length;
                const whoop = prevWhoopData?.find(w => w.date === dayStr);
                return {
                    habitsCompleted: completedHabits,
                    totalHabits: habits.length,
                    recovery: whoop?.recovery_score ?? null,
                    sleepScore: whoop?.sleep_performance ?? null,
                    strain: whoop?.strain ?? null,
                };
            });

            const prevDaysWithHabits = prevProcessed.filter(d => d.totalHabits > 0);
            const prevDaysWithRecovery = prevProcessed.filter(d => d.recovery !== null);
            const prevDaysWithSleep = prevProcessed.filter(d => d.sleepScore !== null);
            const prevDaysWithStrain = prevProcessed.filter(d => d.strain !== null);

            const prevAvgHabits = prevDaysWithHabits.length > 0
                ? Math.round(prevDaysWithHabits.reduce((s, d) => s + (d.habitsCompleted / d.totalHabits) * 100, 0) / prevDaysWithHabits.length) : null;
            const prevAvgRecovery = prevDaysWithRecovery.length > 0
                ? Math.round(prevDaysWithRecovery.reduce((s, d) => s + (d.recovery || 0), 0) / prevDaysWithRecovery.length) : null;
            const prevAvgSleep = prevDaysWithSleep.length > 0
                ? Math.round(prevDaysWithSleep.reduce((s, d) => s + (d.sleepScore || 0), 0) / prevDaysWithSleep.length) : null;
            const prevAvgStrain = prevDaysWithStrain.length > 0
                ? Number((prevDaysWithStrain.reduce((s, d) => s + (d.strain || 0), 0) / prevDaysWithStrain.length).toFixed(1)) : null;

            // Compute current week averages from processed data (can't use `stats` useMemo here)
            const curDaysWithHabits = processed.filter(d => d.totalHabits > 0);
            const curDaysWithRecovery = processed.filter(d => d.recovery !== null);
            const curDaysWithSleep = processed.filter(d => d.sleepScore !== null);
            const curDaysWithStrain = processed.filter(d => d.strain !== null);

            const curAvgHabits = curDaysWithHabits.length > 0
                ? Math.round(curDaysWithHabits.reduce((s, d) => s + (d.habitsCompleted / d.totalHabits) * 100, 0) / curDaysWithHabits.length) : null;
            const curAvgRecovery = curDaysWithRecovery.length > 0
                ? Math.round(curDaysWithRecovery.reduce((s, d) => s + (d.recovery || 0), 0) / curDaysWithRecovery.length) : null;
            const curAvgSleep = curDaysWithSleep.length > 0
                ? Math.round(curDaysWithSleep.reduce((s, d) => s + (d.sleepScore || 0), 0) / curDaysWithSleep.length) : null;
            const curAvgStrain = curDaysWithStrain.length > 0
                ? Number((curDaysWithStrain.reduce((s, d) => s + (d.strain || 0), 0) / curDaysWithStrain.length).toFixed(1)) : null;

            setPrevWeekDeltas({
                habits: (curAvgHabits !== null && prevAvgHabits !== null) ? curAvgHabits - prevAvgHabits : null,
                recovery: (curAvgRecovery !== null && prevAvgRecovery !== null) ? curAvgRecovery - prevAvgRecovery : null,
                strain: (curAvgStrain !== null && prevAvgStrain !== null) ? Number((curAvgStrain - prevAvgStrain).toFixed(1)) : null,
                sleep: (curAvgSleep !== null && prevAvgSleep !== null) ? curAvgSleep - prevAvgSleep : null,
            });


        } catch (error) {
            console.error('Failed to fetch week data', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchWeekData();
    }, [currentWeekStart]);

    // --- Computed Stats ---
    const stats = useMemo(() => {
        const daysWithData = weekData.filter(d => d.hasData);
        const daysWithHabits = daysWithData.filter(d => d.totalHabits > 0);
        const daysWithRecovery = daysWithData.filter(d => d.recovery !== null);
        const daysWithSleep = daysWithData.filter(d => d.sleepScore !== null);
        const daysWithStrain = daysWithData.filter(d => d.strain !== null);
        const daysWithHrv = daysWithData.filter(d => d.hrv !== null);
        const daysWithRhr = daysWithData.filter(d => d.rhr !== null);
        const daysWithCalories = daysWithData.filter(d => d.calories !== null);
        const daysWithSleepHours = daysWithData.filter(d => d.sleepHours !== null && d.sleepHours > 0);

        const avgHabitCompletion = daysWithHabits.length > 0
            ? Math.round(daysWithHabits.reduce((sum, d) => sum + (d.habitsCompleted / d.totalHabits) * 100, 0) / daysWithHabits.length)
            : 0;

        const avgRecovery = daysWithRecovery.length > 0
            ? Math.round(daysWithRecovery.reduce((sum, d) => sum + (d.recovery || 0), 0) / daysWithRecovery.length)
            : 0;

        const avgSleep = daysWithSleep.length > 0
            ? Math.round(daysWithSleep.reduce((sum, d) => sum + (d.sleepScore || 0), 0) / daysWithSleep.length)
            : 0;

        const avgStrain = daysWithStrain.length > 0
            ? Number((daysWithStrain.reduce((sum, d) => sum + (d.strain || 0), 0) / daysWithStrain.length).toFixed(1))
            : 0;

        const avgHrv = daysWithHrv.length > 0
            ? Math.round(daysWithHrv.reduce((sum, d) => sum + (d.hrv || 0), 0) / daysWithHrv.length)
            : 0;

        const avgRhr = daysWithRhr.length > 0
            ? Math.round(daysWithRhr.reduce((sum, d) => sum + (d.rhr || 0), 0) / daysWithRhr.length)
            : 0;

        const avgCalories = daysWithCalories.length > 0
            ? Math.round(daysWithCalories.reduce((sum, d) => sum + (d.calories || 0), 0) / daysWithCalories.length)
            : 0;

        const avgSleepHours = daysWithSleepHours.length > 0
            ? Number((daysWithSleepHours.reduce((sum, d) => sum + (d.sleepHours || 0), 0) / daysWithSleepHours.length).toFixed(1))
            : 0;

        const totalTasksCompleted = weekData.reduce((sum, d) => sum + d.tasksCompleted, 0);

        return {
            avgHabitCompletion,
            avgRecovery,
            avgSleep,
            avgStrain,
            avgHrv,
            avgRhr,
            avgCalories,
            avgSleepHours,
            workoutCount: workouts.length,
            totalTasksCompleted,
        };
    }, [weekData, workouts]);

    // --- Navigation ---
    const goToPrevWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
    const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));

    // --- Color helpers ---
    const getScoreTextColor = (score: number): string => {
        if (score >= 85) return 'text-athena-gold';
        if (score >= 70) return 'text-athena-gold/80';
        if (score >= 50) return 'text-athena-gold/60';
        if (score >= 1) return 'text-athena-gold/40';
        return 'text-athena-text-muted';
    };

    const getRecoveryTextColor = (score: number): string => {
        if (score >= 67) return 'text-athena-green';
        if (score >= 34) return 'text-athena-green/60';
        return 'text-athena-green/30';
    };

    const isFutureDay = (day: Date) => isAfter(day, today);

    const getWorkoutBorderColor = (sportName: string): string => {
        const name = sportName.toLowerCase();
        if (/push|pull|legs|lifting|strength|functional/.test(name)) return 'border-athena-gold';
        if (/run|running|cycling|swimming|cardio/.test(name)) return 'border-athena-strain';
        if (/recovery|yoga|stretch|stretching/.test(name)) return 'border-green-500';
        return 'border-athena-border';
    };

    return (
        <div className="min-h-screen bg-athena-bg text-athena-text-primary">
            {/* Ambient Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-athena-gold/5 rounded-full blur-[120px]" />
            </div>

            <AthenaNavBar activeTab="week" />

            {/* ==================== MOBILE LAYOUT ==================== */}
            <div className="md:hidden relative z-10 px-4 py-4 pb-20 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <button onClick={goToPrevWeek} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-white/[0.06] active:bg-white/[0.04]">
                        <ChevronLeft className="w-5 h-5 text-white/30" />
                    </button>
                    <h1 className="text-base font-serif text-athena-text-warm"
                        onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
                    >
                        {format(currentWeekStart, 'MMM d')} &ndash; {format(weekEnd, 'MMM d')}
                    </h1>
                    <button onClick={goToNextWeek} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-white/[0.06] active:bg-white/[0.04]">
                        <ChevronRight className="w-5 h-5 text-white/30" />
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-athena-gold/30 border-t-athena-gold rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* 7-Day Strip */}
                        <div className="grid grid-cols-7 gap-1">
                            {weekData.map((day, i) => {
                                const isToday = isSameDay(day.date, today);
                                const isFuture = isFutureDay(day.date);
                                return (
                                    <div
                                        key={day.dateStr}
                                        onClick={() => { setSelectedDayIndex(i); setMobileDayDrawerOpen(true); }}
                                        className={cn(
                                            "flex flex-col items-center py-2 rounded-xl border transition-all active:scale-[0.96]",
                                            isToday ? "ring-1 ring-athena-gold/30 border-transparent" : "border-white/[0.06]",
                                            isFuture && "opacity-40",
                                        )}
                                    >
                                        <span className="text-[11px] text-white/30 font-sans">{format(day.date, 'EEE').charAt(0)}</span>
                                        <span className="text-sm font-medium text-athena-text-warm">{format(day.date, 'd')}</span>
                                        <div className={cn(
                                            "mt-1 w-9 h-9 rounded-md flex items-center justify-center text-[11px] font-bold text-white",
                                            day.hasData ? getDayScoreColor(day.dayScore) : "bg-white/[0.06]"
                                        )}>
                                            {day.hasData ? day.dayScore : '—'}
                                        </div>
                                        {whoopEnabled && day.recovery !== null && (
                                            <span className="text-[10px] mt-0.5 font-medium text-white/25">
                                                {day.recovery}%
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Week Stats */}
                        <div>
                            <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">Weekly Averages</h2>
                            <div className="grid grid-cols-4 gap-1.5">
                                {[
                                    { label: 'Habits', value: `${stats.avgHabitCompletion}%`, show: true, color: 'text-athena-gold' },
                                    { label: 'Recovery', value: `${stats.avgRecovery}%`, show: whoopEnabled, color: 'text-athena-green' },
                                    { label: 'Strain', value: `${stats.avgStrain}`, show: whoopEnabled, color: 'text-athena-strain' },
                                    { label: 'Sleep', value: `${stats.avgSleep}%`, show: whoopEnabled, color: 'text-athena-purple' },
                                    { label: 'HRV', value: `${stats.avgHrv}`, show: whoopEnabled, color: 'text-athena-green' },
                                    { label: 'RHR', value: `${stats.avgRhr}`, show: whoopEnabled, color: 'text-athena-green' },
                                    { label: 'Sleep', value: `${stats.avgSleepHours}h`, show: whoopEnabled, color: 'text-athena-purple' },
                                    { label: 'Workouts', value: `${stats.workoutCount}`, show: true, color: 'text-athena-gold' },
                                ].filter(s => s.show).map(s => (
                                    <div key={s.label + s.value} className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                        <span className={`text-sm font-serif font-bold tabular-nums ${s.color}`}>{s.value}</span>
                                        <span className="text-[10px] text-white/25 uppercase tracking-wider">{s.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 7-Day Habit Grid */}
                        {habitRows.length > 0 && (
                            <div>
                                <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">Habits</h2>
                                <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] overflow-hidden">
                                    {/* Day header row */}
                                    <div className="grid items-center px-3 py-1.5 border-b border-white/[0.04]" style={{ gridTemplateColumns: 'minmax(0, 3fr) repeat(7, 1fr)' }}>
                                        <span />
                                        {weekDays.map((day, di) => (
                                            <span key={di} className="text-[10px] text-white/20 text-center font-medium">
                                                {format(day, 'EEE').charAt(0)}
                                            </span>
                                        ))}
                                    </div>
                                    {/* Habit rows */}
                                    {habitRows.map((row) => {
                                        return (
                                            <div key={row.title} className="grid items-center px-3 py-2 border-b border-white/[0.04] last:border-0" style={{ gridTemplateColumns: 'minmax(0, 3fr) repeat(7, 1fr)' }}>
                                                <span className="text-[12px] text-athena-text-warm pr-2 leading-tight">{row.title}</span>
                                                {row.days.map((completed, di) => {
                                                    const isFuture = isFutureDay(weekDays[di]);
                                                    return (
                                                        <div key={di} className="flex justify-center">
                                                            <div
                                                                className={cn(
                                                                    "w-3 h-3 rounded-full",
                                                                    isFuture ? "bg-transparent border border-white/[0.08]" :
                                                                    completed ? "bg-athena-green" : "bg-white/[0.06]"
                                                                )}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Mobile Day Detail Drawer */}
            <MobileDrawerSheet open={mobileDayDrawerOpen} onClose={() => setMobileDayDrawerOpen(false)} title={selectedDayIndex !== null && weekData[selectedDayIndex] ? format(weekData[selectedDayIndex].date, 'EEEE, MMM d') : ''}>
                {selectedDayIndex !== null && weekData[selectedDayIndex] && (() => {
                    const day = weekData[selectedDayIndex];
                    return (
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { label: 'Habits', value: `${day.habitsCompleted}/${day.totalHabits}`, show: true },
                                { label: 'Day Score', value: day.hasData ? `${day.dayScore}%` : '--', show: true },
                                { label: 'Recovery', value: day.recovery !== null ? `${day.recovery}%` : '--', show: whoopEnabled },
                                { label: 'Strain', value: day.strain !== null ? `${day.strain.toFixed(1)}` : '--', show: whoopEnabled },
                                { label: 'Sleep', value: day.sleepScore !== null ? `${day.sleepScore}%` : '--', show: whoopEnabled },
                                { label: 'HRV', value: day.hrv !== null ? `${Math.round(day.hrv)}` : '--', show: whoopEnabled },
                                { label: 'RHR', value: day.rhr !== null ? `${Math.round(day.rhr)}` : '--', show: whoopEnabled },
                                { label: 'Sleep Hours', value: day.sleepHours !== null ? `${day.sleepHours.toFixed(1)}h` : '--', show: whoopEnabled },
                            ].filter(item => item.show).map(item => (
                                <div key={item.label} className="flex flex-col items-center justify-center text-center rounded-xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2">
                                    <span className="text-lg font-serif font-bold tabular-nums leading-tight text-athena-text-warm">{item.value}</span>
                                    <span className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">{item.label}</span>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </MobileDrawerSheet>

            {/* Mobile Weekly Report Drawer */}
            <MobileDrawerSheet open={mobileReportDrawerOpen} onClose={() => setMobileReportDrawerOpen(false)} title=" " fullScreen>
                <WeeklyReportPanel weekStart={format(currentWeekStart, 'yyyy-MM-dd')} />
            </MobileDrawerSheet>

            {/* Mobile Workouts Drawer */}
            <MobileDrawerSheet open={mobileWorkoutsDrawerOpen} onClose={() => setMobileWorkoutsDrawerOpen(false)} title="Workouts">
                {workouts.length > 0 ? (
                    <div className="space-y-1.5">
                        {workouts.map((w, i) => (
                            <div key={i} className={cn("flex items-center justify-between px-3 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] border-l-2", getWorkoutBorderColor(w.sportName))}>
                                <div className="flex items-center gap-2 min-w-0">
                                    <Dumbbell className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <span className="text-[13px] text-athena-text-warm block truncate">{w.sportName}</span>
                                        <span className="text-[11px] text-white/20">{format(parseISO(w.date), 'EEE, MMM d')}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-white/30 flex-shrink-0 tabular-nums">
                                    {w.strain !== null && (
                                        <span className="flex items-center gap-0.5">
                                            <Zap className="w-3 h-3 text-white/25" />
                                            {Number(w.strain).toFixed(1)}
                                        </span>
                                    )}
                                    {w.durationMinutes !== null && <span>{Math.round(w.durationMinutes)}m</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-white/25 text-center py-8">No workouts this week</p>
                )}
            </MobileDrawerSheet>

            {/* Mobile Bottom Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
                <div className="bg-athena-bg/90 backdrop-blur-xl border-t border-white/[0.04] flex justify-around items-center py-2 px-4">
                    <button
                        onClick={() => setMobileReportDrawerOpen(true)}
                        className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center"
                    >
                        <Zap size={18} className="text-white/25" />
                        <span className="text-[10px] text-white/25">Brief</span>
                    </button>
                    <button
                        onClick={() => setMobileWorkoutsDrawerOpen(true)}
                        className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center"
                    >
                        <Dumbbell size={18} className="text-white/25" />
                        <span className="text-[10px] text-white/25">Workouts</span>
                    </button>
                </div>
            </div>

            {/* ==================== DESKTOP LAYOUT ==================== */}
            <div className="hidden md:block relative z-10 px-4 md:px-8 lg:px-16 py-6 max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <div className="text-[10px] text-athena-text-muted uppercase tracking-[0.3em] font-semibold mb-2 font-sans">Weekly Overview</div>
                        <h1 className="text-2xl md:text-4xl lg:text-5xl font-serif mt-2">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-athena-gold to-athena-gold-pale">
                                {format(currentWeekStart, 'MMM d')}
                            </span>
                            <span className="text-athena-text-primary mx-2">&ndash;</span>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-athena-gold to-athena-gold-pale">
                                {format(weekEnd, 'MMM d, yyyy')}
                            </span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={goToPrevWeek}
                            className="p-2 rounded-lg border border-athena-border hover:bg-athena-gold/10 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-athena-gold" />
                        </button>
                        <button
                            onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
                            className="px-3 py-1.5 text-xs font-sans rounded-lg border border-athena-border hover:bg-athena-gold/10 text-athena-text-muted transition-colors"
                        >
                            This Week
                        </button>
                        <button
                            onClick={goToNextWeek}
                            className="p-2 rounded-lg border border-athena-border hover:bg-athena-gold/10 transition-colors"
                        >
                            <ChevronRight className="w-5 h-5 text-athena-gold" />
                        </button>
                    </div>
                </motion.div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-2 border-athena-gold/30 border-t-athena-gold rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Section 1: Week at a Glance */}
                        <motion.section
                            variants={sectionFade}
                            initial="hidden"
                            animate="visible"
                        >
                            <h2 className="text-lg font-serif text-athena-gold mb-3">Week at a Glance</h2>
                            <div>
                                <div className="grid grid-cols-7 gap-1 md:gap-3">
                                    {weekData.map((day, i) => {
                                        const isToday = isSameDay(day.date, today);
                                        const isFuture = isFutureDay(day.date);

                                        return (
                                            <motion.div
                                                key={day.dateStr}
                                                custom={i}
                                                variants={fadeSlide}
                                                initial="hidden"
                                                animate="visible"
                                                className={cn(
                                                    "flex flex-col items-center p-3 rounded-xl border transition-all",
                                                    isToday
                                                        ? "border-athena-gold shadow-[0_0_12px_rgb(var(--athena-gold))] bg-athena-gold/5"
                                                        : "border-athena-border bg-white/[0.02]",
                                                    isFuture && "opacity-40"
                                                )}
                                            >
                                                <span className="text-xs font-sans text-athena-text-muted">
                                                    {format(day.date, 'EEE')}
                                                </span>
                                                <span className={cn(
                                                    "text-sm font-medium mt-0.5",
                                                    isToday ? "text-athena-gold" : "text-athena-text-primary"
                                                )}>
                                                    {format(day.date, 'd')}
                                                </span>

                                                {/* Day Score */}
                                                <div className={cn(
                                                    "mt-2 w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center text-sm font-bold",
                                                    day.hasData ? getDayScoreColor(day.dayScore) : 'bg-white/[0.06]',
                                                    "text-white"
                                                )}>
                                                    {day.hasData ? day.dayScore : '—'}
                                                </div>

                                                {/* Recovery */}
                                                {whoopEnabled && day.recovery !== null && (
                                                    <span className={cn(
                                                        "text-[10px] mt-1.5 font-medium",
                                                        getRecoveryTextColor(day.recovery)
                                                    )}>
                                                        {day.recovery}% rec
                                                    </span>
                                                )}

                                                {/* Habits fraction */}
                                                <span className="text-[10px] mt-1 text-athena-text-muted">
                                                    {day.habitsCompleted}/{day.totalHabits}
                                                </span>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.section>

                        {/* Section 2: Week Stats */}
                        <motion.section
                            variants={sectionFade}
                            initial="hidden"
                            animate="visible"
                            transition={{ delay: 0.1 }}
                        >
                            <h2 className="text-lg font-serif text-athena-gold mb-3">Week Stats</h2>
                            <DataMaturityProvider>
                            <DataGate feature="weekStats" compact>
                            <div className={cn("grid grid-cols-2 gap-3", whoopEnabled ? "md:grid-cols-3 lg:grid-cols-6" : "md:grid-cols-3")}>
                                {(() => {
                                    const daysAbove80 = weekData.filter(d => d.totalHabits > 0 && (d.habitsCompleted / d.totalHabits) * 100 >= 80).length;
                                    const totalWorkoutMinutes = Math.round(workouts.reduce((sum, w) => sum + (w.durationMinutes || 0), 0));

                                    const allCards = [
                                        { label: 'Avg. Habits', value: `${stats.avgHabitCompletion}%`, icon: Check, color: 'text-athena-gold', sub: `${daysAbove80}/7 days above 80%`, delta: prevWeekDeltas.habits, deltaUnit: '%', higherIsBetter: true, isWhoop: false },
                                        { label: 'Avg. Recovery', value: `${stats.avgRecovery}%`, icon: Heart, color: 'text-athena-green', sub: `HRV ${stats.avgHrv} · RHR ${stats.avgRhr}`, delta: prevWeekDeltas.recovery, deltaUnit: '%', higherIsBetter: true, isWhoop: true },
                                        { label: 'Avg. Strain', value: `${stats.avgStrain}`, icon: Zap, color: 'text-athena-strain', sub: `${stats.avgCalories.toLocaleString()} cal/day`, delta: prevWeekDeltas.strain, deltaUnit: '', higherIsBetter: null, isWhoop: true },
                                        { label: 'Avg. Sleep', value: `${stats.avgSleep}%`, icon: Moon, color: 'text-athena-purple', sub: `${stats.avgSleepHours}h avg`, delta: prevWeekDeltas.sleep, deltaUnit: '%', higherIsBetter: true, isWhoop: true },
                                        { label: 'Workouts', value: `${stats.workoutCount}`, icon: Dumbbell, color: 'text-athena-gold', sub: `${totalWorkoutMinutes} min total`, delta: null, deltaUnit: '', higherIsBetter: null, isWhoop: false },
                                        { label: 'Project Tasks', value: `${projectTasksDone}`, icon: ListChecks, color: 'text-athena-gold', sub: `${projectTasksTotal} total open`, delta: null, deltaUnit: '', higherIsBetter: null, isWhoop: false },
                                    ];

                                    return allCards.filter(c => whoopEnabled || !c.isWhoop);
                                })().map((stat, i) => (
                                    <motion.div
                                        key={stat.label}
                                        custom={i}
                                        variants={fadeSlide}
                                        initial="hidden"
                                        animate="visible"
                                        className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            {stat.delta !== null && stat.delta !== undefined ? (
                                                <span className={cn(
                                                    "text-[10px] font-medium",
                                                    stat.higherIsBetter === null
                                                        ? "text-athena-text-muted"
                                                        : stat.higherIsBetter
                                                            ? stat.delta > 0 ? "text-athena-green" : stat.delta < 0 ? "text-athena-red" : "text-athena-text-muted"
                                                            : stat.delta < 0 ? "text-athena-green" : stat.delta > 0 ? "text-athena-red" : "text-athena-text-muted"
                                                )}>
                                                    {stat.delta > 0 ? '↑' : '↓'}{Math.abs(stat.delta)}{stat.deltaUnit}
                                                </span>
                                            ) : <span />}
                                            <stat.icon className={cn("w-5 h-5", stat.color)} />
                                        </div>
                                        <div className={cn("text-2xl md:text-3xl font-serif", stat.color)}>{stat.value}</div>
                                        <div className="text-[11px] text-athena-text-muted mt-1">{stat.label}</div>
                                        {stat.sub && <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{stat.sub}</div>}
                                    </motion.div>
                                ))}
                            </div>
                            </DataGate>
                            </DataMaturityProvider>
                        </motion.section>

                        {/* Section 3: Habit Patterns */}
                        <motion.section
                            variants={sectionFade}
                            initial="hidden"
                            animate="visible"
                            transition={{ delay: 0.2 }}
                        >
                            <h2 className="text-lg font-serif text-athena-gold mb-3">Habit Patterns</h2>
                            {habitRows.length === 0 ? (
                                <div className="text-athena-text-muted text-sm p-4 border border-athena-border rounded-xl bg-white/[0.02]">
                                    No habit data for this week.
                                </div>
                            ) : (
                                <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
                                    <div className="min-w-max md:min-w-0 border border-athena-border rounded-xl bg-white/[0.02] overflow-hidden">
                                        {/* Header row */}
                                        <div className="grid grid-cols-[100px_repeat(7,1fr)] md:grid-cols-[180px_repeat(7,1fr)] border-b border-athena-border">
                                            <div className="px-3 py-2 text-xs font-sans text-athena-text-muted">Habit</div>
                                            {weekDays.map(day => (
                                                <div key={day.toISOString()} className={cn(
                                                    "px-2 py-2 text-xs font-sans text-center",
                                                    isSameDay(day, today) ? "text-athena-gold font-medium" : "text-athena-text-muted"
                                                )}>
                                                    {format(day, 'EEE')}
                                                </div>
                                            ))}
                                        </div>
                                        {/* Habit rows */}
                                        {habitRows.map((row, ri) => (
                                            <div
                                                key={row.title}
                                                className={cn(
                                                    "grid grid-cols-[100px_repeat(7,1fr)] md:grid-cols-[180px_repeat(7,1fr)]",
                                                    ri < habitRows.length - 1 && "border-b border-athena-border/50"
                                                )}
                                            >
                                                <div className="px-3 py-2 text-xs font-sans text-athena-text-primary truncate">
                                                    {row.title}
                                                </div>
                                                {row.days.map((completed, di) => {
                                                    const isFuture = isFutureDay(weekDays[di]);
                                                    return (
                                                        <div key={di} className={cn(
                                                            "flex items-center justify-center py-2",
                                                            isFuture && "opacity-30"
                                                        )}>
                                                            {completed ? (
                                                                <div className="w-5 h-5 rounded bg-athena-green/20 flex items-center justify-center">
                                                                    <Check className="w-3.5 h-3.5 text-athena-green" />
                                                                </div>
                                                            ) : (
                                                                <div className="w-5 h-5 rounded bg-white/[0.03]" />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.section>

                        {/* Section 4: Workout Summary */}
                        <motion.section
                            variants={sectionFade}
                            initial="hidden"
                            animate="visible"
                            transition={{ delay: 0.3 }}
                        >
                            <h2 className="text-lg font-serif text-athena-gold mb-3">Workout Summary</h2>
                            {workouts.length === 0 ? (
                                <div className="text-athena-text-muted text-sm p-4 border border-athena-border rounded-xl bg-white/[0.02]">
                                    No workouts logged this week.
                                </div>
                            ) : (
                                <div className="border border-athena-border rounded-xl bg-white/[0.02] overflow-hidden divide-y divide-athena-border/50">
                                    {workouts.map((w, i) => (
                                        <div key={i} className="flex items-center justify-between px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <Dumbbell className="w-4 h-4 text-athena-gold" />
                                                <div>
                                                    <span className="text-sm font-sans text-athena-text-primary">{w.sportName}</span>
                                                    <span className="text-xs text-athena-text-muted ml-2">
                                                        {format(parseISO(w.date), 'EEE, MMM d')}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 md:gap-4 text-xs text-athena-text-muted">
                                                {w.strain !== null && (
                                                    <span className="flex items-center gap-1">
                                                        <Zap className="w-3 h-3 text-athena-strain" />
                                                        {Number(w.strain).toFixed(1)} strain
                                                    </span>
                                                )}
                                                {w.durationMinutes !== null && (
                                                    <span>{Math.round(w.durationMinutes)} min</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {/* Total strain for workouts */}
                                    <div className="px-4 py-2 bg-white/[0.02] flex justify-between text-xs text-athena-text-muted">
                                        <span>{workouts.length} workout{workouts.length !== 1 ? 's' : ''}</span>
                                        <span>
                                            Total: {Math.round(workouts.reduce((sum, w) => sum + (w.durationMinutes || 0), 0))} min
                                            {' / '}
                                            {workouts.reduce((sum, w) => sum + (w.strain || 0), 0).toFixed(1)} strain
                                        </span>
                                    </div>
                                </div>
                            )}
                        </motion.section>

                        <WeeklyReportPanel weekStart={format(currentWeekStart, 'yyyy-MM-dd')} />
                    </>
                )}
            </div>
        </div>
    );
}
