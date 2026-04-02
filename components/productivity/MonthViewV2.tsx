'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, getDay, getDaysInMonth, startOfDay, parseISO } from 'date-fns';
import {
    ChevronLeft, ChevronRight, ChevronDown, Moon, Zap,
    BookOpen, Check, Plus, Heart, Target, TrendingUp, Dumbbell, ListChecks,
    CheckCircle, Circle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import MonthlyReportPanel from './reports/MonthlyReportPanel';
import { createClient } from '@/utils/supabase/client';
import { DayReportModal } from './DayReportModal';
import { UnifiedGoalsModal } from './goals/UnifiedGoalsModal';
import { BatchReviewModal } from './goals/BatchReviewModal';
import { AthenaNavBar } from './AthenaNavBar';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { GoalProgressRings } from './charts/GoalProgressRings';
import { DataMaturityProvider, DataGate } from '@/components/productivity/DataGate';
import { MobileDrawerSheet } from '@/components/mobile/MobileDrawerSheet';


// --- Types & Interfaces ---

interface MonthDayData {
    date: Date;
    day_score: number; // 0-100 (combination of habits completed)
    recovery: number; // 0-100
    strain: number; // 0-21
    sleep_score: number; // 0-100
    sleep_hours: number;
    hrv: number;
    rhr: number;
    calories: number;
    has_win: boolean;
    win_text?: string;
    journal_entries?: string[];
    habits_completed: number;
    total_habits: number;
}


interface MonthlyGoal {
    id: string;
    title: string;
    // tag: 'Health' | 'Growth' | 'Athena' | 'Work'; // Deprecated in favor of category
    category: 'Health' | 'Growth' | 'Athena' | 'Work';
    current_value: number;
    target_value: number;
    unit: string;
    linked_metric: 'none' | 'gym_sessions' | 'books_read' | 'project_streak';
    yearly_goal_id?: string;
}

// --- Animations (matching Week view) ---
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

export default function MonthViewV2() {
    const { whoopEnabled } = useWhoopMode();
    const router = useRouter();
    const supabase = createClient();
    const searchParams = useSearchParams();

    // Initialize with URL month query if present (YYYY-MM)
    const [currentDate, setCurrentDate] = useState(() => {
        const monthParam = searchParams.get('month');
        if (monthParam) {
            const [yearStr, monthStr] = monthParam.split('-');
            const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        return new Date();
    });
    const [monthData, setMonthData] = useState<MonthDayData[]>([]);
    const [whoopData, setWhoopData] = useState<any[]>([]); // Store raw whoop data for charts
    const [workouts, setWorkouts] = useState<any[]>([]); // Store workouts for Training Calendar
    const [dailyTasks, setDailyTasks] = useState<any[]>([]); // Store tasks for gym splits
    const [habitFreqMap, setHabitFreqMap] = useState<Record<string, number[] | null>>({});
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    // UI State
    const [activeCalendarMetric, setActiveCalendarMetric] = useState<'day' | 'recovery' | 'strain' | 'sleep'>('day');

    const [isLoading, setIsLoading] = useState(true);
    const [mobileReportDrawerOpen, setMobileReportDrawerOpen] = useState(false);
    const [mobileGoalsDrawerOpen, setMobileGoalsDrawerOpen] = useState(false);
    const [mobileDayDrawerOpen, setMobileDayDrawerOpen] = useState(false);
    const [mobileSelectedDate, setMobileSelectedDate] = useState<Date | null>(null);
    const [now, setNow] = useState(new Date());

    // Goals State
    const [goals, setGoals] = useState<MonthlyGoal[]>([]);
    const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState<MonthlyGoal | null>(null);

    // Batch Review State
    const [prevMonthGoals, setPrevMonthGoals] = useState<MonthlyGoal[]>([]);
    const [isBatchReviewOpen, setIsBatchReviewOpen] = useState(false);

    // Project Tasks State
    const [projectTasksDone, setProjectTasksDone] = useState(0);
    const [projectTasksTotal, setProjectTasksTotal] = useState(0);

    // Modal State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportModalDate, setReportModalDate] = useState<Date | null>(null);

    // Previous month deltas
    const [prevMonthDeltas, setPrevMonthDeltas] = useState<{
        habits: number | null;
        recovery: number | null;
        strain: number | null;
        sleep: number | null;
    }>({ habits: null, recovery: null, strain: null, sleep: null });

    // --- Clock Effect ---
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // --- Goals Fetching ---
    const fetchGoals = async () => {
        try {
            const dateStr = format(currentDate, 'yyyy-MM-dd');
            const res = await fetch(`/api/goals?month=${dateStr}`);
            if (res.ok) {
                const data = await res.json();

                // Map API response to our interface
                const mappedGoals = (data.goals || []).map((g: any) => ({
                    ...g,
                    // Ensure types match
                    category: g.category as any,
                    linked_metric: g.linked_metric as any
                }));
                setGoals(mappedGoals);
            }

            // Check for previous month unfinished goals (only when viewing current month)
            if (isSameMonth(currentDate, new Date())) {
                const prevDate = subMonths(currentDate, 1);
                const prevDateStr = format(prevDate, 'yyyy-MM-dd');
                const prevRes = await fetch(`/api/goals?month=${prevDateStr}`);
                if (prevRes.ok) {
                    const prevData = await prevRes.json();
                    const incomplete = (prevData.goals || []).filter((g: any) =>
                        g.status === 'active' &&
                        g.current_value < g.target_value &&
                        !g.yearly_goal_id
                    );
                    if (incomplete.length > 0) {
                        // Ensure types match
                        setPrevMonthGoals(incomplete.map((g: any) => ({
                            ...g,
                            category: g.category as any,
                            linked_metric: g.linked_metric as any
                        })));
                        setIsBatchReviewOpen(true);
                    }
                }
            }
        } catch (error) {
            console.error("Failed to fetch goals", error);
        }
    };

    // --- Data Fetching ---
    const fetchMonthData = async () => {
        setIsLoading(true);
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');

        try {
            // Fetch workouts via API to bypass RLS (Matches Month 1.0)
            const workoutsRes = await fetch(`/api/productivity/workouts?start_date=${startStr}&end_date=${endStr}`);
            const workoutsApiData = await workoutsRes.json();

            // Previous month date range
            const prevMonthDate = subMonths(currentDate, 1);
            const prevStart = startOfMonth(prevMonthDate);
            const prevEnd = endOfMonth(prevMonthDate);
            const prevStartStr = format(prevStart, 'yyyy-MM-dd');
            const prevEndStr = format(prevEnd, 'yyyy-MM-dd');

            const [
                { data: tasksData },
                { data: summariesData },
                { data: whoopDataRaw },
                { data: prevTasksData },
                { data: prevWhoopData },
                { data: habitsData }
            ] = await Promise.all([
                supabase.from('daily_tasks').select('*').gte('date', startStr).lte('date', endStr),
                supabase.from('daily_summaries').select('*').gte('date', startStr).lte('date', endStr),
                supabase.from('whoop_data').select('*').gte('date', startStr).lte('date', endStr),
                supabase.from('daily_tasks').select('*').gte('date', prevStartStr).lte('date', prevEndStr),
                supabase.from('whoop_data').select('*').gte('date', prevStartStr).lte('date', prevEndStr),
                supabase.from('today_habits').select('title, frequency')
            ]);

            // Build habit frequency map
            const freqMap: Record<string, number[] | null> = {};
            for (const h of (habitsData || [])) {
                freqMap[h.title] = h.frequency;
            }
            setHabitFreqMap(freqMap);

            // Store raw whoop data for charts

            // Transform field names to match what charts expect (whoop_ prefix, _mins instead of _minutes)
            // Filter out Jan 1-5, 2026 (user didn't have Whoop yet)
            const transformedWhoopData = (whoopDataRaw || [])
                .filter((item: any) => {
                    const itemDate = new Date(item.date);
                    const jan5_2026 = new Date('2026-01-05');
                    return itemDate > jan5_2026;
                })
                .map((item: any) => ({
                    date: item.date,
                    whoop_recovery: item.recovery_score,
                    whoop_strain: item.strain,
                    whoop_sleep_hours: item.sleep_hours,
                    whoop_sleep_performance: item.sleep_performance,
                    whoop_sleep_consistency: item.sleep_consistency,
                    whoop_hrv: item.hrv,
                    whoop_resting_hr: item.resting_hr,
                    whoop_sleep_stage_light_mins: item.sleep_stage_light_minutes,
                    whoop_sleep_stage_deep_mins: item.sleep_stage_deep_minutes,
                    whoop_sleep_stage_rem_mins: item.sleep_stage_rem_minutes,
                    whoop_sleep_stage_awake_mins: item.sleep_stage_awake_minutes,
                    whoop_sleep_efficiency: item.sleep_efficiency_percentage,
                    whoop_sleep_need: item.sleep_need_baseline_minutes,
                    whoop_sleep_debt: item.sleep_debt_minutes,
                    whoop_sleep_debt_corrected: item.sleep_debt_corrected_minutes,
                    whoop_sleep_debt_corrected_hours: item.sleep_debt_corrected_minutes ? item.sleep_debt_corrected_minutes / 60 : null,
                    whoop_official_sleep_debt_hours: item.whoop_reported_sleep_debt_minutes ? item.whoop_reported_sleep_debt_minutes / 60 : null,
                    whoop_respiratory_rate: item.respiratory_rate,
                    whoop_spo2: item.spo2_percentage,
                    whoop_skin_temp: item.skin_temp_celsius,
                    whoop_calories: item.calories_burned,
                    whoop_max_hr: item.max_hr,
                    whoop_average_hr: item.average_hr,
                    whoop_sleep_start: item.sleep_start,
                    whoop_sleep_end: item.sleep_end,
                    whoop_disturbances: item.sleep_disturbances
                }));

            setWhoopData(transformedWhoopData);

            setWorkouts(workoutsApiData.workouts || []);
            setDailyTasks(tasksData || []);

            // Fetch project tasks completed this month
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

            const days = eachDayOfInterval({ start, end });

            // Helper to convert time to decimal hours (21-33 range for 9pm-9am)
            const getDecimalTime = (isoString?: string) => {
                if (!isoString) return 0;
                const date = new Date(isoString);
                const hours = date.getHours();
                const minutes = date.getMinutes();
                let decimal = hours + (minutes / 60);

                // If time is early morning (e.g. 00:00 - 15:00), add 24 to place it after midnight on the chart
                // This makes the chart range effectively 9PM (21) to 3PM (15+24=39) next day roughly
                if (decimal < 15) {
                    decimal += 24;
                }
                return Number(decimal.toFixed(2));
            };

            const processedData: MonthDayData[] = days.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');

                // 1. Process Tasks for Day Score
                const dayTasks = tasksData?.filter(t => t.date === dayStr) || [];
                const totalTasks = dayTasks.length;
                const completedTasks = dayTasks.filter(t => t.status === 'Completed').length;
                // Avoid 0/0 division, default to 0 if no tasks
                const dayScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                // 2. Process Summary (Win/Journal)
                const summary = summariesData?.find(s => s.date === dayStr);
                const hasWin = !!summary?.win_of_the_day;
                const winText = summary?.win_of_the_day;

                // 3. Process Whoop/Vitals
                // Priority: Whoop Table > Summary Table > Default 0
                // Filter out Jan 1-5, 2026 (user didn't have Whoop yet)
                const isBeforeWhoopStart = day <= new Date('2026-01-05');
                const whoop = isBeforeWhoopStart ? null : whoopDataRaw?.find(w => w.date === dayStr);

                // 4. Process Workouts
                const dayWorkouts = workoutsApiData?.workouts?.filter((w: any) => w.date === dayStr) || [];

                // Merge Data
                return {
                    date: day,
                    day: day.getDate(),
                    dayOfWeek: format(day, "EEE"),
                    // Whoop Metrics (Default to null if missing)
                    recovery: whoop?.recovery_score ?? null,
                    strain: whoop?.strain ?? null,
                    sleep_score: whoop?.sleep_performance ?? null,
                    hrv: whoop?.hrv ?? null,
                    rhr: whoop?.resting_hr ?? null,
                    deepPct: whoop?.sleep_stage_deep_minutes && whoop?.sleep_hours ? Math.round((whoop.sleep_stage_deep_minutes / 60 / whoop.sleep_hours) * 100) : null,
                    remPct: whoop?.sleep_stage_rem_minutes && whoop?.sleep_hours ? Math.round((whoop.sleep_stage_rem_minutes / 60 / whoop.sleep_hours) * 100) : null,
                    lightPct: whoop?.sleep_stage_light_minutes && whoop?.sleep_hours ? Math.round((whoop.sleep_stage_light_minutes / 60 / whoop.sleep_hours) * 100) : null,
                    awakePct: whoop?.sleep_stage_awake_minutes && whoop?.sleep_hours ? Math.round((whoop.sleep_stage_awake_minutes / 60 / whoop.sleep_hours) * 100) : null,
                    sleep_hours: (() => {
                        let duration = whoop?.sleep_hours ? Number(whoop.sleep_hours) : null;
                        if (!duration && whoop?.sleep_start && whoop?.sleep_end) {
                            const start = new Date(whoop.sleep_start);
                            const end = new Date(whoop.sleep_end);
                            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                                const diffMs = end.getTime() - start.getTime();
                                if (diffMs > 0) duration = Number((diffMs / (1000 * 60 * 60)).toFixed(1));
                            }
                        }
                        return duration ?? 0;
                    })(),
                    bedtime: getDecimalTime(whoop?.sleep_start) || null,
                    wakeTime: getDecimalTime(whoop?.sleep_end) || null,
                    sleepEfficiency: whoop?.sleep_efficiency_percentage ?? null,
                    disturbances: whoop?.sleep_disturbances ?? null,
                    calories: whoop?.calories_burned ?? null,
                    respRate: whoop?.respiratory_rate ?? null,
                    spo2: whoop?.spo2_percentage ?? null,

                    // App Metrics
                    day_score: dayScore,
                    has_win: hasWin,
                    win_text: winText,
                    // Use !is_one_off to identify habits since 'category' column does not exist on daily_tasks
                    habits_completed: dayTasks.filter(t => !t.is_one_off && t.status === 'Completed').length,
                    total_habits: dayTasks.filter(t => !t.is_one_off).length,

                    // Workouts & Tasks
                    workoutType: dayWorkouts.length > 0 ? dayWorkouts.map((w: any) => w.sport_name).join(", ") : null,
                    workoutDuration: dayWorkouts.length > 0 ? dayWorkouts.reduce((a: number, b: any) => a + (b.duration_minutes || 0), 0) / 60 : null,
                } as MonthDayData;
            });

            setMonthData(processedData);

            // --- Compute previous month deltas ---
            const prevDays = eachDayOfInterval({ start: prevStart, end: prevEnd });
            const prevProcessed = prevDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayTasks = prevTasksData?.filter(t => t.date === dayStr) || [];
                const habits = dayTasks.filter(t => !t.is_one_off);
                const completedHabits = habits.filter(t => t.status === 'Completed').length;
                const completedTasks = dayTasks.filter(t => t.status === 'Completed').length;
                const totalTasks = dayTasks.length;
                const isBeforeWhoopStart = day <= new Date('2026-01-05');
                const whoop = isBeforeWhoopStart ? null : prevWhoopData?.find(w => w.date === dayStr);
                return {
                    dayScore: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
                    habitsCompleted: completedHabits,
                    totalHabits: habits.length,
                    recovery: whoop?.recovery_score ?? null,
                    sleepScore: whoop?.sleep_performance ?? null,
                    strain: whoop?.strain ?? null,
                    hasData: totalTasks > 0 || !!whoop,
                };
            });

            const prevPastData = prevProcessed.filter(d => d.hasData);
            const pDaysWithHabits = prevPastData.filter(d => d.totalHabits > 0);
            const pDaysWithRecovery = prevPastData.filter(d => d.recovery !== null);
            const pDaysWithSleep = prevPastData.filter(d => d.sleepScore !== null);
            const pDaysWithStrain = prevPastData.filter(d => d.strain !== null);

            const pAvgDay = prevPastData.length > 0
                ? Math.round(prevPastData.reduce((s, d) => s + d.dayScore, 0) / prevPastData.length) : null;
            const pAvgRecovery = pDaysWithRecovery.length > 0
                ? Math.round(pDaysWithRecovery.reduce((s, d) => s + (d.recovery || 0), 0) / pDaysWithRecovery.length) : null;
            const pAvgSleep = pDaysWithSleep.length > 0
                ? Math.round(pDaysWithSleep.reduce((s, d) => s + (d.sleepScore || 0), 0) / pDaysWithSleep.length) : null;
            const pAvgStrain = pDaysWithStrain.length > 0
                ? Number((pDaysWithStrain.reduce((s, d) => s + (d.strain || 0), 0) / pDaysWithStrain.length).toFixed(1)) : null;

            // Current month averages from processedData (for delta comparison)
            const curPast = processedData.filter(d => d.date <= new Date());
            const curValidRecovery = curPast.filter(d => d.recovery !== null);
            const curValidSleep = curPast.filter(d => d.sleep_score !== null);
            const curValidStrain = curPast.filter(d => d.strain !== null);

            const curAvgDay = curPast.length > 0
                ? Math.round(curPast.reduce((s, d) => s + d.day_score, 0) / curPast.length) : null;
            const curAvgRecovery = curValidRecovery.length > 0
                ? Math.round(curValidRecovery.reduce((s, d) => s + (d.recovery || 0), 0) / curValidRecovery.length) : null;
            const curAvgSleep = curValidSleep.length > 0
                ? Math.round(curValidSleep.reduce((s, d) => s + (d.sleep_score || 0), 0) / curValidSleep.length) : null;
            const curAvgStrain = curValidStrain.length > 0
                ? Number((curValidStrain.reduce((s, d) => s + (d.strain || 0), 0) / curValidStrain.length).toFixed(1)) : null;

            setPrevMonthDeltas({
                habits: (curAvgDay !== null && pAvgDay !== null) ? curAvgDay - pAvgDay : null,
                recovery: (curAvgRecovery !== null && pAvgRecovery !== null) ? curAvgRecovery - pAvgRecovery : null,
                strain: (curAvgStrain !== null && pAvgStrain !== null) ? Number((curAvgStrain - pAvgStrain).toFixed(1)) : null,
                sleep: (curAvgSleep !== null && pAvgSleep !== null) ? curAvgSleep - pAvgSleep : null,
            });

        } catch (error) {
            console.error("Failed to fetch month data", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMonthData();
        fetchGoals();
    }, [currentDate]);

    // Set selected date to today if in current month, else first day
    useEffect(() => {
        if (isSameMonth(currentDate, new Date())) {
            setSelectedDate(new Date());
        } else {
            setSelectedDate(startOfMonth(currentDate));
        }
        setMobileSelectedDate(null); // Reset mobile selection on month change
    }, [currentDate]);


    const selectedDayData = useMemo(() => {
        if (!selectedDate || monthData.length === 0) return null;
        return monthData.find(d => isSameDay(d.date, selectedDate)) || null;
    }, [selectedDate, monthData]);


    // Averages
    const averages = useMemo(() => {
        // Filter out future days for accurate "Month to Date" averages
        const pastOrTodayData = monthData.filter(d => d.date <= new Date());

        if (!pastOrTodayData.length) return { day: 0, recovery: 0, strain: 0, sleep: 0, hrv: 0, rhr: 0, calories: 0, sleep_hours: 0, habits: 0 };

        // 1. Calculate Day & Habit Averages (using all past days)
        const totalDayScore = pastOrTodayData.reduce((acc, curr) => acc + curr.day_score, 0);
        const totalHabits = pastOrTodayData.reduce((acc, curr) => acc + (curr.habits_completed || 0), 0);

        const avgDayScore = Math.round(totalDayScore / pastOrTodayData.length);
        const avgHabits = Number((totalHabits / pastOrTodayData.length).toFixed(1));

        // 2. Calculate Whoop Averages (metric by metric to handle partial data)
        const validRecovery = pastOrTodayData.filter(d => d.recovery !== null);
        const validStrain = pastOrTodayData.filter(d => d.strain !== null);
        const validSleepScore = pastOrTodayData.filter(d => d.sleep_score !== null);
        const validSleepDuration = pastOrTodayData.filter(d => d.sleep_hours !== null && d.sleep_hours > 0);
        const validHRV = pastOrTodayData.filter(d => d.hrv !== null);
        const validRHR = pastOrTodayData.filter(d => d.rhr !== null);
        const validCalories = pastOrTodayData.filter(d => d.calories !== null);

        const avgRecovery = validRecovery.length ? Math.round(validRecovery.reduce((acc, curr) => acc + (curr.recovery || 0), 0) / validRecovery.length) : 0;
        const avgStrain = validStrain.length ? Number((validStrain.reduce((acc, curr) => acc + (curr.strain || 0), 0) / validStrain.length).toFixed(1)) : 0;
        const avgSleepScore = validSleepScore.length ? Math.round(validSleepScore.reduce((acc, curr) => acc + (curr.sleep_score || 0), 0) / validSleepScore.length) : 0;
        const avgSleepDuration = validSleepDuration.length ? Number((validSleepDuration.reduce((acc, curr) => acc + (curr.sleep_hours || 0), 0) / validSleepDuration.length).toFixed(1)) : 0;
        const avgHRV = validHRV.length ? Math.round(validHRV.reduce((acc, curr) => acc + (curr.hrv || 0), 0) / validHRV.length) : 0;
        const avgRHR = validRHR.length ? Math.round(validRHR.reduce((acc, curr) => acc + (curr.rhr || 0), 0) / validRHR.length) : 0;
        const avgCalories = validCalories.length ? Math.round(validCalories.reduce((acc, curr) => acc + (curr.calories || 0), 0) / validCalories.length) : 0;

        return {
            day: avgDayScore,
            habits: avgHabits,
            recovery: avgRecovery,
            strain: avgStrain,
            sleep: avgSleepScore,
            hrv: avgHRV,
            rhr: avgRHR,
            calories: avgCalories,
            sleep_hours: avgSleepDuration
        };
    }, [monthData]);

    const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

    const handleOpenReport = () => {
        if (selectedDate) {
            setReportModalDate(selectedDate);
            setIsReportModalOpen(true);
        }
    };

    return (
        <div className="min-h-screen bg-athena-bg text-athena-text-primary">
            {/* Ambient Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-athena-gold/5 rounded-full blur-[120px]" />
            </div>

            {/* SECTION 1: STICKY NAV */}
            <AthenaNavBar activeTab="month" />

            {/* ==================== MOBILE LAYOUT ==================== */}
            <div className="md:hidden relative z-10 px-4 py-4 pb-20 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <button onClick={handlePrevMonth} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-white/[0.06] active:bg-white/[0.04]">
                        <ChevronLeft className="w-5 h-5 text-white/30" />
                    </button>
                    <h1 className="text-base font-serif text-athena-text-warm"
                        onClick={() => setCurrentDate(new Date())}
                    >
                        {format(currentDate, 'MMMM yyyy')}
                    </h1>
                    <button onClick={handleNextMonth} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-white/[0.06] active:bg-white/[0.04]">
                        <ChevronRight className="w-5 h-5 text-white/30" />
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-athena-gold/30 border-t-athena-gold rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Unfinished goals banner */}
                        {prevMonthGoals.length > 0 && (
                            <button
                                onClick={() => setIsBatchReviewOpen(true)}
                                className="w-full flex items-center justify-between p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] active:bg-white/[0.04]"
                            >
                                <span className="text-[12px] text-athena-text-warm">
                                    Review {prevMonthGoals.length} unfinished goal{prevMonthGoals.length > 1 ? 's' : ''}
                                </span>
                                <ChevronRight className="w-4 h-4 text-white/20" />
                            </button>
                        )}

                        {/* Monthly Averages — 4-column grid */}
                        <div>
                            <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">Monthly Averages</h2>
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

                        {/* Highlights — personal bests */}
                        {monthData.length > 0 && (() => {
                            const pastDays = monthData.filter(d => d.date <= new Date() && d.total_habits > 0);
                            if (!pastDays.length) return null;

                            // Best day — composite: avg of day_score, recovery, sleep_score (normalized)
                            const compositeScore = (d: typeof pastDays[0]) => {
                                let sum = d.day_score;
                                let count = 1;
                                if (whoopEnabled) {
                                    if (d.recovery > 0) { sum += d.recovery; count++; }
                                    if (d.sleep_score > 0) { sum += d.sleep_score; count++; }
                                }
                                return Math.round(sum / count);
                            };
                            const bestDay = pastDays.reduce((best, d) => compositeScore(d) > compositeScore(best) ? d : best, pastDays[0]);

                            // Best recovery day
                            const daysWithRecovery = pastDays.filter(d => d.recovery > 0);
                            const bestRecovery = daysWithRecovery.length > 0
                                ? daysWithRecovery.reduce((best, d) => d.recovery > best.recovery ? d : best, daysWithRecovery[0])
                                : null;

                            // Peak strain day
                            const daysWithStrain = pastDays.filter(d => d.strain > 0);
                            const peakStrain = daysWithStrain.length > 0
                                ? daysWithStrain.reduce((best, d) => d.strain > best.strain ? d : best, daysWithStrain[0])
                                : null;

                            // Longest 90%+ streak in the month — track start/end and whether still active
                            const sorted = [...pastDays].sort((a, b) => a.date.getTime() - b.date.getTime());
                            let longestStreak80 = 0;
                            let currentRun = 0;
                            let bestRunStart = 0;
                            let bestRunEnd = 0;
                            let runStart = 0;
                            for (let i = 0; i < sorted.length; i++) {
                                if (sorted[i].day_score >= 90) {
                                    if (currentRun === 0) runStart = i;
                                    currentRun++;
                                    if (currentRun > longestStreak80) {
                                        longestStreak80 = currentRun;
                                        bestRunStart = runStart;
                                        bestRunEnd = i;
                                    }
                                } else {
                                    currentRun = 0;
                                }
                            }
                            const streakStartDate = longestStreak80 > 0 ? sorted[bestRunStart].date : null;
                            const streakEndDate = longestStreak80 > 0 ? sorted[bestRunEnd].date : null;
                            const isStreakActive = streakEndDate ? format(streakEndDate, 'yyyy-MM-dd') >= format(new Date(), 'yyyy-MM-dd') || bestRunEnd === sorted.length - 1 : false;

                            // Non-WHOOP alternatives: Top Streak and Best Week
                            // Top habit streak this month
                            const habitMap = new Map<string, string[]>();
                            for (const t of dailyTasks.filter(t => !t.is_one_off)) {
                                const arr = habitMap.get(t.title) || [];
                                arr.push(t.date);
                                habitMap.set(t.title, arr);
                            }
                            // Build date-based schedule sets for tasks without a habit entry
                            const allTaskDatesMap = new Map<string, Set<string>>();
                            for (const t of dailyTasks.filter(t => !t.is_one_off)) {
                                if (!allTaskDatesMap.has(t.title)) allTaskDatesMap.set(t.title, new Set());
                                allTaskDatesMap.get(t.title)!.add(t.date);
                            }

                            let topStreakName = '';
                            let topStreakCount = 0;
                            habitMap.forEach((dates, name) => {
                                const hasHabit = name in habitFreqMap;
                                const freq = hasHabit ? habitFreqMap[name] : null;
                                const scheduledDates = !hasHabit ? allTaskDatesMap.get(name) : undefined;

                                const completedSet = new Set(dailyTasks
                                    .filter(t => t.title === name && t.status === 'Completed')
                                    .map(t => t.date));
                                const completedDates = Array.from(completedSet).sort();
                                let streak = 0, maxStreak = 0;
                                for (let i = 0; i < completedDates.length; i++) {
                                    if (i === 0) { streak = 1; }
                                    else {
                                        const prev = new Date(completedDates[i - 1] + 'T12:00:00');
                                        const curr = new Date(completedDates[i] + 'T12:00:00');
                                        let hasMissed = false;
                                        const check = new Date(prev);
                                        check.setDate(check.getDate() + 1);
                                        while (check < curr) {
                                            const checkStr = check.toLocaleDateString('en-CA');
                                            const isScheduled = scheduledDates
                                                ? scheduledDates.has(checkStr)
                                                : (!freq || freq.includes(check.getDay()));
                                            if (isScheduled && !completedSet.has(checkStr)) { hasMissed = true; break; }
                                            check.setDate(check.getDate() + 1);
                                        }
                                        streak = hasMissed ? 1 : streak + 1;
                                    }
                                    if (streak > maxStreak) { maxStreak = streak; topStreakName = name; topStreakCount = maxStreak; }
                                }
                            });

                            // Best 7-day window by avg day_score
                            let bestWeekAvg = 0;
                            let bestWeekRange = '';
                            if (sorted.length >= 7) {
                                for (let i = 0; i <= sorted.length - 7; i++) {
                                    const w = sorted.slice(i, i + 7);
                                    const avg = Math.round(w.reduce((s, d) => s + d.day_score, 0) / 7);
                                    if (avg > bestWeekAvg) {
                                        bestWeekAvg = avg;
                                        bestWeekRange = `${format(w[0].date, 'MMM d')}–${format(w[6].date, 'd')}`;
                                    }
                                }
                            }

                            return (
                                <div>
                                    <DataMaturityProvider>
                                    <DataGate feature="monthHighlights">
                                    <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">Highlights</h2>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                            <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{compositeScore(bestDay)}%</span>
                                            <span className="text-[10px] text-white/25 uppercase tracking-wider">Best Day</span>
                                            <span className="text-[10px] text-white/15 italic">{format(bestDay.date, 'MMM d')}</span>
                                        </div>
                                        {whoopEnabled ? (
                                            <>
                                                <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                                    <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{bestRecovery ? `${bestRecovery.recovery}%` : '--'}</span>
                                                    <span className="text-[10px] text-white/25 uppercase tracking-wider">Best Rec.</span>
                                                    {bestRecovery && <span className="text-[10px] text-white/15 italic">{format(bestRecovery.date, 'MMM d')}</span>}
                                                </div>
                                                <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                                    <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{peakStrain ? peakStrain.strain.toFixed(1) : '--'}</span>
                                                    <span className="text-[10px] text-white/25 uppercase tracking-wider">Peak Strain</span>
                                                    {peakStrain && <span className="text-[10px] text-white/15 italic">{format(peakStrain.date, 'MMM d')}</span>}
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                                    <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{topStreakCount > 0 ? `${topStreakCount}d` : '--'}</span>
                                                    <span className="text-[10px] text-white/25 uppercase tracking-wider">Top Streak</span>
                                                    {topStreakCount > 0 && <span className="text-[10px] text-white/15 italic truncate max-w-[60px]">{topStreakName}</span>}
                                                </div>
                                                <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                                    <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{bestWeekAvg > 0 ? `${bestWeekAvg}%` : '--'}</span>
                                                    <span className="text-[10px] text-white/25 uppercase tracking-wider">Best Week</span>
                                                    {bestWeekRange && <span className="text-[10px] text-white/15 italic">{bestWeekRange}</span>}
                                                </div>
                                            </>
                                        )}
                                        <div className="flex flex-col items-center py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                            <span className="text-sm font-serif font-bold text-athena-gold tabular-nums">{longestStreak80}d</span>
                                            <span className="text-[10px] text-white/25 uppercase tracking-wider">90%+ Run</span>
                                            {longestStreak80 > 0 && (
                                                <span className="text-[10px] text-white/15 italic">
                                                    {isStreakActive ? 'Active' : `${format(streakStartDate!, 'd')}–${format(streakEndDate!, 'd')}`}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    </DataGate>
                                    </DataMaturityProvider>
                                </div>
                            );
                        })()}

                        {/* Consistency */}
                        <div>
                        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">Consistency</h2>
                        <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] p-2.5">
                            {/* Metric Filter */}
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
                            <div className="grid grid-cols-7 gap-[3px] mb-1">
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                    <div key={i} className="text-center text-[10px] text-white/20 font-mono py-0.5">{d}</div>
                                ))}

                                {Array.from({ length: getDay(startOfMonth(currentDate)) }).map((_, i) => (
                                    <div key={`empty-${i}`} />
                                ))}

                                {monthData.map((d) => {
                                    const isSelected = mobileSelectedDate && isSameDay(d.date, mobileSelectedDate);
                                    const isFuture = d.date > new Date();

                                    const getMobileBgColor = () => {
                                        if (isFuture) return 'bg-white/[0.03]';
                                        if (activeCalendarMetric === 'strain') {
                                            if (d.strain >= 15) return 'bg-athena-strain';
                                            if (d.strain >= 12) return 'bg-athena-strain/75';
                                            if (d.strain >= 9) return 'bg-athena-strain/55';
                                            if (d.strain >= 6) return 'bg-athena-strain/35';
                                            if (d.strain >= 1) return 'bg-athena-strain/20';
                                            return 'bg-white/[0.06]';
                                        }
                                        if (activeCalendarMetric === 'sleep') {
                                            if (d.sleep_score >= 90) return 'bg-athena-purple';
                                            if (d.sleep_score >= 80) return 'bg-athena-purple/75';
                                            if (d.sleep_score >= 70) return 'bg-athena-purple/55';
                                            if (d.sleep_score >= 60) return 'bg-athena-purple/35';
                                            if (d.sleep_score >= 1) return 'bg-athena-purple/20';
                                            return 'bg-white/[0.06]';
                                        }
                                        if (activeCalendarMetric === 'recovery') {
                                            if (d.recovery >= 80) return 'bg-athena-green';
                                            if (d.recovery >= 67) return 'bg-athena-green/75';
                                            if (d.recovery >= 50) return 'bg-athena-green/55';
                                            if (d.recovery >= 34) return 'bg-athena-green/35';
                                            if (d.recovery >= 1) return 'bg-athena-green/20';
                                            return 'bg-white/[0.06]';
                                        }
                                        const val = d.day_score;
                                        if (val >= 85) return 'bg-athena-gold';
                                        if (val >= 70) return 'bg-athena-gold/75';
                                        if (val >= 50) return 'bg-athena-gold/50';
                                        if (val >= 30) return 'bg-athena-gold/30';
                                        if (val >= 1) return 'bg-athena-gold/15';
                                        return 'bg-white/[0.06]';
                                    };

                                    return (
                                        <button
                                            key={d.date.toISOString()}
                                            onClick={() => { setMobileSelectedDate(d.date); setSelectedDate(d.date); setMobileDayDrawerOpen(true); }}
                                            className={cn(
                                                "aspect-square rounded-[4px] flex items-center justify-center min-h-[44px] transition-all relative active:scale-[0.92]",
                                                getMobileBgColor(),
                                                isSelected && "ring-1 ring-white/40",
                                                isFuture && "opacity-40"
                                            )}
                                        >
                                            <span className="text-[10px] font-mono text-white/90">{format(d.date, 'd')}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        </div>
                    </>
                )}
            </div>

            {/* Mobile Day Detail Drawer */}
            <MobileDrawerSheet open={mobileDayDrawerOpen} onClose={() => setMobileDayDrawerOpen(false)} title={selectedDate ? format(selectedDate, 'EEEE, MMM d') : ''}>
                {selectedDayData && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { label: 'Day Score', value: `${selectedDayData.day_score}%`, show: true },
                                { label: 'Habits', value: `${selectedDayData.habits_completed}/${selectedDayData.total_habits}`, show: selectedDayData.total_habits > 0 },
                                { label: 'Recovery', value: selectedDayData.recovery != null ? `${selectedDayData.recovery}%` : '--', show: whoopEnabled },
                                { label: 'Strain', value: selectedDayData.strain != null ? selectedDayData.strain.toFixed(1) : '--', show: whoopEnabled },
                                { label: 'Sleep', value: selectedDayData.sleep_score != null ? `${selectedDayData.sleep_score}%` : '--', show: whoopEnabled },
                                { label: 'HRV', value: selectedDayData.hrv != null ? `${Math.round(selectedDayData.hrv)}` : '--', show: whoopEnabled },
                            ].filter(item => item.show).map(item => (
                                <div key={item.label} className="flex flex-col items-center justify-center text-center rounded-xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2">
                                    <span className="text-lg font-serif font-bold tabular-nums leading-tight text-athena-text-warm">{item.value}</span>
                                    <span className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">{item.label}</span>
                                </div>
                            ))}
                        </div>
                        {selectedDayData.journal_entries && selectedDayData.journal_entries.length > 0 && (
                            <div className="space-y-1.5">
                                <h3 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em]">Journal</h3>
                                {selectedDayData.journal_entries.map((entry, i) => (
                                    <div key={i} className="pl-2.5 border-l-2 border-white/[0.08] text-xs text-athena-text-warm leading-relaxed">
                                        {entry}
                                    </div>
                                ))}
                            </div>
                        )}
                        {selectedDayData.has_win && (
                            <div className="p-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                <div className="text-[9px] uppercase text-white/30 font-bold font-sans tracking-wider">Win of the Day</div>
                                <p className="text-sm text-athena-text-warm mt-0.5">{selectedDayData.win_text}</p>
                            </div>
                        )}
                        {selectedDate && selectedDate < startOfDay(new Date()) && (
                            <button
                                onClick={() => { setMobileDayDrawerOpen(false); handleOpenReport(); }}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] active:bg-white/[0.04] min-h-[44px]"
                            >
                                <BookOpen size={14} className="text-white/25" />
                                <span className="text-[12px] text-white/30">View Day Report</span>
                            </button>
                        )}
                    </div>
                )}
            </MobileDrawerSheet>

            {/* Mobile Goals Drawer */}
            <MobileDrawerSheet open={mobileGoalsDrawerOpen} onClose={() => setMobileGoalsDrawerOpen(false)} title="Monthly Goals">
                <div className="space-y-2">
                    {goals.map((goal: any) => {
                        const isYesNo = goal.unit === 'yes_no';
                        const isComplete = isYesNo ? goal.current_value >= 1 : goal.current_value >= goal.target_value;
                        const pct = isYesNo ? (isComplete ? 100 : 0) : Math.round((goal.current_value / goal.target_value) * 100);
                        const config = categoryConfig[goal.category] || { icon: Target, color: 'text-athena-gold', barColor: 'bg-athena-gold' };

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
                        <div className="rounded-xl border border-athena-border bg-white/[0.02] p-6 text-center space-y-3">
                            <h3 className="text-sm font-serif text-athena-gold">Set Your First Goal</h3>
                            <p className="text-xs text-athena-text-muted">Track progress with visual rings tied to your habits.</p>
                            <button
                                onClick={() => { setMobileGoalsDrawerOpen(false); setSelectedGoal(null); setIsGoalsModalOpen(true); }}
                                className="px-4 py-2 rounded-lg bg-athena-gold/20 text-athena-gold text-xs font-sans font-semibold hover:bg-athena-gold/30 border border-athena-gold/30 transition-all"
                            >
                                Add a Goal
                            </button>
                        </div>
                    )}
                </div>
            </MobileDrawerSheet>

            {/* Mobile Monthly Report Drawer */}
            <MobileDrawerSheet open={mobileReportDrawerOpen} onClose={() => setMobileReportDrawerOpen(false)} title=" " fullScreen>
                <MonthlyReportPanel month={format(currentDate, 'yyyy-MM')} />
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
                        onClick={() => setMobileGoalsDrawerOpen(true)}
                        className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center"
                    >
                        <Target size={18} className="text-white/25" />
                        <span className="text-[10px] text-white/25">Goals</span>
                    </button>
                </div>
            </div>

            {/* ==================== DESKTOP LAYOUT ==================== */}
            <div className="hidden md:block relative z-10 px-4 md:px-8 lg:px-16 py-6 max-w-7xl mx-auto space-y-8">

                {/* SECTION 2: MONTH HEADER */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <div className="text-[10px] text-athena-text-muted uppercase tracking-[0.3em] font-semibold mb-2 font-sans">Monthly Overview</div>
                        <h1 className="text-2xl md:text-4xl lg:text-5xl font-serif mt-2">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-athena-gold to-athena-gold-pale">
                                {format(currentDate, 'MMMM')}
                            </span>
                            <span className="text-athena-text-primary ml-2">
                                {format(currentDate, 'yyyy')}
                            </span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrevMonth}
                            className="p-2 rounded-lg border border-athena-border hover:bg-athena-gold/10 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-athena-gold" />
                        </button>
                        <button
                            onClick={() => setCurrentDate(new Date())}
                            className="px-3 py-1.5 text-xs font-sans rounded-lg border border-athena-border hover:bg-athena-gold/10 text-athena-text-muted transition-colors"
                        >
                            This Month
                        </button>
                        <button
                            onClick={handleNextMonth}
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
                        {/* SECTION 3: MONTH STATS */}
                        <motion.section
                            variants={sectionFade}
                            initial="hidden"
                            animate="visible"
                            transition={{ delay: 0.1 }}
                        >
                            <h2 className="text-lg font-serif text-athena-gold mb-3">Month Stats</h2>
                            <div className={cn("grid grid-cols-2 gap-3", whoopEnabled ? "md:grid-cols-4 lg:grid-cols-7" : "md:grid-cols-2 lg:grid-cols-4")}>
                                {(() => {
                                    const daysAbove80 = monthData.filter(d => d.total_habits > 0 && (d.habits_completed / d.total_habits) * 100 >= 80).length;
                                    const totalDaysInMonth = monthData.length;

                                    const allCards = [
                                        { label: 'Avg. Habits', value: `${averages.day}%`, icon: Check, color: 'text-athena-gold', sub: `${daysAbove80}/${totalDaysInMonth} days above 80%`, delta: prevMonthDeltas.habits, deltaUnit: '%', higherIsBetter: true, isWhoop: false },
                                        { label: 'Avg. Recovery', value: `${averages.recovery}%`, icon: Heart, color: 'text-athena-green', sub: `HRV ${averages.hrv} · RHR ${averages.rhr}`, delta: prevMonthDeltas.recovery, deltaUnit: '%', higherIsBetter: true, isWhoop: true },
                                        { label: 'Avg. Strain', value: `${averages.strain}`, icon: Zap, color: 'text-athena-strain', sub: `${averages.calories.toLocaleString()} cal/day`, delta: prevMonthDeltas.strain, deltaUnit: '', higherIsBetter: null, isWhoop: true },
                                        { label: 'Avg. Sleep', value: `${averages.sleep}%`, icon: Moon, color: 'text-athena-purple', sub: `${averages.sleep_hours}h avg`, delta: prevMonthDeltas.sleep, deltaUnit: '%', higherIsBetter: true, isWhoop: true },
                                        { label: 'Workouts', value: `${workouts.length}`, icon: Dumbbell, color: 'text-athena-gold', sub: 'Total sessions', delta: null, deltaUnit: '', higherIsBetter: null, isWhoop: false },
                                        { label: 'Project Tasks', value: `${projectTasksDone}`, icon: ListChecks, color: 'text-athena-gold', sub: `${projectTasksTotal} total open`, delta: null, deltaUnit: '', higherIsBetter: null, isWhoop: false },
                                        { label: 'Goals Finished', value: `${goals.filter(g => g.current_value >= g.target_value).length}`, icon: Target, color: 'text-athena-gold-pale', sub: `${goals.length} total`, delta: null, deltaUnit: '', higherIsBetter: null, isWhoop: false },
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
                                        <div className={cn("text-xl md:text-3xl font-serif", stat.color)}>{stat.value}</div>
                                        <div className="text-[11px] text-athena-text-muted mt-1">{stat.label}</div>
                                        <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{stat.sub}</div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.section>

                        {/* SECTION: HIGHLIGHTS */}
                        {monthData.length > 0 && (() => {
                            const pastDays = monthData.filter(d => d.date <= new Date() && d.total_habits > 0);
                            if (!pastDays.length) return null;

                            const compositeScore = (d: typeof pastDays[0]) => {
                                let sum = d.day_score;
                                let count = 1;
                                if (whoopEnabled) {
                                    if (d.recovery > 0) { sum += d.recovery; count++; }
                                    if (d.sleep_score > 0) { sum += d.sleep_score; count++; }
                                }
                                return Math.round(sum / count);
                            };
                            const bestDay = pastDays.reduce((best, d) => compositeScore(d) > compositeScore(best) ? d : best, pastDays[0]);

                            const daysWithRecovery = pastDays.filter(d => d.recovery > 0);
                            const bestRecovery = daysWithRecovery.length > 0
                                ? daysWithRecovery.reduce((best, d) => d.recovery > best.recovery ? d : best, daysWithRecovery[0])
                                : null;

                            const daysWithStrain = pastDays.filter(d => d.strain > 0);
                            const peakStrain = daysWithStrain.length > 0
                                ? daysWithStrain.reduce((best, d) => d.strain > best.strain ? d : best, daysWithStrain[0])
                                : null;

                            const sorted = [...pastDays].sort((a, b) => a.date.getTime() - b.date.getTime());
                            let longestStreak90 = 0;
                            let currentRun = 0;
                            for (const d of sorted) {
                                if (d.day_score >= 90) { currentRun++; longestStreak90 = Math.max(longestStreak90, currentRun); }
                                else { currentRun = 0; }
                            }

                            // Non-WHOOP alternatives (desktop): Top Streak and Best Week
                            const dHabitMap = new Map<string, string[]>();
                            for (const t of dailyTasks.filter(t => !t.is_one_off && t.status === 'Completed')) {
                                const arr = dHabitMap.get(t.title) || [];
                                arr.push(t.date);
                                dHabitMap.set(t.title, arr);
                            }
                            // Build date-based schedule sets for desktop streak calc
                            const dAllTaskDatesMap = new Map<string, Set<string>>();
                            for (const t of dailyTasks.filter(t => !t.is_one_off)) {
                                if (!dAllTaskDatesMap.has(t.title)) dAllTaskDatesMap.set(t.title, new Set());
                                dAllTaskDatesMap.get(t.title)!.add(t.date);
                            }

                            let dTopStreakName = '';
                            let dTopStreakCount = 0;
                            dHabitMap.forEach((dates, name) => {
                                const hasHabit = name in habitFreqMap;
                                const freq = hasHabit ? habitFreqMap[name] : null;
                                const scheduledDates = !hasHabit ? dAllTaskDatesMap.get(name) : undefined;

                                const sd = [...dates].sort();
                                const completedSet = new Set(sd);
                                let streak = 0, maxS = 0;
                                for (let i = 0; i < sd.length; i++) {
                                    if (i === 0) { streak = 1; }
                                    else {
                                        const prev = new Date(sd[i - 1] + 'T12:00:00');
                                        const curr = new Date(sd[i] + 'T12:00:00');
                                        let hasMissed = false;
                                        const check = new Date(prev);
                                        check.setDate(check.getDate() + 1);
                                        while (check < curr) {
                                            const checkStr = check.toLocaleDateString('en-CA');
                                            const isScheduled = scheduledDates
                                                ? scheduledDates.has(checkStr)
                                                : (!freq || freq.includes(check.getDay()));
                                            if (isScheduled && !completedSet.has(checkStr)) { hasMissed = true; break; }
                                            check.setDate(check.getDate() + 1);
                                        }
                                        streak = hasMissed ? 1 : streak + 1;
                                    }
                                    if (streak > maxS) { maxS = streak; dTopStreakName = name; dTopStreakCount = maxS; }
                                }
                            });

                            let dBestWeekAvg = 0;
                            let dBestWeekRange = '';
                            if (sorted.length >= 7) {
                                for (let i = 0; i <= sorted.length - 7; i++) {
                                    const w = sorted.slice(i, i + 7);
                                    const avg = Math.round(w.reduce((s, d) => s + d.day_score, 0) / 7);
                                    if (avg > dBestWeekAvg) {
                                        dBestWeekAvg = avg;
                                        dBestWeekRange = `${format(w[0].date, 'MMM d')}–${format(w[6].date, 'd')}`;
                                    }
                                }
                            }

                            return (
                                <motion.section variants={sectionFade} initial="hidden" animate="visible" transition={{ delay: 0.15 }}>
                                    <DataMaturityProvider>
                                    <DataGate feature="monthHighlights">
                                    <h2 className="text-lg font-serif text-athena-gold mb-3">Highlights</h2>
                                    <div className="grid grid-cols-4 gap-3">
                                        <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                            <div className="text-xl md:text-3xl font-serif text-athena-gold">{compositeScore(bestDay)}%</div>
                                            <div className="text-[11px] text-athena-text-muted mt-1">Best Day</div>
                                            <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{format(bestDay.date, 'MMM d')}</div>
                                        </div>
                                        {whoopEnabled ? (
                                            <>
                                                <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                                    <div className="text-xl md:text-3xl font-serif text-athena-gold">{bestRecovery ? `${bestRecovery.recovery}%` : '--'}</div>
                                                    <div className="text-[11px] text-athena-text-muted mt-1">Best Recovery</div>
                                                    {bestRecovery && <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{format(bestRecovery.date, 'MMM d')}</div>}
                                                </div>
                                                <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                                    <div className="text-xl md:text-3xl font-serif text-athena-gold">{peakStrain ? peakStrain.strain.toFixed(1) : '--'}</div>
                                                    <div className="text-[11px] text-athena-text-muted mt-1">Peak Strain</div>
                                                    {peakStrain && <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{format(peakStrain.date, 'MMM d')}</div>}
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                                    <div className="text-xl md:text-3xl font-serif text-athena-gold">{dTopStreakCount > 0 ? `${dTopStreakCount}d` : '--'}</div>
                                                    <div className="text-[11px] text-athena-text-muted mt-1">Top Streak</div>
                                                    {dTopStreakCount > 0 && <div className="text-[10px] text-athena-text-muted/70 mt-0.5 truncate">{dTopStreakName}</div>}
                                                </div>
                                                <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                                    <div className="text-xl md:text-3xl font-serif text-athena-gold">{dBestWeekAvg > 0 ? `${dBestWeekAvg}%` : '--'}</div>
                                                    <div className="text-[11px] text-athena-text-muted mt-1">Best Week</div>
                                                    {dBestWeekRange && <div className="text-[10px] text-athena-text-muted/70 mt-0.5">{dBestWeekRange}</div>}
                                                </div>
                                            </>
                                        )}
                                        <div className="p-4 rounded-xl border border-athena-border bg-white/[0.02] text-center">
                                            <div className="text-xl md:text-3xl font-serif text-athena-gold">{longestStreak90}d</div>
                                            <div className="text-[11px] text-athena-text-muted mt-1">90%+ Run</div>
                                        </div>
                                    </div>
                                    </DataGate>
                                    </DataMaturityProvider>
                                </motion.section>
                            );
                        })()}

                        {/* SECTION 4: MAIN CONTENT LAYOUT */}
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                            {/* LEFT: CALENDAR HEATMAP */}
                            <motion.section
                                variants={sectionFade}
                                initial="hidden"
                                animate="visible"
                                transition={{ delay: 0.2 }}
                            >
                                <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3 sm:p-4 md:p-6 min-h-[400px] md:min-h-[500px]">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 md:mb-6 gap-3">
                                        <h2 className="text-lg font-serif text-athena-gold">Calendar Map</h2>

                                        {whoopEnabled && (
                                        <div className="flex bg-athena-bg border border-athena-border rounded-full p-1">
                                            {(['day', 'recovery', 'strain', 'sleep'] as const).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => setActiveCalendarMetric(m)}
                                                    className={cn(
                                                        "px-2 sm:px-3 py-1 text-[10px] uppercase tracking-wide rounded-full transition-all font-sans",
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

                                    {/* Calendar Grid */}
                                    <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-3 mb-4">
                                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                            <div key={i} className="text-center text-[10px] text-athena-text-muted py-2 font-mono">{d}</div>
                                        ))}

                                        {/* Empty start days */}
                                        {Array.from({ length: getDay(startOfMonth(currentDate)) }).map((_, i) => (
                                            <div key={`empty-${i}`} />
                                        ))}

                                        {monthData.map((d) => {
                                            const isSelected = selectedDate && isSameDay(d.date, selectedDate);

                                            // Determine background color based on metric logic
                                            const getBgColor = () => {
                                                // Future Day Check
                                                const isFuture = d.date > new Date(); // Simple check against now
                                                if (isFuture) return 'bg-athena-bg/30 border border-athena-border/30 opacity-50';

                                                if (activeCalendarMetric === 'strain') {
                                                    if (d.strain >= 15) return 'bg-athena-strain text-white';
                                                    if (d.strain >= 12) return 'bg-athena-strain/75 text-white';
                                                    if (d.strain >= 9) return 'bg-athena-strain/55 text-white';
                                                    if (d.strain >= 6) return 'bg-athena-strain/35 text-white';
                                                    if (d.strain >= 1) return 'bg-athena-strain/20 text-athena-text-primary';
                                                    return 'bg-athena-bg border border-athena-border/50 text-athena-text-muted';
                                                }
                                                if (activeCalendarMetric === 'sleep') {
                                                    if (d.sleep_score >= 90) return 'bg-athena-purple text-white';
                                                    if (d.sleep_score >= 80) return 'bg-athena-purple/75 text-white';
                                                    if (d.sleep_score >= 70) return 'bg-athena-purple/55 text-white';
                                                    if (d.sleep_score >= 60) return 'bg-athena-purple/35 text-white';
                                                    if (d.sleep_score >= 1) return 'bg-athena-purple/20 text-athena-text-primary';
                                                    return 'bg-athena-bg border border-athena-border/50 text-athena-text-muted';
                                                }
                                                if (activeCalendarMetric === 'recovery') {
                                                    if (d.recovery >= 80) return 'bg-athena-green text-black';
                                                    if (d.recovery >= 67) return 'bg-athena-green/75 text-white';
                                                    if (d.recovery >= 50) return 'bg-athena-green/55 text-white';
                                                    if (d.recovery >= 34) return 'bg-athena-green/35 text-white';
                                                    if (d.recovery >= 1) return 'bg-athena-green/20 text-athena-text-primary';
                                                    return 'bg-athena-bg border border-athena-border/50 text-athena-text-muted';
                                                }
                                                // Day — shades of accent color
                                                const val = d.day_score;
                                                if (val >= 100) return 'bg-athena-gold text-black shadow-[0_0_12px_rgb(var(--athena-gold))] animate-pulse-subtle';
                                                if (val >= 85) return 'bg-athena-gold text-black';
                                                if (val >= 70) return 'bg-athena-gold/75 text-white';
                                                if (val >= 50) return 'bg-athena-gold/55 text-white';
                                                if (val >= 30) return 'bg-athena-gold/35 text-white';
                                                if (val >= 1) return 'bg-athena-gold/20 text-athena-text-primary';
                                                return 'bg-athena-bg border border-athena-border/50 text-athena-text-muted';
                                            };

                                            const getValue = () => {
                                                if (d.date > new Date()) return ''; // Blank for future

                                                switch (activeCalendarMetric) {
                                                    case 'strain': return d.strain != null ? d.strain.toFixed(1) : '-';
                                                    case 'recovery': return d.recovery != null ? `${d.recovery}%` : '-';
                                                    case 'sleep': return d.sleep_score != null ? `${d.sleep_score}%` : '-';
                                                    default: return `${d.day_score}%`;
                                                }
                                            };

                                            return (
                                                <motion.div
                                                    key={d.date.toISOString()}
                                                    onClick={() => setSelectedDate(d.date)}
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    className={cn(
                                                        "aspect-square rounded-[10px] relative cursor-pointer transition-all group overflow-hidden font-serif",
                                                        getBgColor(),
                                                        isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-athena-bg shadow-xl z-10" : "hover:opacity-80"
                                                    )}
                                                >
                                                    <span className="absolute top-1 left-1.5 text-[10px] opacity-60 font-mono">
                                                        {format(d.date, 'd')}
                                                    </span>

                                                    <span className={cn("text-[10px] sm:text-sm md:text-lg font-serif font-bold mt-4 flex items-center justify-center h-full", activeCalendarMetric === 'strain' ? "tracking-tighter" : "")}>
                                                        {getValue()}
                                                    </span>
                                                </motion.div>
                                            );
                                        })}
                                    </div>

                                    {/* Legend */}
                                    <div className="flex items-center gap-4 mt-6 pt-4 border-t border-athena-border/30">
                                        <span className="text-[9px] text-athena-text-muted uppercase tracking-wider font-sans">Metric Scale</span>
                                        <div className="flex items-center gap-1">
                                            {(() => {
                                                if (activeCalendarMetric === 'strain') return [
                                                    'bg-athena-strain/20', 'bg-athena-strain/40', 'bg-athena-strain/60', 'bg-athena-strain/80', 'bg-athena-strain'
                                                ];
                                                if (activeCalendarMetric === 'sleep') return [
                                                    'bg-athena-purple/20', 'bg-athena-purple/40', 'bg-athena-purple/60', 'bg-athena-purple/80', 'bg-athena-purple'
                                                ];
                                                if (activeCalendarMetric === 'recovery') return [
                                                    'bg-athena-green/20', 'bg-athena-green/40', 'bg-athena-green/60', 'bg-athena-green/80', 'bg-athena-green'
                                                ];
                                                return ['bg-athena-gold/20', 'bg-athena-gold/40', 'bg-athena-gold/60', 'bg-athena-gold/80', 'bg-athena-gold'];
                                            })().map((c, i) => (
                                                <div key={i} className={cn("w-6 h-4 rounded", c)} />
                                            ))}
                                        </div>
                                        <span className="text-[10px] text-athena-text-muted ml-2 font-sans">Light &rarr; Dark</span>
                                    </div>
                                </div>
                            </motion.section>

                            {/* RIGHT: SIDEBAR (Day Report + Goals) */}
                            <div className="space-y-6">
                                {/* Day Report Card */}
                                <motion.div
                                    variants={sectionFade}
                                    initial="hidden"
                                    animate="visible"
                                    transition={{ delay: 0.25 }}
                                    className="border border-athena-border rounded-xl bg-white/[0.02] p-5"
                                >
                                    <div className="border-b border-athena-border/50 pb-3 mb-4 flex justify-between items-center">
                                        <h3 className="text-lg font-serif text-athena-gold">
                                            {selectedDate ? format(selectedDate, 'MMMM do') : 'Select a Day'}
                                        </h3>
                                        {/* View Full Report Icon (Only for past days) */}
                                        {selectedDate && selectedDate < startOfDay(new Date()) && (
                                            <button
                                                onClick={handleOpenReport}
                                                className="text-athena-text-muted hover:text-athena-gold transition-colors"
                                                title="View Full Report"
                                            >
                                                <BookOpen size={16} />
                                            </button>
                                        )}
                                    </div>

                                    {selectedDayData ? (
                                        <div className="space-y-4">
                                            <div className={cn("grid gap-2", whoopEnabled ? "grid-cols-2" : "grid-cols-1")}>
                                                {[
                                                    { label: 'Day', value: `${selectedDayData.day_score}%`, color: 'text-athena-gold', isWhoop: false },
                                                    { label: 'Recovery', value: selectedDayData.recovery != null ? `${selectedDayData.recovery}%` : '-', color: 'text-athena-green', isWhoop: true },
                                                    { label: 'Strain', value: selectedDayData.strain != null ? selectedDayData.strain.toFixed(1) : '-', color: 'text-athena-strain', isWhoop: true },
                                                    { label: 'Sleep', value: selectedDayData.sleep_score != null ? `${selectedDayData.sleep_score}%` : '-', color: 'text-athena-purple', isWhoop: true },
                                                ].filter(item => whoopEnabled || !item.isWhoop).map((item) => (
                                                    <div key={item.label} className="p-3 rounded-lg border border-athena-border/30 bg-white/[0.02] text-center">
                                                        <div className="text-[10px] uppercase tracking-wider text-athena-text-muted mb-1 font-sans">{item.label}</div>
                                                        <div className={cn("text-xl font-bold font-serif", item.color)}>{item.value}</div>
                                                    </div>
                                                ))}
                                            </div>

                                            {selectedDayData.has_win && (
                                                <div className="p-3 rounded-lg border border-athena-gold/20 bg-athena-gold/5">
                                                    <div className="text-[9px] uppercase text-athena-gold font-bold mb-1 font-sans tracking-wider">Win of the day</div>
                                                    <p className="text-sm text-athena-text-primary font-medium">{selectedDayData.win_text}</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-athena-text-muted text-sm">
                                            Click a day to view details
                                        </div>
                                    )}
                                </motion.div>

                                {/* Monthly Goals Card */}
                                <motion.div
                                    variants={sectionFade}
                                    initial="hidden"
                                    animate="visible"
                                    transition={{ delay: 0.3 }}
                                    className="border border-athena-border rounded-xl bg-white/[0.02] p-5"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg font-serif text-athena-gold">Monthly Goals</h2>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] bg-athena-gold/20 text-athena-gold px-1.5 py-0.5 rounded font-mono">{goals.length}</span>
                                            <button
                                                onClick={() => { setSelectedGoal(null); setIsGoalsModalOpen(true); }}
                                                className="text-athena-text-muted hover:text-athena-gold transition-colors"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div data-onboarding="goals-section" className="space-y-2">
                                        {goals.length === 0 && (
                                            <div className="rounded-xl border border-athena-border bg-white/[0.02] p-6 text-center space-y-3">
                                                <h3 className="text-sm font-serif text-athena-gold">Set Your First Goal</h3>
                                                <p className="text-xs text-athena-text-muted">Track progress with visual rings tied to your habits.</p>
                                                <button
                                                    onClick={() => { setSelectedGoal(null); setIsGoalsModalOpen(true); }}
                                                    className="px-4 py-2 rounded-lg bg-athena-gold/20 text-athena-gold text-xs font-sans font-semibold hover:bg-athena-gold/30 border border-athena-gold/30 transition-all"
                                                >
                                                    Add a Goal
                                                </button>
                                            </div>
                                        )}

                                        {/* Goal Progress Rings + Yes/No goals */}
                                        {(() => {
                                            const categoryRingColors: Record<string, string> = {
                                                Health: '#6bbd6b',
                                                Growth: '#b99adf',
                                                Athena: '#d4a843',
                                                Work: '#e09550',
                                            };
                                            const dayOfMonth = new Date().getDate();
                                            const daysInMonth = getDaysInMonth(currentDate);
                                            const timeElapsedPct = Math.round((dayOfMonth / daysInMonth) * 100);

                                            const numericGoals = goals.filter((g: any) => g.unit !== 'yes_no');
                                            const yesNoGoals = goals.filter((g: any) => g.unit === 'yes_no');

                                            return (
                                                <>
                                                    {numericGoals.length > 0 && (
                                                        <div className="mb-3">
                                                            <GoalProgressRings
                                                                goals={numericGoals.map((goal: any) => ({
                                                                    title: goal.title,
                                                                    current: goal.current_value,
                                                                    target: goal.target_value,
                                                                    unit: goal.unit === '%' ? '%' : goal.unit,
                                                                    timeElapsedPct,
                                                                    color: categoryRingColors[goal.category] || 'rgb(var(--athena-gold))',
                                                                }))}
                                                                onGoalClick={(idx) => {
                                                                    setSelectedGoal(numericGoals[idx]);
                                                                    setIsGoalsModalOpen(true);
                                                                }}
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Yes/No goals as compact rows */}
                                                    {yesNoGoals.map((goal: any, i: number) => {
                                                        const isComplete = goal.current_value >= 1;
                                                        return (
                                                            <motion.div
                                                                key={goal.id}
                                                                custom={i}
                                                                variants={fadeSlide}
                                                                initial="hidden"
                                                                animate="visible"
                                                                onClick={() => { setSelectedGoal(goal); setIsGoalsModalOpen(true); }}
                                                                className="p-3 rounded-xl border border-athena-border bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors"
                                                            >
                                                                <div className="flex justify-between items-center gap-3">
                                                                    <span className="text-xs font-medium text-athena-text-primary truncate">{goal.title}</span>
                                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                                        {isComplete
                                                                            ? <CheckCircle className="w-4 h-4 text-athena-green" />
                                                                            : <Circle className="w-4 h-4 text-athena-text-muted" />
                                                                        }
                                                                        <span className={cn("text-[10px]", isComplete ? "text-athena-green" : "text-athena-text-muted")}>
                                                                            {isComplete ? 'Done' : 'Pending'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        );
                                                    })}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </motion.div>
                            </div>
                        </div>
                        <MonthlyReportPanel month={format(currentDate, 'yyyy-MM')} />
                    </>
                )}
            </div>

            {/* Modals */}
            {reportModalDate && (
                <DayReportModal
                    isOpen={isReportModalOpen}
                    onClose={() => setIsReportModalOpen(false)}
                    date={reportModalDate}
                    onDataChange={fetchMonthData}
                />
            )}
            <UnifiedGoalsModal
                isOpen={isGoalsModalOpen}
                onClose={() => setIsGoalsModalOpen(false)}
                currentMonthDate={currentDate}
                currentYear={currentDate.getFullYear()}
                goalToEdit={selectedGoal}
                defaultType="monthly"
                onSave={fetchGoals}
            />
            <BatchReviewModal
                isOpen={isBatchReviewOpen}
                onClose={() => setIsBatchReviewOpen(false)}
                currentMonthDate={currentDate}
                pendingGoals={prevMonthGoals}
                onComplete={fetchGoals}
            />
        </div>
    );
}
