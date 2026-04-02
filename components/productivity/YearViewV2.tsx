'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { format, startOfYear, endOfYear, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, addYears, subYears, getDay, startOfDay, parseISO } from 'date-fns';
import {
    ChevronLeft, ChevronRight, ChevronDown, Moon, Activity, Zap,
    TrendingUp, Trophy, Calendar as CalendarIcon,
    ArrowUpRight, ArrowDownRight, BookOpen, Check,
    Plus, Edit2, Heart, Dumbbell, Target, ListChecks,
    CheckCircle, Circle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDayScoreColor, getRecoveryColor, getSleepScoreColor, getStrainColor } from '@/lib/theme';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { UnifiedGoalsModal } from './goals/UnifiedGoalsModal';
import { AthenaNavBar } from './AthenaNavBar';
import YearlyReportPanel from './reports/YearlyReportPanel';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { DataMaturityProvider, DataGate } from '@/components/productivity/DataGate';
import { MobileDrawerSheet } from '@/components/mobile/MobileDrawerSheet';

// --- Types ---
interface DailyLog {
    date: string;
    habit_score: number;
    habit_count?: number;
    whoop_recovery?: number;
    whoop_strain?: number;
    whoop_sleep_score?: number;
    whoop_sleep_hours?: number;
    whoop_hrv?: number;
    whoop_resting_hr?: number;
    whoop_calories?: number;
    whoop_sleep_start?: string;
    whoop_sleep_end?: string;
    whoop_sleep_consistency?: number;
    whoop_sleep_efficiency?: number;
    whoop_sleep_stage_light_mins?: number;
    whoop_sleep_stage_deep_mins?: number;
    whoop_sleep_stage_rem_mins?: number;
    whoop_sleep_stage_awake_mins?: number;
    whoop_sleep_debt?: number;
    whoop_sleep_debt_corrected?: number;
    whoop_sleep_need?: number;
    whoop_respiratory_rate?: number;
    whoop_skin_temp?: number;
    whoop_max_hr?: number;
    whoop_average_hr?: number;
}

interface YearlyGoal {
    id: string;
    year: number;
    title: string;
    category: 'Health' | 'Growth' | 'Athena' | 'Work';
    current_value: number;
    target_value: number;
    unit: string;
    linked_metric: 'none' | 'books_read' | 'workouts' | 'avg_recovery' | 'avg_sleep' | 'avg_strain';
    status: 'active' | 'completed' | 'archived';
}

// --- Animations (matching Week view pattern) ---
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

// --- Category icon/color mapping for goals ---
const categoryConfig: Record<string, { icon: typeof Target; color: string; barColor: string }> = {
    Health: { icon: Heart, color: 'text-athena-green', barColor: 'bg-athena-green' },
    Growth: { icon: BookOpen, color: 'text-athena-purple', barColor: 'bg-athena-purple' },
    Athena: { icon: Zap, color: 'text-athena-gold', barColor: 'bg-athena-gold' },
    Work: { icon: TrendingUp, color: 'text-athena-strain', barColor: 'bg-athena-strain' },
};

export default function YearViewV2() {
    const { whoopEnabled } = useWhoopMode();
    const router = useRouter();
    const supabaseClient = createClient();
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [activeCalendarMetric, setActiveCalendarMetric] = useState<'day' | 'recovery' | 'strain' | 'sleep'>('day');
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(new Date());

    // Data State
    const [logs, setLogs] = useState<DailyLog[]>([]);
    const [workouts, setWorkouts] = useState<any[]>([]);
    const [dailyTasks, setDailyTasks] = useState<any[]>([]);
    const [goals, setGoals] = useState<YearlyGoal[]>([]);
    const [projectTasksDone, setProjectTasksDone] = useState(0);
    const [projectTasksTotal, setProjectTasksTotal] = useState(0);

    // Modal State
    const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState<YearlyGoal | null>(null);
    const [mobileGoalsDrawerOpen, setMobileGoalsDrawerOpen] = useState(false);
    const [mobileStreaksDrawerOpen, setMobileStreaksDrawerOpen] = useState(false);
    const [mobileBreakdownDrawerOpen, setMobileBreakdownDrawerOpen] = useState(false);

    // --- Clock Effect ---
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // --- Data Fetching ---
    const fetchData = useCallback(async () => {
        setLoading(true);
        const start = `${currentYear}-01-01`;
        const end = `${currentYear}-12-31`;

        try {
            const historyRes = await fetch(`/api/productivity/history?start=${start}&end=${end}`);
            if (historyRes.ok) {
                const data = await historyRes.json();
                if (data.history) setLogs(data.history);
            }

            const workoutsRes = await fetch(`/api/productivity/workouts`);
            if (workoutsRes.ok) {
                const data = await workoutsRes.json();
                if (data.workouts) {
                    const yearWorkouts = data.workouts.filter((w: any) => w.date.startsWith(currentYear.toString()));
                    setWorkouts(yearWorkouts);
                }
            }

            const goalsRes = await fetch(`/api/goals/year?year=${currentYear}`);
            if (goalsRes.ok) {
                const data = await goalsRes.json();
                setGoals(data.goals || []);
            }

            // Fetch from previous year too for accurate streak calculation
            const { data: taskData, error: taskError } = await supabaseClient
                .from('daily_tasks')
                .select('*')
                .gte('date', `${currentYear - 1}-01-01`)
                .lte('date', `${currentYear}-12-31`);

            if (taskError) {
                console.error("Error fetching daily tasks:", taskError);
            } else {
                setDailyTasks(taskData || []);
            }

            // Fetch project tasks completed this year
            const [
                { data: doneProjectTasks },
                { count: totalProjectTasks }
            ] = await Promise.all([
                supabaseClient.from('tasks').select('id').eq('status', 'Done')
                    .gte('completed_at', start).lte('completed_at', end + 'T23:59:59.999Z'),
                supabaseClient.from('tasks').select('*', { count: 'exact', head: true })
                    .neq('status', 'Done')
            ]);
            setProjectTasksDone(doneProjectTasks?.length || 0);
            setProjectTasksTotal((doneProjectTasks?.length || 0) + (totalProjectTasks || 0));

        } catch (error) {
            console.error("Failed to fetch year data", error);
        } finally {
            setLoading(false);
        }
    }, [currentYear]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // --- Helpers ---
    const handlePrevYear = () => setCurrentYear(y => y - 1);
    const handleNextYear = () => setCurrentYear(y => y + 1);

    // --- Averages Calculation ---
    const averages = useMemo(() => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        const validLogs = logs.filter(l => {
            const date = new Date(l.date);
            return date <= today;
        });

        if (!validLogs.length) return { day: 0, habits: 0, recovery: 0, hrv: 0, rhr: 0, strain: 0, calories: 0, sleep: 0, sleep_hours: 0 };

        const avg = (key: keyof DailyLog) => {
            const values = validLogs.map(l => l[key] as number).filter(v => v != null);
            if (!values.length) return 0;
            return values.reduce((a, b) => a + b, 0) / values.length;
        };

        return {
            day: Math.round(avg('habit_score')),
            habits: Number(avg('habit_count').toFixed(1)),
            recovery: Math.round(avg('whoop_recovery')),
            hrv: Math.round(avg('whoop_hrv')),
            rhr: Math.round(avg('whoop_resting_hr')),
            strain: Number(avg('whoop_strain').toFixed(1)),
            calories: Math.round(avg('whoop_calories')),
            sleep: Math.round(avg('whoop_sleep_score')),
            sleep_hours: Number(avg('whoop_sleep_hours').toFixed(1))
        };
    }, [logs]);

    // Best month — composite score (habits + recovery + sleep averaged)
    const bestMonthData = useMemo(() => {
        const monthAbbrevs = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let bestMonth = '--';
        let bestAvg = 0;
        for (let m = 0; m < 12; m++) {
            const prefix = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
            const monthLogs = logs.filter(l => l.date.startsWith(prefix) && l.habit_score != null);
            if (monthLogs.length > 0) {
                const avg = monthLogs.reduce((s, l) => {
                    let sum = l.habit_score || 0;
                    let count = 1;
                    if (whoopEnabled) {
                        if (l.whoop_recovery != null && l.whoop_recovery > 0) { sum += l.whoop_recovery; count++; }
                        if (l.whoop_sleep_score != null && l.whoop_sleep_score > 0) { sum += l.whoop_sleep_score; count++; }
                    }
                    return s + Math.round(sum / count);
                }, 0) / monthLogs.length;
                if (avg > bestAvg) {
                    bestAvg = avg;
                    bestMonth = monthAbbrevs[m];
                }
            }
        }
        return { name: bestMonth, score: Math.round(bestAvg) };
    }, [logs, currentYear, whoopEnabled]);
    // Keep backward compat for desktop
    const bestHabitMonth = bestMonthData.name;

    // Group days by month for the grid headers
    const months = useMemo(() => {
        return Array.from({ length: 12 }, (_, i) => new Date(currentYear, i, 1));
    }, [currentYear]);

    // Memoize log lookup map for O(1) heatmap cell access
    const logsByDate = useMemo(() => {
        const map = new Map<string, DailyLog>();
        for (const log of logs) {
            map.set(log.date, log);
        }
        return map;
    }, [logs]);

    // Metrics for Monthly Reports List
    const monthlyStats = useMemo(() => {
        return months.map(monthDate => {
            const mStart = format(monthDate, 'yyyy-MM-01');
            const monthLogs = logs.filter(l => l.date.startsWith(format(monthDate, 'yyyy-MM')));

            const isFuture = monthDate > new Date();
            const isCurrent = isSameMonth(monthDate, new Date());
            const status = isFuture ? 'Pending' : isCurrent ? 'In Progress' : 'Complete';

            const score = monthLogs.length ? Math.round(monthLogs.reduce((a, b) => a + (b.habit_score || 0), 0) / monthLogs.length) : 0;

            const avg = (key: keyof DailyLog) => {
                const values = monthLogs.map(l => l[key] as number).filter(v => v != null);
                if (!values.length) return 0;
                return values.reduce((a, b) => a + b, 0) / values.length;
            };

            return {
                date: monthDate,
                name: format(monthDate, 'MMMM'),
                shortName: format(monthDate, 'MMM'),
                status,
                score,
                recovery: Math.round(avg('whoop_recovery')),
                strain: Number(avg('whoop_strain').toFixed(1)),
                sleep: Math.round(avg('whoop_sleep_score'))
            };
        });
    }, [months, logs]);

    // --- Habit Streaks (from API, same as Today view) ---
    const [habitStreaks, setHabitStreaks] = useState<{ name: string; streak: number; longest: number; totalCompleted: number; bestThisYear: number; bestStreakStart: string | null; bestStreakEnd: string | null }[]>([]);

    useEffect(() => {
        fetch('/api/productivity/streaks')
            .then(res => res.json())
            .then(data => {
                if (data.streaks) {
                    const raw = Object.entries(data.streaks as Record<string, { current: number; previousStreak: number; bestThisYear: number; bestStreakStart: string | null; bestStreakEnd: string | null }>)
                        .map(([name, s]) => ({
                            name,
                            streak: s.current,
                            longest: s.previousStreak,
                            totalCompleted: s.current + s.previousStreak,
                            bestThisYear: s.bestThisYear,
                            bestStreakStart: s.bestStreakStart,
                            bestStreakEnd: s.bestStreakEnd,
                        }))
                        .filter(h => h.streak > 0 || h.longest > 0 || h.bestThisYear > 0);

                    // Consolidate workout variations (Push/Pull/Legs/Gym) into single "Gym" entry
                    const isWorkoutName = (n: string) => {
                        const l = n.toLowerCase();
                        return l.startsWith('gym') || l.startsWith('push') || l.startsWith('pull') || l === 'legs' || l === 'workout';
                    };
                    const gymEntries = raw.filter(h => isWorkoutName(h.name));
                    const nonGymEntries = raw.filter(h => !isWorkoutName(h.name));
                    const entries = [...nonGymEntries];
                    if (gymEntries.length > 0) {
                        entries.push({
                            name: 'Gym',
                            streak: Math.max(...gymEntries.map(g => g.streak)),
                            longest: Math.max(...gymEntries.map(g => g.longest)),
                            totalCompleted: gymEntries.reduce((sum, g) => sum + g.totalCompleted, 0),
                            bestThisYear: Math.max(...gymEntries.map(g => g.bestThisYear)),
                            bestStreakStart: gymEntries.reduce((best, g) => g.bestThisYear > (best?.bestThisYear || 0) ? g : best, gymEntries[0]).bestStreakStart,
                            bestStreakEnd: gymEntries.reduce((best, g) => g.bestThisYear > (best?.bestThisYear || 0) ? g : best, gymEntries[0]).bestStreakEnd,
                        });
                    }
                    entries.sort((a, b) => b.streak - a.streak);
                    setHabitStreaks(entries);
                }
            })
            .catch(err => console.error('Failed to fetch streaks:', err));
    }, [currentYear]);

    // Max streak for bar scaling
    const maxStreak = useMemo(() => {
        if (!habitStreaks.length) return 1;
        return Math.max(...habitStreaks.map(h => h.streak), 1);
    }, [habitStreaks]);

    return (
        <div className="min-h-screen bg-athena-bg text-athena-text-primary">
            {/* Ambient Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-athena-gold/5 rounded-full blur-[120px]" />
            </div>

            <AthenaNavBar activeTab="year" />

            {/* ==================== MOBILE LAYOUT ==================== */}
            <div className="md:hidden relative z-10 px-4 py-4 pb-20 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <button onClick={handlePrevYear} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-white/[0.06] active:bg-white/[0.04]">
                        <ChevronLeft className="w-5 h-5 text-white/30" />
                    </button>
                    <h1 className="text-base font-serif text-athena-text-warm"
                        onClick={() => setCurrentYear(new Date().getFullYear())}
                    >
                        {currentYear}
                    </h1>
                    <button onClick={handleNextYear} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-white/[0.06] active:bg-white/[0.04]">
                        <ChevronRight className="w-5 h-5 text-white/30" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-athena-gold/30 border-t-athena-gold rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Yearly Averages — 4-column grid */}
                        <div>
                            <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">Yearly Averages</h2>
                            <div className="grid grid-cols-4 gap-1.5">
                                {[
                                    { label: 'Habits', value: `${averages.day}%`, show: true, color: 'text-athena-gold' },
                                    { label: 'Recovery', value: `${averages.recovery}%`, show: whoopEnabled, color: 'text-athena-green' },
                                    { label: 'Strain', value: `${averages.strain}`, show: whoopEnabled, color: 'text-athena-strain' },
                                    { label: 'Sleep', value: `${averages.sleep}%`, show: whoopEnabled, color: 'text-athena-purple' },
                                    { label: 'HRV', value: `${averages.hrv}`, show: whoopEnabled, color: 'text-athena-green' },
                                    { label: 'RHR', value: `${averages.rhr}`, show: whoopEnabled, color: 'text-athena-green' },
                                    { label: 'Sleep', value: `${averages.sleep_hours}h`, show: whoopEnabled, color: 'text-athena-purple' },
                                    { label: 'Workouts', value: `${workouts.length}`, show: true, color: 'text-athena-gold' },
                                ].filter(s => s.show).map(s => (
                                    <div key={s.label + s.value} className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                        <span className={`text-sm font-serif font-bold tabular-nums ${s.color}`}>{s.value}</span>
                                        <span className="text-[10px] text-white/25 uppercase tracking-wider">{s.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Year Highlights — personal bests */}
                        {(() => {
                            // Composite score for a log entry: avg of available metrics (habits, recovery, sleep)
                            const logComposite = (l: DailyLog) => {
                                let sum = l.habit_score || 0;
                                let count = 1;
                                if (whoopEnabled) {
                                    if (l.whoop_recovery != null && l.whoop_recovery > 0) { sum += l.whoop_recovery; count++; }
                                    if (l.whoop_sleep_score != null && l.whoop_sleep_score > 0) { sum += l.whoop_sleep_score; count++; }
                                }
                                return Math.round(sum / count);
                            };

                            // Best recovery day
                            const logsWithRecovery = logs.filter(l => l.whoop_recovery != null && l.whoop_recovery > 0);
                            const bestRecoveryLog = logsWithRecovery.length > 0
                                ? logsWithRecovery.reduce((best, l) => (l.whoop_recovery || 0) > (best.whoop_recovery || 0) ? l : best, logsWithRecovery[0])
                                : null;

                            // Peak strain day
                            const logsWithStrain = logs.filter(l => l.whoop_strain != null && l.whoop_strain > 0);
                            const peakStrainLog = logsWithStrain.length > 0
                                ? logsWithStrain.reduce((best, l) => (l.whoop_strain || 0) > (best.whoop_strain || 0) ? l : best, logsWithStrain[0])
                                : null;

                            // Best week (7-day rolling composite avg)
                            let bestWeekAvg = 0;
                            let bestWeekStart = '';
                            const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
                            for (let i = 0; i <= sortedLogs.length - 7; i++) {
                                const window = sortedLogs.slice(i, i + 7);
                                const avg = Math.round(window.reduce((s, l) => s + logComposite(l), 0) / 7);
                                if (avg > bestWeekAvg) {
                                    bestWeekAvg = avg;
                                    bestWeekStart = window[0].date;
                                }
                            }

                            // Non-WHOOP alternatives
                            const perfectDays = logs.filter(l => l.habit_score >= 100).length;
                            const topYearStreak = habitStreaks.length > 0
                                ? habitStreaks.reduce((best, h) => h.bestThisYear > best.bestThisYear ? h : best, habitStreaks[0])
                                : null;

                            return (
                                <div>
                                    <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">Highlights</h2>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                            <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{bestMonthData.score > 0 ? `${bestMonthData.score}%` : '--'}</span>
                                            <span className="text-[10px] text-white/25 uppercase tracking-wider">Best Mo.</span>
                                            {bestMonthData.name !== '--' && <span className="text-[10px] text-white/15 italic">{bestMonthData.name}</span>}
                                        </div>
                                        {whoopEnabled ? (
                                            <>
                                                <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                                    <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{bestRecoveryLog ? `${bestRecoveryLog.whoop_recovery}%` : '--'}</span>
                                                    <span className="text-[10px] text-white/25 uppercase tracking-wider">Best Rec.</span>
                                                    {bestRecoveryLog && <span className="text-[10px] text-white/15 italic">{format(parseISO(bestRecoveryLog.date), 'MMM d')}</span>}
                                                </div>
                                                <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                                    <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{peakStrainLog ? Number(peakStrainLog.whoop_strain).toFixed(1) : '--'}</span>
                                                    <span className="text-[10px] text-white/25 uppercase tracking-wider">Peak Strain</span>
                                                    {peakStrainLog && <span className="text-[10px] text-white/15 italic">{format(parseISO(peakStrainLog.date), 'MMM d')}</span>}
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                                    <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{perfectDays > 0 ? perfectDays : '--'}</span>
                                                    <span className="text-[10px] text-white/25 uppercase tracking-wider">Perfect Days</span>
                                                    {perfectDays > 0 && <span className="text-[10px] text-white/15 italic">100%</span>}
                                                </div>
                                                <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                                    <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{topYearStreak ? `${topYearStreak.bestThisYear}d` : '--'}</span>
                                                    <span className="text-[10px] text-white/25 uppercase tracking-wider">Top Streak</span>
                                                    {topYearStreak && <span className="text-[10px] text-white/15 italic truncate max-w-[60px]">{topYearStreak.name}</span>}
                                                </div>
                                            </>
                                        )}
                                        <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                            <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{bestWeekAvg > 0 ? `${bestWeekAvg}%` : '--'}</span>
                                            <span className="text-[10px] text-white/25 uppercase tracking-wider">Best Week</span>
                                            {bestWeekStart && <span className="text-[10px] text-white/15 italic">{format(parseISO(bestWeekStart), 'MMM d')}</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Consistency Grid */}
                        <div>
                            <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">Consistency</h2>
                            {whoopEnabled && (
                                <div className="flex gap-1 mb-2">
                                    {(['day', 'recovery', 'strain', 'sleep'] as const).map(m => (
                                        <button key={m} onClick={() => setActiveCalendarMetric(m)}
                                            className={cn("px-2 py-1 text-[10px] uppercase rounded-full min-h-[32px]",
                                                activeCalendarMetric === m ? "bg-white/[0.08] text-athena-text-warm font-bold" : "text-white/30"
                                            )}>
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="grid grid-cols-3 gap-2">
                                {months.map((monthDate) => {
                                    const monthStr = format(monthDate, 'yyyy-MM');
                                    const daysInMonth = eachDayOfInterval({ start: monthDate, end: new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0) });
                                    const firstDayOffset = monthDate.getDay();

                                    return (
                                        <button
                                            key={monthStr}
                                            onClick={() => router.push(`/productivity?tab=analytics&view=month-v2&month=${monthStr}`)}
                                            className="border border-white/[0.06] rounded-lg bg-white/[0.02] p-2 text-left active:bg-white/[0.04]"
                                        >
                                            <div className="text-[10px] font-medium text-white/30 mb-1">{format(monthDate, 'MMM')}</div>
                                            <div className="grid grid-cols-7 gap-[1px]">
                                                {Array.from({ length: firstDayOffset }).map((_, i) => (
                                                    <div key={`empty-${i}`} className="w-2 h-2" />
                                                ))}
                                                {daysInMonth.map((day) => {
                                                    const dateStr = format(day, 'yyyy-MM-dd');
                                                    const log = logsByDate.get(dateStr);
                                                    let colorClass = 'bg-white/[0.06]';
                                                    if (log) {
                                                        if (activeCalendarMetric === 'day') {
                                                            colorClass = getDayScoreColor(log.habit_score);
                                                        } else if (activeCalendarMetric === 'recovery') {
                                                            colorClass = log.whoop_recovery != null ? getRecoveryColor(log.whoop_recovery) : 'bg-white/[0.06]';
                                                        } else if (activeCalendarMetric === 'strain') {
                                                            colorClass = log.whoop_strain != null ? getStrainColor(log.whoop_strain) : 'bg-white/[0.06]';
                                                        } else if (activeCalendarMetric === 'sleep') {
                                                            colorClass = log.whoop_sleep_score != null ? getSleepScoreColor(log.whoop_sleep_score) : 'bg-white/[0.06]';
                                                        }
                                                    }
                                                    return <div key={dateStr} className={cn("w-2 h-2 rounded-[1px]", colorClass)} />;
                                                })}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Mobile Goals Drawer */}
            <MobileDrawerSheet open={mobileGoalsDrawerOpen} onClose={() => setMobileGoalsDrawerOpen(false)} title="Yearly Goals">
                <div className="space-y-2">
                    <button
                        onClick={() => { setMobileGoalsDrawerOpen(false); setSelectedGoal(null); setIsGoalsModalOpen(true); }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] active:bg-white/[0.04] min-h-[44px] mb-2"
                    >
                        <Plus size={14} className="text-white/25" />
                        <span className="text-[12px] text-white/30">Add Goal</span>
                    </button>
                    {goals.map((goal) => {
                        const isYesNo = goal.unit === 'yes_no';
                        const isComplete = isYesNo ? goal.current_value >= 1 : goal.current_value >= goal.target_value;
                        const pct = isYesNo ? (isComplete ? 100 : 0) : Math.round((goal.current_value / goal.target_value) * 100);

                        return (
                            <div
                                key={goal.id}
                                onClick={() => { setMobileGoalsDrawerOpen(false); setSelectedGoal(goal); setIsGoalsModalOpen(true); }}
                                className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] cursor-pointer active:bg-white/[0.04] min-h-[44px]"
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[13px] text-athena-text-warm">{goal.title}</span>
                                    {isYesNo ? (
                                        isComplete ? <CheckCircle className="w-4 h-4 text-athena-green flex-shrink-0" /> : <Circle className="w-4 h-4 text-white/20 flex-shrink-0" />
                                    ) : (
                                        <span className={cn("text-xs font-bold font-serif tabular-nums", isComplete ? "text-athena-green" : "text-athena-text-warm")}>
                                            {goal.current_value}/{goal.target_value}
                                        </span>
                                    )}
                                </div>
                                {!isYesNo && (
                                    <div className="w-full bg-white/[0.06] h-1 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", isComplete ? "bg-athena-green" : "bg-athena-gold/50")} style={{ width: `${Math.min(pct, 100)}%` }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {goals.length === 0 && (
                        <p className="text-sm text-white/25 text-center py-8">No yearly goals set</p>
                    )}
                </div>
            </MobileDrawerSheet>

            {/* Mobile Streaks Drawer */}
            <MobileDrawerSheet open={mobileStreaksDrawerOpen} onClose={() => setMobileStreaksDrawerOpen(false)} title="Habit Streaks">
                {habitStreaks.length > 0 ? (
                    <div className="space-y-1.5">
                        {habitStreaks.map((habit) => (
                            <div
                                key={habit.name}
                                className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] min-h-[44px]"
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-[13px] text-athena-text-warm flex-1 min-w-0">{habit.name}</span>
                                    <span className="text-xs font-bold font-serif text-athena-text-warm flex-shrink-0 tabular-nums">
                                        {habit.streak}d
                                    </span>
                                </div>
                                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-athena-gold/50"
                                        style={{ width: `${Math.max((habit.streak / maxStreak) * 100, 3)}%` }}
                                    />
                                </div>
                                {habit.bestThisYear > 0 && habit.streak !== habit.bestThisYear && (
                                    <div className="mt-1.5 text-[10px] text-white/20">
                                        Best: <span className="text-athena-text-warm font-bold">{habit.bestThisYear}d</span>
                                        {habit.bestStreakStart && habit.bestStreakEnd && (
                                            <span className="text-white/15 ml-1">
                                                ({new Date(habit.bestStreakStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(habit.bestStreakEnd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                                            </span>
                                        )}
                                    </div>
                                )}
                                {habit.bestThisYear > 0 && habit.streak === habit.bestThisYear && (
                                    <div className="mt-1.5 text-[10px] text-white/20">Current best</div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-white/25 text-center py-8">No streak data yet</p>
                )}
            </MobileDrawerSheet>

            {/* Mobile Breakdown Drawer */}
            <MobileDrawerSheet open={mobileBreakdownDrawerOpen} onClose={() => setMobileBreakdownDrawerOpen(false)} title="Monthly Breakdown">
                {monthlyStats.length > 0 ? (
                    <div className="space-y-1.5">
                        {monthlyStats.map((m) => (
                            <button
                                key={m.name}
                                onClick={() => { setMobileBreakdownDrawerOpen(false); router.push(`/productivity?tab=analytics&view=month-v2&month=${format(m.date, 'yyyy-MM')}`); }}
                                className="w-full p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] active:bg-white/[0.04] text-left min-h-[44px]"
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[13px] text-athena-text-warm">{m.name}</span>
                                    <span className="text-xs font-bold font-serif text-athena-text-warm tabular-nums">{m.score}%</span>
                                </div>
                                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-athena-gold/50"
                                        style={{ width: `${m.score}%` }}
                                    />
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-white/25 text-center py-8">No monthly data yet</p>
                )}
            </MobileDrawerSheet>

            {/* Mobile Bottom Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
                <div className="bg-athena-bg/90 backdrop-blur-xl border-t border-white/[0.04] flex justify-around items-center py-2 px-4">
                    <button
                        onClick={() => setMobileGoalsDrawerOpen(true)}
                        className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center"
                    >
                        <Target size={18} className="text-white/25" />
                        <span className="text-[10px] text-white/25">Goals</span>
                    </button>
                    <button
                        onClick={() => setMobileStreaksDrawerOpen(true)}
                        className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center"
                    >
                        <Trophy size={18} className="text-white/25" />
                        <span className="text-[10px] text-white/25">Streaks</span>
                    </button>
                    <button
                        onClick={() => setMobileBreakdownDrawerOpen(true)}
                        className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center"
                    >
                        <CalendarIcon size={18} className="text-white/25" />
                        <span className="text-[10px] text-white/25">Months</span>
                    </button>
                </div>
            </div>

            {/* ==================== DESKTOP LAYOUT ==================== */}
            <div className="hidden md:block relative z-10 px-4 md:px-8 lg:px-16 py-6 max-w-7xl mx-auto space-y-8">
                {/* HEADER */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <div className="text-[10px] text-athena-text-muted uppercase tracking-[0.3em] font-semibold mb-2 font-sans">Year Overview</div>
                        <h1 className="text-2xl md:text-4xl lg:text-5xl font-serif mt-2">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-athena-gold to-athena-gold-pale">
                                {currentYear}
                            </span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrevYear}
                            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-athena-border hover:bg-athena-gold/10 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-athena-gold" />
                        </button>
                        <button
                            onClick={() => setCurrentYear(new Date().getFullYear())}
                            className="px-3 py-1.5 min-h-[44px] text-xs font-sans rounded-lg border border-athena-border hover:bg-athena-gold/10 text-athena-text-muted transition-colors"
                        >
                            This Year
                        </button>
                        <button
                            onClick={handleNextYear}
                            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-athena-border hover:bg-athena-gold/10 transition-colors"
                        >
                            <ChevronRight className="w-5 h-5 text-athena-gold" />
                        </button>
                    </div>
                </motion.div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-2 border-athena-gold/30 border-t-athena-gold rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* SECTION: YEAR STATS */}
                        <motion.section
                            variants={sectionFade}
                            initial="hidden"
                            animate="visible"
                        >
                            <h2 className="text-lg font-serif text-athena-gold mb-3">Year Stats</h2>
                            <div className={cn("grid grid-cols-2 gap-3", whoopEnabled ? "md:grid-cols-4 lg:grid-cols-7" : "md:grid-cols-2 lg:grid-cols-4")}>
                                {[
                                    { label: 'Avg. Habits', value: `${averages.day}%`, icon: Check, color: 'text-athena-gold', sub: `Best: ${bestHabitMonth}`, isWhoop: false },
                                    { label: 'Avg. Recovery', value: `${averages.recovery}%`, icon: Heart, color: 'text-athena-green', sub: `HRV ${averages.hrv} · RHR ${averages.rhr}`, isWhoop: true },
                                    { label: 'Avg. Strain', value: `${averages.strain}`, icon: Zap, color: 'text-athena-strain', sub: `${averages.calories.toLocaleString()} cal/day`, isWhoop: true },
                                    { label: 'Avg. Sleep', value: `${averages.sleep}%`, icon: Moon, color: 'text-athena-purple', sub: `${averages.sleep_hours}h avg`, isWhoop: true },
                                    { label: 'Total Workouts', value: `${workouts.length}`, icon: Dumbbell, color: 'text-athena-gold', sub: `${(workouts.length / 12).toFixed(1)}/month`, isWhoop: false },
                                    { label: 'Project Tasks', value: `${projectTasksDone}`, icon: ListChecks, color: 'text-athena-gold', sub: `${projectTasksTotal} total open`, isWhoop: false },
                                    { label: 'Goals Finished', value: `${goals.filter(g => g.current_value >= g.target_value).length}`, icon: Target, color: 'text-athena-gold', sub: `${goals.length} total`, isWhoop: false },
                                ].filter(c => whoopEnabled || !c.isWhoop).map((stat, i) => (
                                    <motion.div
                                        key={stat.label}
                                        custom={i}
                                        variants={fadeSlide}
                                        initial="hidden"
                                        animate="visible"
                                        className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center"
                                    >
                                        <stat.icon className={cn("w-5 h-5 mx-auto mb-2", stat.color)} />
                                        <div className={cn("text-xl md:text-3xl font-serif", stat.color)}>{stat.value}</div>
                                        <div className="text-[11px] text-athena-text-muted mt-1">{stat.label}</div>
                                        {stat.sub && <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{stat.sub}</div>}
                                    </motion.div>
                                ))}
                            </div>
                        </motion.section>

                        {/* SECTION: HIGHLIGHTS */}
                        <motion.section variants={sectionFade} initial="hidden" animate="visible" transition={{ delay: 0.05 }}>
                            {(() => {
                                const logComposite = (l: DailyLog) => {
                                    let sum = l.habit_score || 0;
                                    let count = 1;
                                    if (l.whoop_recovery != null && l.whoop_recovery > 0) { sum += l.whoop_recovery; count++; }
                                    if (l.whoop_sleep_score != null && l.whoop_sleep_score > 0) { sum += l.whoop_sleep_score; count++; }
                                    return Math.round(sum / count);
                                };

                                const logsWithRecovery = logs.filter(l => l.whoop_recovery != null && l.whoop_recovery > 0);
                                const bestRecoveryLog = logsWithRecovery.length > 0
                                    ? logsWithRecovery.reduce((best, l) => (l.whoop_recovery || 0) > (best.whoop_recovery || 0) ? l : best, logsWithRecovery[0])
                                    : null;

                                const logsWithStrain = logs.filter(l => l.whoop_strain != null && l.whoop_strain > 0);
                                const peakStrainLog = logsWithStrain.length > 0
                                    ? logsWithStrain.reduce((best, l) => (l.whoop_strain || 0) > (best.whoop_strain || 0) ? l : best, logsWithStrain[0])
                                    : null;

                                let bestWeekAvg = 0;
                                let bestWeekStart = '';
                                const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
                                for (let i = 0; i <= sortedLogs.length - 7; i++) {
                                    const window = sortedLogs.slice(i, i + 7);
                                    const avg = Math.round(window.reduce((s, l) => s + logComposite(l), 0) / 7);
                                    if (avg > bestWeekAvg) { bestWeekAvg = avg; bestWeekStart = window[0].date; }
                                }

                                // Non-WHOOP alternatives (desktop)
                                const dPerfectDays = logs.filter(l => l.habit_score >= 100).length;
                                const dTopYearStreak = habitStreaks.length > 0
                                    ? habitStreaks.reduce((best, h) => h.bestThisYear > best.bestThisYear ? h : best, habitStreaks[0])
                                    : null;

                                return (
                                    <>
                                        <DataMaturityProvider>
                                        <DataGate feature="yearHighlights">
                                        <h2 className="text-lg font-serif text-athena-gold mb-3">Highlights</h2>
                                        <div className="grid grid-cols-4 gap-3">
                                            <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                                <div className="text-xl md:text-3xl font-serif text-athena-gold">{bestMonthData.score > 0 ? `${bestMonthData.score}%` : '--'}</div>
                                                <div className="text-[11px] text-athena-text-muted mt-1">Best Month</div>
                                                {bestMonthData.name !== '--' && <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{bestMonthData.name}</div>}
                                            </div>
                                            {whoopEnabled ? (
                                                <>
                                                    <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                                        <div className="text-xl md:text-3xl font-serif text-athena-gold">{bestRecoveryLog ? `${bestRecoveryLog.whoop_recovery}%` : '--'}</div>
                                                        <div className="text-[11px] text-athena-text-muted mt-1">Best Recovery</div>
                                                        {bestRecoveryLog && <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{format(parseISO(bestRecoveryLog.date), 'MMM d')}</div>}
                                                    </div>
                                                    <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                                        <div className="text-xl md:text-3xl font-serif text-athena-gold">{peakStrainLog ? Number(peakStrainLog.whoop_strain).toFixed(1) : '--'}</div>
                                                        <div className="text-[11px] text-athena-text-muted mt-1">Peak Strain</div>
                                                        {peakStrainLog && <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{format(parseISO(peakStrainLog.date), 'MMM d')}</div>}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                                        <div className="text-xl md:text-3xl font-serif text-athena-gold">{dPerfectDays > 0 ? dPerfectDays : '--'}</div>
                                                        <div className="text-[11px] text-athena-text-muted mt-1">Perfect Days</div>
                                                        {dPerfectDays > 0 && <div className="text-[10px] text-athena-text-muted/70 mt-0.5">100%</div>}
                                                    </div>
                                                    <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                                        <div className="text-xl md:text-3xl font-serif text-athena-gold">{dTopYearStreak ? `${dTopYearStreak.bestThisYear}d` : '--'}</div>
                                                        <div className="text-[11px] text-athena-text-muted mt-1">Top Streak</div>
                                                        {dTopYearStreak && <div className="text-[10px] text-athena-text-muted/70 mt-0.5 truncate">{dTopYearStreak.name}</div>}
                                                    </div>
                                                </>
                                            )}
                                            <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                                <div className="text-xl md:text-3xl font-serif text-athena-gold">{bestWeekAvg > 0 ? `${bestWeekAvg}%` : '--'}</div>
                                                <div className="text-[11px] text-athena-text-muted mt-1">Best Week</div>
                                                {bestWeekStart && <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{format(parseISO(bestWeekStart), 'MMM d')}</div>}
                                            </div>
                                        </div>
                                        </DataGate>
                                        </DataMaturityProvider>
                                    </>
                                );
                            })()}
                        </motion.section>

                        {/* SECTION: CONSISTENCY HEATMAP */}
                        <motion.section
                            variants={sectionFade}
                            initial="hidden"
                            animate="visible"
                            transition={{ delay: 0.1 }}
                        >
                            <div className="rounded-xl border border-athena-border bg-white/[0.02] p-6">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
                                    <h2 className="text-lg font-serif text-athena-gold">Consistency Heatmap</h2>
                                    {whoopEnabled && (
                                    <div className="flex bg-athena-bg border border-athena-border rounded-full p-1">
                                        {(['day', 'recovery', 'strain', 'sleep'] as const).map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setActiveCalendarMetric(m)}
                                                className={cn(
                                                    "px-2 sm:px-3 py-1 text-[10px] uppercase tracking-wide rounded-full transition-all",
                                                    activeCalendarMetric === m
                                                        ? "bg-athena-gold/20 text-athena-gold font-bold shadow-sm"
                                                        : "text-athena-text-muted hover:text-athena-text-primary"
                                                )}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                    )}
                                </div>

                                {/* Heatmap Grid */}
                                <div className="flex flex-col gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-athena-gold/20 scrollbar-track-transparent min-w-0">
                                    {/* Month Labels */}
                                    <div className="flex text-[10px] text-athena-text-muted font-mono mb-2 pl-8">
                                        {months.map(m => (
                                            <div key={m.toString()} className="flex-1 text-center min-w-[30px]">{format(m, 'MMM')}</div>
                                        ))}
                                    </div>

                                    {/* Days Grid - Row per Day of Week */}
                                    <div className="flex">
                                        {/* Day Labels */}
                                        <div className="flex flex-col gap-[2px] mr-2 pt-0 h-full justify-between pb-[1px]">
                                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                                                <span key={d} className="text-[10px] text-athena-text-muted font-mono flex-1 flex items-center">{d.charAt(0)}</span>
                                            ))}
                                        </div>

                                        {/* 53 Columns of Weeks */}
                                        <div className="flex gap-[2px] h-[110px] flex-1">
                                            {Array.from({ length: 53 }).map((_, weekIdx) => (
                                                <div key={weekIdx} className="flex flex-col gap-[2px] h-full flex-1 min-w-[14px]">
                                                    {Array.from({ length: 7 }).map((_, dayIdx) => {
                                                        const start = startOfWeek(startOfYear(new Date(currentYear, 0, 1)), { weekStartsOn: 1 });
                                                        const date = new Date(start);
                                                        date.setDate(start.getDate() + (weekIdx * 7) + dayIdx);

                                                        const isCurrentYear = date.getFullYear() === currentYear;
                                                        if (!isCurrentYear) return <div key={dayIdx} className="flex-1 min-h-[4px] opacity-0" />;

                                                        const dateStr = format(date, 'yyyy-MM-dd');
                                                        const log = logsByDate.get(dateStr);

                                                        let colorClass = 'bg-white/[0.06]';
                                                        if (log) {
                                                            if (activeCalendarMetric === 'day') {
                                                                colorClass = getDayScoreColor(log.habit_score);
                                                            } else if (activeCalendarMetric === 'recovery') {
                                                                colorClass = log.whoop_recovery != null ? getRecoveryColor(log.whoop_recovery) : 'bg-white/[0.06]';
                                                            } else if (activeCalendarMetric === 'strain') {
                                                                colorClass = log.whoop_strain != null ? getStrainColor(log.whoop_strain) : 'bg-white/[0.06]';
                                                            } else if (activeCalendarMetric === 'sleep') {
                                                                colorClass = log.whoop_sleep_score != null ? getSleepScoreColor(log.whoop_sleep_score) : 'bg-white/[0.06]';
                                                            }
                                                        }

                                                        return (
                                                            <div
                                                                key={dayIdx}
                                                                className={cn("flex-1 rounded-[1px] transition-all border border-transparent hover:border-white/50 hover:scale-110 hover:z-10", colorClass)}
                                                            />
                                                        )
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end text-[10px] text-athena-text-muted mt-2 gap-2">
                                    <span>Less</span>
                                    <div className="flex gap-1">
                                        {(() => {
                                            if (activeCalendarMetric === 'strain') return [
                                                'bg-white/[0.06]', 'bg-athena-strain/20', 'bg-athena-strain/40', 'bg-athena-strain/60', 'bg-athena-strain/80', 'bg-athena-strain'
                                            ];
                                            if (activeCalendarMetric === 'sleep') return [
                                                'bg-white/[0.06]', 'bg-athena-purple/20', 'bg-athena-purple/40', 'bg-athena-purple/60', 'bg-athena-purple/80', 'bg-athena-purple'
                                            ];
                                            if (activeCalendarMetric === 'recovery') return [
                                                'bg-white/[0.06]', 'bg-athena-green/20', 'bg-athena-green/40', 'bg-athena-green/60', 'bg-athena-green/80', 'bg-athena-green'
                                            ];
                                            return [
                                                'bg-white/[0.06]', 'bg-athena-gold/20', 'bg-athena-gold/40', 'bg-athena-gold/60', 'bg-athena-gold/80', 'bg-athena-gold'
                                            ];
                                        })().map((c, i) => (
                                            <div key={i} className={cn("w-2 h-2 rounded-[1px]", c)} />
                                        ))}
                                    </div>
                                    <span>More</span>
                                </div>
                            </div>
                        </motion.section>

                        {/* SECTION: GOALS & MONTHLY OVERVIEW (side by side) */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* LEFT: YEARLY GOALS */}
                            <motion.section
                                variants={sectionFade}
                                initial="hidden"
                                animate="visible"
                                transition={{ delay: 0.2 }}
                            >
                                <h2 className="text-lg font-serif text-athena-gold mb-3">Yearly Goals</h2>
                                <div className="rounded-xl border border-athena-border bg-white/[0.02] p-5 min-h-[400px]">
                                    <div className="flex items-center justify-between mb-5">
                                        <span className="text-[11px] text-athena-text-muted">
                                            {goals.length} goal{goals.length !== 1 ? 's' : ''} tracked
                                        </span>
                                        <button
                                            onClick={() => { setSelectedGoal(null); setIsGoalsModalOpen(true); }}
                                            className="p-1.5 rounded-lg border border-athena-border hover:bg-athena-gold/10 hover:border-athena-gold text-athena-text-muted hover:text-athena-gold transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {goals.length === 0 && (
                                            <div className="text-center py-10 text-athena-text-muted text-sm border border-dashed border-athena-border/30 rounded-xl">
                                                No yearly goals set yet.
                                                <br />
                                                <button
                                                    onClick={() => { setSelectedGoal(null); setIsGoalsModalOpen(true); }}
                                                    className="text-athena-gold hover:underline mt-2 inline-block"
                                                >
                                                    Create one
                                                </button>
                                            </div>
                                        )}
                                        {goals.map((goal, i) => {
                                            const pct = Math.round((goal.current_value / goal.target_value) * 100);
                                            const config = categoryConfig[goal.category] || { icon: Target, color: 'text-athena-gold', barColor: 'bg-athena-gold' };
                                            const GoalIcon = config.icon;
                                            const isYesNo = goal.unit === 'yes_no';
                                            const isComplete = isYesNo ? goal.current_value >= 1 : pct >= 100;

                                            return (
                                                <motion.div
                                                    key={goal.id}
                                                    custom={i}
                                                    variants={fadeSlide}
                                                    initial="hidden"
                                                    animate="visible"
                                                    onClick={() => { setSelectedGoal(goal); setIsGoalsModalOpen(true); }}
                                                    className="p-4 rounded-xl border border-athena-border bg-white/[0.02] cursor-pointer hover:border-athena-gold/30 hover:bg-white/[0.04] transition-all group"
                                                >
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <GoalIcon className={cn("w-4 h-4", config.color)} />
                                                            <div>
                                                                <span className="text-sm font-medium text-athena-text-primary block">{goal.title}</span>
                                                                <span className="text-[10px] text-athena-text-muted uppercase tracking-wider flex items-center gap-2">
                                                                    {goal.category}
                                                                    {goal.linked_metric !== 'none' && (
                                                                        <span className="bg-athena-green/20 text-athena-green px-1 rounded text-[10px] font-bold">auto-tracked</span>
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {isYesNo ? (
                                                            <div className="flex items-center gap-1.5">
                                                                {isComplete
                                                                    ? <CheckCircle className="w-5 h-5 text-athena-green" />
                                                                    : <Circle className="w-5 h-5 text-athena-text-muted" />
                                                                }
                                                                <span className={cn("text-xs font-medium", isComplete ? "text-athena-green" : "text-athena-text-muted")}>
                                                                    {isComplete ? 'Done' : 'Pending'}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="text-right">
                                                                <span className={cn("text-lg font-bold font-serif block", isComplete ? "text-athena-green" : "text-athena-gold")}>
                                                                    {pct}%
                                                                </span>
                                                                <span className="text-[10px] text-athena-text-muted">
                                                                    {goal.current_value} / {goal.target_value} {goal.unit}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {!isYesNo && (
                                                        <div className="w-full bg-athena-border/30 h-1.5 rounded-full overflow-hidden">
                                                            <div
                                                                className={cn("h-full rounded-full transition-all", isComplete ? "bg-athena-green" : config.barColor)}
                                                                style={{ width: `${Math.min(pct, 100)}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </motion.section>

                            {/* RIGHT: MONTHLY OVERVIEW */}
                            <motion.section
                                variants={sectionFade}
                                initial="hidden"
                                animate="visible"
                                transition={{ delay: 0.3 }}
                            >
                                <h2 className="text-lg font-serif text-athena-gold mb-3">Monthly Overview</h2>
                                <div className="rounded-xl border border-athena-border bg-white/[0.02] overflow-hidden min-h-[400px]">
                                    {/* Header row */}
                                    <div className={cn("grid border-b border-athena-border px-4 py-2.5", whoopEnabled ? "grid-cols-[1fr_repeat(4,60px)]" : "grid-cols-[1fr_80px]")}>
                                        <div className="text-xs font-sans text-athena-text-muted">Month</div>
                                        <div className="text-[10px] text-athena-text-muted text-center uppercase tracking-wider">Day</div>
                                        {whoopEnabled && <div className="text-[10px] text-athena-text-muted text-center uppercase tracking-wider">Rec</div>}
                                        {whoopEnabled && <div className="text-[10px] text-athena-text-muted text-center uppercase tracking-wider">Str</div>}
                                        {whoopEnabled && <div className="text-[10px] text-athena-text-muted text-center uppercase tracking-wider">Slp</div>}
                                    </div>

                                    {/* Month rows */}
                                    <div className="divide-y divide-athena-border/50">
                                        {monthlyStats.map((stat, i) => (
                                            <motion.div
                                                key={i}
                                                custom={i}
                                                variants={fadeSlide}
                                                initial="hidden"
                                                animate="visible"
                                                onClick={() => {
                                                    if (stat.status !== 'Pending') {
                                                        router.push(`/productivity?tab=analytics&view=month-v2&month=${format(stat.date, 'yyyy-MM')}`);
                                                    }
                                                }}
                                                className={cn(
                                                    "grid px-4 py-3 items-center transition-all",
                                                    whoopEnabled ? "grid-cols-[1fr_repeat(4,60px)]" : "grid-cols-[1fr_80px]",
                                                    stat.status === 'Pending'
                                                        ? "opacity-40"
                                                        : "cursor-pointer hover:bg-white/[0.03]"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("w-2 h-2 rounded-full shrink-0",
                                                        stat.status === 'Complete' ? "bg-athena-green" :
                                                            stat.status === 'In Progress' ? "bg-athena-gold animate-pulse" :
                                                                "bg-athena-text-muted/30"
                                                    )} />
                                                    <span className={cn("text-sm font-medium", stat.status === 'Pending' ? 'text-athena-text-muted' : 'text-athena-text-primary')}>
                                                        {stat.name}
                                                    </span>
                                                </div>

                                                {stat.status !== 'Pending' ? (
                                                    <>
                                                        <span className={cn("text-sm font-bold font-serif text-center", stat.score >= 80 ? "text-athena-gold" : stat.score >= 50 ? "text-athena-gold/70" : "text-athena-gold/40")}>
                                                            {stat.score}%
                                                        </span>
                                                        {whoopEnabled && (
                                                            <span className={cn("text-sm font-bold font-serif text-center", stat.recovery >= 67 ? "text-athena-green" : stat.recovery >= 34 ? "text-athena-green/60" : "text-athena-green/30")}>
                                                                {stat.recovery}%
                                                            </span>
                                                        )}
                                                        {whoopEnabled && (
                                                            <span className="text-sm font-bold font-serif text-center text-athena-strain">
                                                                {stat.strain}
                                                            </span>
                                                        )}
                                                        {whoopEnabled && (
                                                            <span className="text-sm font-bold font-serif text-center text-athena-purple">
                                                                {stat.sleep}%
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="text-sm text-athena-text-muted text-center">--</span>
                                                        {whoopEnabled && <span className="text-sm text-athena-text-muted text-center">--</span>}
                                                        {whoopEnabled && <span className="text-sm text-athena-text-muted text-center">--</span>}
                                                        {whoopEnabled && <span className="text-sm text-athena-text-muted text-center">--</span>}
                                                    </>
                                                )}
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Footer */}
                                    <div className="px-4 py-3 border-t border-athena-border bg-white/[0.02] flex justify-between text-xs text-athena-text-muted">
                                        <span>{monthlyStats.filter(m => m.status === 'Complete').length} / 12 months complete</span>
                                        <span className="italic font-serif">Click a month to view details</span>
                                    </div>
                                </div>
                            </motion.section>
                        </div>

                        {/* SECTION: HABIT STREAKS */}
                        {habitStreaks.length > 0 && (
                            <motion.section
                                variants={sectionFade}
                                initial="hidden"
                                animate="visible"
                                transition={{ delay: 0.4 }}
                            >
                                <h2 className="text-lg font-serif text-athena-gold mb-3">Habit Streaks</h2>
                                <div className="rounded-xl border border-athena-border bg-white/[0.02] p-5 space-y-3">
                                    {habitStreaks.map((habit, i) => (
                                        <div key={habit.name}>
                                            <motion.div
                                                custom={i}
                                                variants={fadeSlide}
                                                initial="hidden"
                                                animate="visible"
                                                className="flex items-center gap-3"
                                            >
                                                <div className="w-32 flex-shrink-0 text-xs font-sans text-athena-text-primary truncate" title={habit.name}>
                                                    {habit.name}
                                                </div>
                                                <div className="flex-1 h-5 bg-athena-border/20 rounded-full overflow-hidden">
                                                    <div
                                                        className={cn(
                                                            "h-full rounded-full transition-all",
                                                            habit.streak >= 14 ? "bg-athena-green" :
                                                            habit.streak >= 7 ? "bg-athena-gold" :
                                                            habit.streak >= 3 ? "bg-athena-gold/60" :
                                                            "bg-athena-gold/30"
                                                        )}
                                                        style={{ width: `${Math.max((habit.streak / maxStreak) * 100, 4)}%` }}
                                                    />
                                                </div>
                                                <div className="w-16 text-right flex-shrink-0">
                                                    <span className={cn(
                                                        "text-sm font-bold font-serif",
                                                        habit.streak >= 14 ? "text-athena-green" :
                                                        habit.streak >= 7 ? "text-athena-gold" :
                                                        "text-athena-text-muted"
                                                    )}>
                                                        {habit.streak}
                                                    </span>
                                                    <span className="text-[10px] text-athena-text-muted ml-1">days</span>
                                                </div>
                                            </motion.div>
                                            {habit.bestThisYear > 0 && (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] text-athena-text-muted/50">
                                                        {habit.streak === habit.bestThisYear ? 'Current best' : `Best: ${habit.bestThisYear}d`}
                                                    </span>
                                                    {habit.bestStreakStart && habit.bestStreakEnd && habit.streak !== habit.bestThisYear && (
                                                        <span className="text-[10px] text-white/15">
                                                            {new Date(habit.bestStreakStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(habit.bestStreakEnd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <div className="text-[10px] text-athena-text-muted pt-2 border-t border-athena-border/30">
                                        Current consecutive completion streaks for recurring habits
                                    </div>
                                </div>
                            </motion.section>
                        )}

                        {/* Yearly AI Report */}
                        <YearlyReportPanel year={currentYear} />
                    </>
                )}
            </div>

            <UnifiedGoalsModal
                isOpen={isGoalsModalOpen}
                onClose={() => setIsGoalsModalOpen(false)}
                currentYear={currentYear}
                currentMonthDate={new Date(currentYear, new Date().getMonth(), 1)}
                goalToEdit={selectedGoal as any}
                defaultType="yearly"
                onSave={fetchData}
            />
        </div>
    );
}
