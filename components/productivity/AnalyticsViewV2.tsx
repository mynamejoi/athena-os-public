'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths, subMonths, addYears, subYears } from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Heart } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';

import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { transformDataForDashboard } from './analytics/utils';
import { DashboardDayData } from './analytics/types';
import { T, fmtTime } from './analytics/SharedUI';
import { TrainingCalendarChartV2 } from './charts/TrainingCalendarChartV2';
import { HabitInsightsSection } from './analytics/HabitInsightsSection';
import { DataMaturityProvider, DataGate } from './DataGate';
import { toast } from 'sonner';
import { RecoveryZoneTrend } from './charts/RecoveryZoneTrend';
import { HrvRollingAverage } from './charts/HrvRollingAverage';
import { RhrInverseTrend } from './charts/RhrInverseTrend';
import { SleepStageNightly } from './charts/SleepStageNightly';
import { BedtimeWakeRange } from './charts/BedtimeWakeRange';
import { SleepProductivityScatter } from './charts/SleepProductivityScatter';
import { BehaviorImpactBars } from './charts/BehaviorImpactBars';
import { RecoveryTrainingHeatmap } from './charts/RecoveryTrainingHeatmap';
import { SparklineRow } from './charts/SparklineRow';
import { HabitScoreRollingTrend } from './charts/HabitScoreRollingTrend';
import { CoachComplianceDonut } from './charts/CoachComplianceDonut';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    Bar, ComposedChart, Line, ReferenceLine, ReferenceArea,
    ScatterChart, Scatter, Cell, LineChart,
    CartesianGrid,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    PieChart, Pie, BarChart, Legend
} from 'recharts';

type RangeMode = 'month' | 'year';

// ── Helper: workout split from task ──
const getWorkoutSplitFromTask = (tasks: any[], date: string) => {
    const workoutTask = tasks.find((t: any) => {
        if (t.date !== date) return false;
        const tl = t.title.toLowerCase();
        return tl.includes('gym') || tl.startsWith('push') || tl.startsWith('pull') || tl === 'legs';
    });
    if (!workoutTask) return null;
    // Legacy "Gym (...)" format: extract parenthetical for normalization
    if (workoutTask.title.toLowerCase().startsWith('gym')) {
        const match = workoutTask.title.match(/\((.+)\)\s*$/);
        return match ? match[1] : workoutTask.title;
    }
    // New format: "Push (Chest)", "Pull (Back)", "Legs" — return as-is
    return workoutTask.title;
};

// ── Section header ──
function SectionHeader({ children }: { children: React.ReactNode }) {
    return <h2 className="text-lg font-serif text-athena-gold mb-3">{children}</h2>;
}

// ── Glass card wrapper ──
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("bg-white/[0.02] border border-athena-border rounded-xl p-4", className)}>
            {children}
        </div>
    );
}

// ── Collapsible mobile section ──
function MobileSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = React.useState(defaultOpen);
    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between py-2 px-1">
                    <span className="text-[11px] uppercase tracking-widest text-athena-gold font-semibold font-sans">{title}</span>
                    <ChevronDown className={cn("w-4 h-4 text-athena-text-muted transition-transform", open && "rotate-180")} />
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3">
                {children}
            </CollapsibleContent>
        </Collapsible>
    );
}

// ── Compact metric card (Section 5) ──
function CompactMetric({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="bg-white/[0.02] border border-athena-border rounded-xl px-2 py-1.5 md:p-3 flex flex-row items-center gap-1.5 md:flex-col md:items-center md:justify-center md:text-center min-h-0 md:min-h-[72px]">
            <div className="text-base font-bold md:text-xl md:font-serif md:font-medium leading-none" style={{ color }}>{value}</div>
            <div className="text-[10px] text-athena-text-muted uppercase tracking-wider md:mt-1.5 font-sans">{label}</div>
        </div>
    );
}

// ── Custom tooltip ──
function ChartTooltip({ active, payload, label, formatter }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', fontFamily: 'var(--font-manrope), sans-serif' }}>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 4 }}>{label}</div>
            {payload.map((p: any, i: number) => (
                <div key={i} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
                    <span style={{ color: T.textMuted }}>{p.name}:</span>
                    <span style={{ color: p.color, fontWeight: 600 }}>{formatter ? formatter(p.value, p.name) : p.value}</span>
                </div>
            ))}
        </div>
    );
}

// ── type colors for workouts ──
const typeColors: Record<string, string> = {
    'Push (Chest)': '#f472b6', 'Push (Tricep)': '#e879a0',
    'Pull (Bicep)': '#60a5fa', 'Pull (Back)': '#3b82f6',
    Push: '#f472b6', Pull: '#3b82f6', Legs: '#a855f7',
    Cardio: T.gold, Recovery: T.green, Gym: '#9ca3af', Other: '#6b7280',
    Basketball: '#f97316', Golf: '#22c55e', Running: '#3b82f6', Swimming: '#06b6d4', Cycling: '#3b82f6'
};

export default function AnalyticsViewV2() {
    const { whoopEnabled } = useWhoopMode();
    const supabase = createClient();

    const [rangeMode, setRangeMode] = useState<RangeMode>('month');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [calFilter, setCalFilter] = useState("All");
    const [touchStart, setTouchStart] = useState<number | null>(null);

    // Data State
    const [whoopData, setWhoopData] = useState<any[]>([]);
    const [workouts, setWorkouts] = useState<any[]>([]);
    const [dailyTasks, setDailyTasks] = useState<any[]>([]);
    const [allDailyTasks, setAllDailyTasks] = useState<any[]>([]);
    const [weeklyPlans, setWeeklyPlans] = useState<any[]>([]);

    // Compute date range based on mode
    const dateRange = useMemo(() => {
        if (rangeMode === 'month') {
            return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
        } else {
            return { start: startOfYear(currentDate), end: endOfYear(currentDate) };
        }
    }, [rangeMode, currentDate]);

    const headerLabel = useMemo(() => {
        return rangeMode === 'month' ? format(currentDate, 'MMMM yyyy') : format(currentDate, 'yyyy');
    }, [rangeMode, currentDate]);

    const handlePrev = () => {
        setCurrentDate(d => rangeMode === 'month' ? subMonths(d, 1) : subYears(d, 1));
    };
    const handleNext = () => {
        setCurrentDate(d => rangeMode === 'month' ? addMonths(d, 1) : addYears(d, 1));
    };

    // Data Fetching
    const fetchData = useCallback(async () => {
        setLoading(true);
        const startStr = format(dateRange.start, 'yyyy-MM-dd');
        const endStr = format(dateRange.end, 'yyyy-MM-dd');

        try {
            const [workoutsRes, { data: whoopDataRaw }, { data: tasksData }, { data: allTasksData }, { data: plansData }] = await Promise.all([
                fetch(`/api/productivity/workouts?start_date=${startStr}&end_date=${endStr}`).then(r => r.json()),
                supabase.from('whoop_data').select('*').gte('date', startStr).lte('date', endStr),
                supabase.from('daily_tasks').select('*').gte('date', startStr).lte('date', endStr).or('title.ilike.%gym%,title.ilike.push%,title.ilike.pull%,title.ilike.legs'),
                supabase.from('daily_tasks').select('*').gte('date', startStr).lte('date', endStr),
                supabase.from('workout_weekly_plans').select('week_start, plan').gte('week_start', startStr).lte('week_start', endStr)
            ]);
            const workoutsApiData = workoutsRes;

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
            setAllDailyTasks(allTasksData || []);
            setWeeklyPlans(plansData || []);
        } catch (error) {
            console.error("Failed to fetch analytics data", error);
        } finally {
            setLoading(false);
        }
    }, [dateRange.start, dateRange.end]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSyncWhoop = async () => {
        setIsSyncing(true);
        const toastId = toast.loading('Syncing Whoop data...');
        try {
            const res = await fetch('/api/whoop/sync', { method: 'POST' });
            if (!res.ok) throw new Error('Sync failed');
            toast.success('Whoop data synced', { id: toastId });
            await fetchData();
        } catch (error) {
            console.error(error);
            toast.error('Sync failed', { id: toastId });
        } finally {
            setIsSyncing(false);
        }
    };

    // ── Transformed dashboard data ──
    const data = useMemo(() => transformDataForDashboard(dateRange.start, whoopData, workouts, dailyTasks, rangeMode), [dateRange.start, whoopData, workouts, dailyTasks, rangeMode]);

    // ── Derived data sets ──
    const validRecovery = useMemo(() => data.filter(d => d.recovery !== null), [data]);
    const validSleep = useMemo(() => data.filter(d => d.sleepScore !== null && d.sleep_hours !== null), [data]);
    const activeData = useMemo(() => data.filter(d => (d.strain || 0) > 0 || (d.recovery || 0) > 0), [data]);

    // ── Section 1: Trends data ──
    const trendData = useMemo(() => {
        if (rangeMode === 'year') {
            const months: DashboardDayData[][] = Array.from({ length: 12 }, () => []);
            data.forEach(d => {
                const date = new Date(d.date);
                if (!isNaN(date.getTime())) months[date.getMonth()].push(d);
            });
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return months.map((m, i) => {
                if (m.length === 0) return { label: monthNames[i], recovery: null, sleep: null, strain: null };
                const validR = m.filter(d => d.recovery !== null);
                const validS = m.filter(d => d.sleepScore !== null);
                const validSt = m.filter(d => d.strain !== null && (d.strain || 0) > 0);
                return {
                    label: monthNames[i],
                    recovery: validR.length ? Math.round(validR.reduce((a, d) => a + d.recovery!, 0) / validR.length) : null,
                    sleep: validS.length ? Math.round(validS.reduce((a, d) => a + d.sleepScore!, 0) / validS.length) : null,
                    strain: validSt.length ? +(validSt.reduce((a, d) => a + (d.strain || 0), 0) / validSt.length).toFixed(1) : null,
                };
            });
        }
        return data.map(d => ({
            label: String(d.day),
            recovery: d.recovery,
            sleep: d.sleepScore,
            strain: d.strain,
        }));
    }, [data, rangeMode]);

    const avgRecovery = useMemo(() => {
        const v = trendData.filter(d => d.recovery !== null);
        return v.length ? Math.round(v.reduce((a, d) => a + d.recovery!, 0) / v.length) : 0;
    }, [trendData]);

    const avgSleep = useMemo(() => {
        const v = trendData.filter(d => d.sleep !== null);
        return v.length ? Math.round(v.reduce((a, d) => a + d.sleep!, 0) / v.length) : 0;
    }, [trendData]);

    const avgStrain = useMemo(() => {
        const v = trendData.filter(d => d.strain !== null);
        return v.length ? +(v.reduce((a, d) => a + d.strain!, 0) / v.length).toFixed(1) : 0;
    }, [trendData]);

    // ── Section 2: Training data ──
    const processedWorkouts = useMemo(() => {
        // Only use real WHOOP-synced workouts — no synthetic entries from daily tasks
        return workouts.map((w: any) => {
            const split = getWorkoutSplitFromTask(dailyTasks || [], w.date);
            let type = w.workout_label || w.sport_name || 'Other';
            if (type === 'Leg Day' || type === 'Leg') type = 'Legs';
            else if (type === 'Push Day') type = 'Push (Chest)';
            else if (type === 'Pull Day') type = 'Pull (Bicep)';
            else if (type === 'Push') type = 'Push (Chest)';
            else if (type === 'Pull') type = 'Pull (Bicep)';

            if (w.workout_label && w.workout_label !== w.sport_name) return { ...w, displayType: type };

            const isLifting = ['Functional Fitness', 'Weightlifting', 'Gym', 'Powerlifting', 'CrossFit', 'Box Fitness'].includes(w.sport_name);
            if (split && isLifting) {
                if (split === 'Leg Day') type = 'Legs';
                else if (split === 'Push Day' || split === 'Push') type = 'Push (Chest)';
                else if (split === 'Pull Day' || split === 'Pull') type = 'Pull (Bicep)';
                else type = split;
            }
            if (type === 'Activity' || type === 'General Activity' || type === 'Sport -1') type = 'Other';
            if (type === 'Functional Fitness') type = 'Gym';
            return { ...w, displayType: type };
        });
    }, [workouts, dailyTasks]);

    const byType = useMemo(() => {
        const map: Record<string, { count: number; ts: number; td: number }> = {};
        processedWorkouts.forEach((w: any) => {
            const type = w.displayType;
            if (type === 'Activity' || type === 'General Activity') return;
            if (['Steam Room', 'Sauna', 'Ice Bath'].includes(type)) return;
            if (!map[type]) map[type] = { count: 0, ts: 0, td: 0 };
            map[type].count++;
            map[type].ts += (w.strain || 0);
            map[type].td += ((w.duration_minutes || 0) / 60);
        });
        return Object.entries(map).map(([type, v]) => ({
            type, count: v.count,
            avgStrain: (v.ts / v.count).toFixed(1),
            avgDuration: (v.td / v.count).toFixed(1),
            color: typeColors[type] || T.textMuted,
        })).sort((a, b) => b.count - a.count);
    }, [processedWorkouts]);

    // ACWR
    const acwrData = useMemo(() => {
        const totalDays = activeData.length || 1;
        const chronicLoad = activeData.reduce((a, d) => a + (d.strain || 0), 0) / totalDays;
        const recent = activeData.slice(-7);
        const acuteLoad = recent.length ? recent.reduce((a, d) => a + (d.strain || 0), 0) / recent.length : 0;
        const ratio = +(acuteLoad / (chronicLoad || 1)).toFixed(2);
        const status = ratio < 0.8 ? "Detraining" : ratio > 1.5 ? "Injury Risk" : ratio > 1.3 ? "Caution" : "Sweet Spot";
        const color = ratio < 0.8 ? T.blue : ratio > 1.5 ? T.red : ratio > 1.3 ? T.orange : T.green;
        return { ratio, status, color, acute: acuteLoad.toFixed(1), chronic: chronicLoad.toFixed(1) };
    }, [activeData]);

    // ── Section 3: Sleep data ──
    const architectureData = useMemo(() => {
        if (rangeMode === 'year') {
            const months: DashboardDayData[][] = Array.from({ length: 12 }, () => []);
            data.forEach(d => {
                const date = new Date(d.date);
                if (!isNaN(date.getTime())) months[date.getMonth()].push(d);
            });
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return months.map((m, i) => {
                if (m.length === 0) return { name: monthNames[i], deep: 0, rem: 0, light: 0, awake: 0, recovery: 0 };
                return {
                    name: monthNames[i],
                    deep: Math.round(m.reduce((a, d) => a + (d.deepPct || 0), 0) / m.length),
                    rem: Math.round(m.reduce((a, d) => a + (d.remPct || 0), 0) / m.length),
                    light: Math.round(m.reduce((a, d) => a + (d.lightPct || 0), 0) / m.length),
                    awake: Math.round(m.reduce((a, d) => a + (d.awakePct || 0), 0) / m.length),
                    recovery: Math.round(m.reduce((a, d) => a + (d.recovery || 0), 0) / m.length),
                };
            });
        }
        const w: DashboardDayData[][] = [[], [], [], []];
        data.forEach(d => {
            if (d.deepPct === null) return;
            const weekIndex = Math.floor((d.day - 1) / 7);
            if (w[weekIndex]) w[weekIndex].push(d);
        });
        return w.map((wk, i) => {
            if (wk.length === 0) return { name: `W${i + 1}`, deep: 0, rem: 0, light: 0, awake: 0, recovery: 0 };
            return {
                name: `W${i + 1}`,
                deep: Math.round(wk.reduce((a, d) => a + (d.deepPct || 0), 0) / wk.length),
                rem: Math.round(wk.reduce((a, d) => a + (d.remPct || 0), 0) / wk.length),
                light: Math.round(wk.reduce((a, d) => a + (d.lightPct || 0), 0) / wk.length),
                awake: Math.round(wk.reduce((a, d) => a + (d.awakePct || 0), 0) / wk.length),
                recovery: Math.round(wk.reduce((a, d) => a + (d.recovery || 0), 0) / wk.length),
            };
        });
    }, [data, rangeMode]);

    // Timing consistency
    const timingStats = useMemo(() => {
        if (validSleep.length === 0) return { consistency: 0, avgBedtime: 0, avgWake: 0 };
        const avgBed = validSleep.reduce((a, d) => a + (d.bedtime || 0), 0) / validSleep.length;
        const avgWk = validSleep.reduce((a, d) => a + (d.wakeTime || 0), 0) / validSleep.length;
        const bedStdDev = Math.sqrt(validSleep.reduce((a, d) => a + Math.pow((d.bedtime || avgBed) - avgBed, 2), 0) / validSleep.length);
        return { consistency: Math.round(Math.max(0, 100 - bedStdDev * 60)), avgBedtime: avgBed, avgWake: avgWk };
    }, [validSleep]);

    // Sleep debt line chart
    const sleepDebtData = useMemo(() => {
        return data.map(d => {
            const getDebt = (item: DashboardDayData) =>
                item.whoop_sleep_debt_corrected_hours ?? item.whoop_official_sleep_debt_hours ?? item.whoop_sleep_debt_hours ?? 0;
            const cumulative_debt = Math.max(0, getDebt(d));
            return { day: d.day, date: d.date, cumulative_debt: +cumulative_debt.toFixed(2) };
        });
    }, [data]);

    const currentDebtValue = useMemo(() => {
        const last = [...sleepDebtData].reverse().find(d => d.cumulative_debt > 0);
        return last ? last.cumulative_debt : 0;
    }, [sleepDebtData]);

    // ── Section 4: Correlations ──
    const weekColors = [T.purpleBright, T.blueBright, T.greenBright, T.goldBright];
    const monthColors = [T.purple, T.purpleBright, T.indigo, T.blue, T.blueBright, T.cyan, T.greenDim, T.green, T.greenBright, T.yellow, T.orange, T.red];

    const strainVsRecovery = useMemo(() => {
        return data.filter(d => (d.strain || 0) > 0 && d.recovery !== null).map(d => {
            const date = new Date(d.date);
            const colorIndex = rangeMode === 'year' ? date.getMonth() : Math.floor((d.day - 1) / 7);
            const name = rangeMode === 'year' ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Day ${d.day}`;
            return {
                day: d.day, name, strain: d.strain || 0, recovery: d.recovery!, colorIndex,
                zone: d.recovery! >= 65 && (d.strain || 0) >= 8 ? "Optimal"
                    : d.recovery! >= 65 && (d.strain || 0) < 8 ? "Moderate"
                    : d.recovery! >= 50 && d.recovery! < 65 ? "Low Recovery"
                    : d.recovery! < 50 && (d.strain || 0) >= 8 ? "Overreaching" : "Undertraining"
            };
        });
    }, [data, rangeMode]);

    const strainZoneColors: Record<string, string> = { Optimal: T.green, Moderate: T.yellow, "Low Recovery": T.textDim, Overreaching: T.red, Undertraining: T.blue };

    const sleepVsRecovery = useMemo(() => {
        const points = [];
        for (let i = 0; i < data.length - 1; i++) {
            const d = data[i];
            const next = data[i + 1];
            if (d.sleep_hours !== null && next.recovery !== null) {
                points.push({
                    x: d.sleep_hours, y: next.recovery, day: d.day,
                    zone: d.sleep_hours >= 7
                        ? (next.recovery >= 67 ? "Optimal" : "High Sleep, Low Recovery")
                        : (next.recovery >= 67 ? "Low Sleep, High Recovery" : "Poor"),
                });
            }
        }
        return points;
    }, [data]);

    const sleepZoneColors: Record<string, string> = { "Optimal": T.green, "High Sleep, Low Recovery": T.yellow, "Low Sleep, High Recovery": T.cyan, "Poor": T.red };

    // ── New chart data: Biometric Trends (month mode) ──
    const recoveryZoneData = useMemo(() =>
        data
            .filter(d => d.recovery !== null && d.recovery > 0)
            .map(d => ({ date: format(d.date, 'yyyy-MM-dd'), recovery: d.recovery! })),
        [data]
    );

    const hrvRollingData = useMemo(() => {
        const filtered = data.filter(d => d.hrv !== null && d.hrv > 0);
        return filtered.map((d, idx) => {
            const windowStart = Math.max(0, idx - 6);
            const window = filtered.slice(windowStart, idx + 1);
            const rolling7d = Math.round(window.reduce((s, w) => s + w.hrv!, 0) / window.length);
            return { date: format(d.date, 'yyyy-MM-dd'), hrv: d.hrv!, rolling7d };
        });
    }, [data]);

    const rhrTrendData = useMemo(() =>
        data
            .filter(d => d.rhr !== null && d.rhr > 0)
            .map(d => ({ date: format(d.date, 'yyyy-MM-dd'), rhr: d.rhr! })),
        [data]
    );

    // ── New chart data: Sleep Deep Dive (month mode) ──
    const sleepStageNightlyData = useMemo(() => {
        return data
            .filter(d => (d.deepMins != null || d.deepPct !== null) && d.sleep_hours !== null && d.sleep_hours > 0)
            .map(d => {
                // Use raw minutes if available, otherwise convert from percentages
                if (d.deepMins != null) {
                    return {
                        date: format(d.date, 'yyyy-MM-dd'),
                        deep: d.deepMins || 0,
                        rem: d.remMins || 0,
                        light: d.lightMins || 0,
                        awake: d.awakeMins || 0,
                    };
                }
                const totalMins = (d.sleep_hours || 0) * 60;
                return {
                    date: format(d.date, 'yyyy-MM-dd'),
                    deep: Math.round(((d.deepPct || 0) / 100) * totalMins),
                    rem: Math.round(((d.remPct || 0) / 100) * totalMins),
                    light: Math.round(((d.lightPct || 0) / 100) * totalMins),
                    awake: Math.round(((d.awakePct || 0) / 100) * totalMins),
                };
            });
    }, [data]);

    const bedtimeWakeData = useMemo(() =>
        data
            .filter(d => d.bedtime !== null && d.wakeTime !== null)
            .map(d => ({
                date: format(d.date, 'yyyy-MM-dd'),
                bedtime: d.bedtime!,
                wakeTime: d.wakeTime!,
            })),
        [data]
    );

    // ── New chart data: Correlations (month mode) ──
    const sleepProductivityScatterData = useMemo(() => {
        const result: { sleepScore: number; nextDayHabitScore: number; date: string }[] = [];
        // Compute habit scores per day from allDailyTasks
        const habitScoreByDate: Record<string, number> = {};
        const dateTaskMap: Record<string, { total: number; done: number }> = {};
        allDailyTasks.filter((t: any) => !t.is_one_off).forEach((t: any) => {
            if (!dateTaskMap[t.date]) dateTaskMap[t.date] = { total: 0, done: 0 };
            dateTaskMap[t.date].total++;
            if (t.status === 'Completed') dateTaskMap[t.date].done++;
        });
        Object.entries(dateTaskMap).forEach(([date, v]) => {
            habitScoreByDate[date] = v.total > 0 ? Math.round((v.done / v.total) * 100) : 0;
        });

        for (let i = 0; i < data.length - 1; i++) {
            const d = data[i];
            const nextDate = format(data[i + 1].date, 'yyyy-MM-dd');
            const nextDayScore = habitScoreByDate[nextDate];
            if (d.sleepScore !== null && d.sleepScore > 0 && nextDayScore !== undefined) {
                result.push({
                    sleepScore: d.sleepScore,
                    nextDayHabitScore: nextDayScore,
                    date: format(d.date, 'yyyy-MM-dd'),
                });
            }
        }
        return result;
    }, [data, allDailyTasks]);

    const behaviorImpactData = useMemo(() => {
        // Habits to track: Gym, Meditation, Read, Cold Plunge, Walk, Journal
        const behaviors = ['Gym', 'Meditation', 'Read', 'Cold Plunge', 'Walk', 'Journal'];
        const behaviorDates: Record<string, Set<string>> = {};
        behaviors.forEach(b => { behaviorDates[b] = new Set(); });

        allDailyTasks.forEach((t: any) => {
            const lower = t.title.toLowerCase();
            for (const b of behaviors) {
                if (lower.includes(b.toLowerCase()) && t.status === 'Completed') {
                    behaviorDates[b].add(t.date);
                }
            }
        });

        return behaviors.map(behavior => {
            const datesWithBehavior = behaviorDates[behavior];
            const withRecoveries: number[] = [];
            const withoutRecoveries: number[] = [];

            for (let i = 0; i < data.length - 1; i++) {
                const d = data[i];
                const next = data[i + 1];
                if (next.recovery === null) continue;
                const dateStr = format(d.date, 'yyyy-MM-dd');
                if (datesWithBehavior.has(dateStr)) {
                    withRecoveries.push(next.recovery);
                } else {
                    withoutRecoveries.push(next.recovery);
                }
            }

            if (withRecoveries.length === 0) return null;

            return {
                behavior,
                withAvgRecovery: Math.round(withRecoveries.reduce((a, b) => a + b, 0) / withRecoveries.length),
                withoutAvgRecovery: withoutRecoveries.length > 0
                    ? Math.round(withoutRecoveries.reduce((a, b) => a + b, 0) / withoutRecoveries.length)
                    : 0,
                count: withRecoveries.length,
            };
        }).filter((d): d is NonNullable<typeof d> => d !== null && d.count >= 2);
    }, [data, allDailyTasks]);

    const recoveryTrainingHeatmapData = useMemo(() => {
        const RECOVERY_BUCKETS = ['67-100%', '34-66%', '0-33%'];
        const STRAIN_BUCKETS = ['Low (0-7)', 'Medium (7-14)', 'High (14-21)'];

        // Compute habit scores per day
        const habitScoreByDate: Record<string, number> = {};
        const dateTaskMap: Record<string, { total: number; done: number }> = {};
        allDailyTasks.filter((t: any) => !t.is_one_off).forEach((t: any) => {
            if (!dateTaskMap[t.date]) dateTaskMap[t.date] = { total: 0, done: 0 };
            dateTaskMap[t.date].total++;
            if (t.status === 'Completed') dateTaskMap[t.date].done++;
        });
        Object.entries(dateTaskMap).forEach(([date, v]) => {
            habitScoreByDate[date] = v.total > 0 ? Math.round((v.done / v.total) * 100) : 0;
        });

        const cells: { recoveryBucket: string; strainBucket: string; avgPerformance: number; count: number }[] = [];

        for (const rb of RECOVERY_BUCKETS) {
            for (const sb of STRAIN_BUCKETS) {
                const matching = data.filter(d => {
                    if (d.recovery === null || d.strain === null) return false;
                    const r = d.recovery;
                    const s = d.strain;

                    let rMatch = false;
                    if (rb === '0-33%') rMatch = r >= 0 && r <= 33;
                    else if (rb === '34-66%') rMatch = r >= 34 && r <= 66;
                    else rMatch = r >= 67 && r <= 100;

                    let sMatch = false;
                    if (sb === 'Low (0-7)') sMatch = s >= 0 && s < 7;
                    else if (sb === 'Medium (7-14)') sMatch = s >= 7 && s < 14;
                    else sMatch = s >= 14 && s <= 21;

                    return rMatch && sMatch;
                });

                if (matching.length > 0) {
                    const avgPerf = matching.reduce((sum, d) => {
                        const dateStr = format(d.date, 'yyyy-MM-dd');
                        return sum + (habitScoreByDate[dateStr] ?? 50);
                    }, 0) / matching.length;

                    cells.push({ recoveryBucket: rb, strainBucket: sb, avgPerformance: Math.round(avgPerf), count: matching.length });
                } else {
                    cells.push({ recoveryBucket: rb, strainBucket: sb, avgPerformance: 0, count: 0 });
                }
            }
        }
        return cells;
    }, [data, allDailyTasks]);

    // ── New chart data: Sparkline Row (month mode) ──
    const sparklineMetrics = useMemo(() => {
        const filterNonNull = (arr: (number | null)[]) => arr.filter((v): v is number => v !== null && v > 0);
        const recoveryArr = filterNonNull(data.map(d => d.recovery));
        const hrvArr = filterNonNull(data.map(d => d.hrv));
        const rhrArr = filterNonNull(data.map(d => d.rhr));
        const sleepScoreArr = filterNonNull(data.map(d => d.sleepScore));
        const sleepHoursArr = filterNonNull(data.map(d => d.sleep_hours));
        const strainArr = filterNonNull(data.map(d => d.strain));

        // Habit % per day
        const dateTaskMap: Record<string, { total: number; done: number }> = {};
        allDailyTasks.filter((t: any) => !t.is_one_off).forEach((t: any) => {
            if (!dateTaskMap[t.date]) dateTaskMap[t.date] = { total: 0, done: 0 };
            dateTaskMap[t.date].total++;
            if (t.status === 'Completed') dateTaskMap[t.date].done++;
        });
        const habitArr = data.map(d => {
            const dateStr = format(d.date, 'yyyy-MM-dd');
            const entry = dateTaskMap[dateStr];
            return entry && entry.total > 0 ? Math.round((entry.done / entry.total) * 100) : null;
        }).filter((v): v is number => v !== null);

        const debtArr = data.map(d =>
            d.whoop_sleep_debt_corrected_hours ?? d.whoop_official_sleep_debt_hours ?? d.whoop_sleep_debt_hours ?? null
        ).filter((v): v is number => v !== null).map(v => Math.max(0, +v.toFixed(1)));

        const last = (arr: number[]) => arr.length > 0 ? arr[arr.length - 1] : undefined;

        const round = (v: number | undefined) => v != null ? Math.round(v * 10) / 10 : undefined;
        return [
            { label: 'Recovery', data: recoveryArr, color: T.green, unit: '%', current: round(last(recoveryArr)) },
            { label: 'HRV', data: hrvArr, color: T.gold, unit: 'ms', current: round(last(hrvArr)) },
            { label: 'RHR', data: rhrArr, color: T.purple, unit: 'bpm', current: round(last(rhrArr)) },
            { label: 'Sleep Score', data: sleepScoreArr, color: T.purpleBright, unit: '%', current: round(last(sleepScoreArr)) },
            { label: 'Sleep Hours', data: sleepHoursArr, color: T.blue, unit: 'h', current: round(last(sleepHoursArr)) },
            { label: 'Strain', data: strainArr, color: T.orange, current: round(last(strainArr)) },
            { label: 'Habits %', data: habitArr, color: T.goldBright, unit: '%', current: round(last(habitArr)) },
            { label: 'Sleep Debt', data: debtArr, color: T.red, unit: 'h', current: round(last(debtArr)) },
        ];
    }, [data, allDailyTasks]);

    // ── New chart data: Habit Score Rolling Trend (month mode) ──
    const habitScoreRollingData = useMemo(() => {
        const dateTaskMap: Record<string, { total: number; done: number }> = {};
        allDailyTasks.filter((t: any) => !t.is_one_off).forEach((t: any) => {
            if (!dateTaskMap[t.date]) dateTaskMap[t.date] = { total: 0, done: 0 };
            dateTaskMap[t.date].total++;
            if (t.status === 'Completed') dateTaskMap[t.date].done++;
        });

        const dailyScores = data.map(d => {
            const dateStr = format(d.date, 'yyyy-MM-dd');
            const entry = dateTaskMap[dateStr];
            const score = entry && entry.total > 0 ? Math.round((entry.done / entry.total) * 100) : 0;
            return { date: dateStr, score };
        }).filter(d => d.score > 0);

        return dailyScores.map((d, idx) => {
            const windowStart = Math.max(0, idx - 6);
            const window = dailyScores.slice(windowStart, idx + 1);
            const rolling7d = window.length >= 3
                ? Math.round(window.reduce((s, w) => s + w.score, 0) / window.length)
                : null;
            return { ...d, rolling7d };
        });
    }, [data, allDailyTasks]);

    // ── Coach compliance data — compare weekly plan types vs actual workout types ──
    const coachComplianceData = useMemo(() => {
        let completed = 0;
        let modified = 0;
        let missed = 0;

        // Build map: date -> planned workout type from weekly plans
        const plannedByDate = new Map<string, string>();
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        (weeklyPlans || []).forEach((plan: any) => {
            const weekStart = new Date(plan.week_start + 'T12:00:00');
            for (let i = 0; i < 7; i++) {
                const dayDate = new Date(weekStart);
                dayDate.setDate(dayDate.getDate() + i);
                const dateStr = format(dayDate, 'yyyy-MM-dd');
                const dayPlan = plan.plan?.[dayLabels[i]];
                if (dayPlan && dayPlan.type && dayPlan.type !== 'Rest') {
                    plannedByDate.set(dateStr, dayPlan.type);
                }
            }
        });

        // Build map: date -> actual workout types from processed workouts
        const actualByDate = new Map<string, string[]>();
        processedWorkouts.forEach((w: any) => {
            const types = actualByDate.get(w.date) || [];
            types.push(w.displayType);
            actualByDate.set(w.date, types);
        });

        const today = format(new Date(), 'yyyy-MM-dd');

        plannedByDate.forEach((plannedType, date) => {
            if (date > today) return; // Skip future dates
            const actuals = actualByDate.get(date) || [];
            if (actuals.some(a => a === plannedType)) {
                completed++;
            } else if (actuals.length > 0) {
                modified++; // Worked out but did a different type
            } else {
                missed++;
            }
        });

        return { completed, modified, missed };
    }, [weeklyPlans, processedWorkouts]);

    // ── Section 5: Key Metrics ──
    const keyMetrics = useMemo(() => {
        const vr = validRecovery;
        const vs = validSleep;
        const totalDays = activeData.length || 1;

        const avgHrv = vr.length ? Math.round(vr.reduce((a, d) => a + (d.hrv || 0), 0) / vr.length) : 0;
        const avgRhr = vr.length ? Math.round(vr.reduce((a, d) => a + (d.rhr || 0), 0) / vr.length) : 0;
        const sleepHrs = vs.length ? (vs.reduce((a, d) => a + (d.sleep_hours || 0), 0) / vs.length).toFixed(1) : '0';
        const calPerDay = Math.round(activeData.reduce((a, d) => a + (d.calories || 0), 0) / totalDays);
        const activeDays = activeData.filter(d => d.workoutType).length;
        const bestRecovery = vr.length ? Math.max(...vr.map(d => d.recovery!)) : 0;

        if (rangeMode === 'year') {
            const totalCals = activeData.reduce((a, d) => a + (d.calories || 0), 0);
            return {
                avgHrv: `${avgHrv}ms`, avgRhr: `${avgRhr}bpm`,
                sleepHrs: `${sleepHrs}h`, cals: `${Math.round(totalCals / 1000)}k`,
                activeDays: `${activeDays}`, bestRecovery: `${bestRecovery}%`
            };
        }
        return {
            avgHrv: `${avgHrv}ms`, avgRhr: `${avgRhr}bpm`,
            sleepHrs: `${sleepHrs}h`, cals: `${calPerDay}`,
            activeDays: `${activeDays}`, bestRecovery: `${bestRecovery}%`
        };
    }, [validRecovery, validSleep, activeData, rangeMode]);

    // ── YEAR-SPECIFIC DATA COMPUTATIONS ──
    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const yearMonthlyData = useMemo(() => {
        if (rangeMode !== 'year') return [];
        const buckets: DashboardDayData[][] = Array.from({ length: 12 }, () => []);
        data.forEach(d => { const m = new Date(d.date).getMonth(); if (!isNaN(m)) buckets[m].push(d); });
        return buckets.map((m, i) => {
            if (m.length === 0) return { month: MONTH_NAMES[i], recovery: null, sleep: null, strain: null, hrv: null, rhr: null, calories: null, sleepHours: null, workoutCount: null, habitPct: null };
            const vr = m.filter(d => d.recovery !== null), vs = m.filter(d => d.sleepScore !== null), vst = m.filter(d => d.strain !== null && (d.strain || 0) > 0);
            const vh = m.filter(d => d.hrv !== null);
            return {
                month: MONTH_NAMES[i],
                recovery: vr.length ? Math.round(vr.reduce((a, d) => a + d.recovery!, 0) / vr.length) : null,
                sleep: vs.length ? Math.round(vs.reduce((a, d) => a + d.sleepScore!, 0) / vs.length) : null,
                strain: vst.length ? +(vst.reduce((a, d) => a + (d.strain || 0), 0) / vst.length).toFixed(1) : null,
                hrv: vh.length ? Math.round(vh.reduce((a, d) => a + (d.hrv || 0), 0) / vh.length) : null,
                rhr: vr.length ? Math.round(vr.reduce((a, d) => a + (d.rhr || 0), 0) / vr.length) : null,
                calories: m.reduce((a, d) => a + (d.calories || 0), 0),
                sleepHours: vs.length ? +(vs.reduce((a, d) => a + (d.sleep_hours || 0), 0) / vs.length).toFixed(1) : null,
                workoutCount: vr.length > 0 ? m.filter(d => d.workoutType).length : null,
                habitPct: null as number | null, // filled below
            };
        });
    }, [data, rangeMode]);

    // Habit completion by month (from allDailyTasks)
    const yearHabitsByMonth = useMemo(() => {
        if (rangeMode !== 'year') return Array(12).fill(null);
        const buckets: { done: number; total: number }[] = Array.from({ length: 12 }, () => ({ done: 0, total: 0 }));
        const currentMonth = new Date().getMonth();
        allDailyTasks.filter((t: any) => !t.is_one_off).forEach((t: any) => {
            const m = new Date(t.date).getMonth();
            if (!isNaN(m) && m <= currentMonth) { buckets[m].total++; if (t.status === 'Completed') buckets[m].done++; }
        });
        return buckets.map((b, i) => i > currentMonth ? null : (b.total > 0 ? Math.round((b.done / b.total) * 100) : null));
    }, [allDailyTasks, rangeMode]);

    // Fill habitPct into yearMonthlyData
    const yearMonthlyDataFull = useMemo(() => {
        if (rangeMode !== 'year') return [];
        return yearMonthlyData.map((m, i) => ({ ...m, habitPct: yearHabitsByMonth[i] }));
    }, [yearMonthlyData, yearHabitsByMonth, rangeMode]);

    const yearWorkoutBreakdown = useMemo(() => {
        if (rangeMode !== 'year') return [];
        const map: Record<string, number> = {};
        processedWorkouts.forEach((w: any) => {
            const t = w.displayType;
            if (['Activity', 'General Activity', 'Steam Room', 'Sauna', 'Ice Bath'].includes(t)) return;
            map[t] = (map[t] || 0) + 1;
        });
        return Object.entries(map).map(([name, value]) => ({ name, value, color: typeColors[name] || T.textMuted })).sort((a, b) => b.value - a.value);
    }, [processedWorkouts, rangeMode]);

    const yearMonthlyWorkoutTypes = useMemo(() => {
        if (rangeMode !== 'year') return [];
        const monthMap: Record<string, number>[] = Array.from({ length: 12 }, () => ({}));
        processedWorkouts.forEach((w: any) => {
            const t = w.displayType;
            if (['Activity', 'General Activity', 'Steam Room', 'Sauna', 'Ice Bath'].includes(t)) return;
            const m = new Date(w.date).getMonth();
            if (!isNaN(m)) monthMap[m][t] = (monthMap[m][t] || 0) + 1;
        });
        const allTypes = [...new Set(processedWorkouts.map((w: any) => w.displayType).filter((t: string) => !['Activity', 'General Activity', 'Steam Room', 'Sauna', 'Ice Bath'].includes(t)))];
        return MONTH_NAMES.map((name, i) => {
            const entry: any = { month: name };
            allTypes.forEach(t => { entry[t] = monthMap[i][t] || 0; });
            return entry;
        });
    }, [processedWorkouts, rangeMode]);

    const yearRadarData = useMemo(() => {
        if (rangeMode !== 'year') return [];
        const vr = validRecovery, vs = validSleep;
        const avgRec = vr.length ? vr.reduce((a, d) => a + d.recovery!, 0) / vr.length : 0;
        const avgSlp = vs.length ? vs.reduce((a, d) => a + d.sleepScore!, 0) / vs.length : 0;
        const hrvVals = data.filter(d => d.hrv !== null).map(d => d.hrv!);
        const maxHrv = hrvVals.length ? Math.max(...hrvVals) : 1;
        const avgHrvVal = hrvVals.length ? hrvVals.reduce((a, v) => a + v, 0) / hrvVals.length : 0;
        const hrvNorm = maxHrv > 0 ? (avgHrvVal / maxHrv) * 100 : 0;
        const strainNorm = (avgStrain / 21) * 100;
        const habitVals = yearHabitsByMonth.filter((v): v is number => v !== null);
        const habitsNorm = habitVals.length ? habitVals.reduce((a, v) => a + v, 0) / habitVals.length : 0;
        const consistencyNorm = timingStats.consistency;
        return [
            { dimension: 'Recovery', value: Math.round(avgRec) },
            { dimension: 'Sleep', value: Math.round(avgSlp) },
            { dimension: 'HRV', value: Math.round(hrvNorm) },
            { dimension: 'Strain', value: Math.round(strainNorm) },
            { dimension: 'Habits', value: Math.round(habitsNorm) },
            { dimension: 'Consistency', value: Math.round(consistencyNorm) },
        ];
    }, [data, validRecovery, validSleep, avgStrain, yearHabitsByMonth, timingStats, rangeMode]);

    const yearScorecard = useMemo(() => {
        if (rangeMode !== 'year') return { rows: [] as { label: string; values: (number | null)[]; type: string }[] };
        const rows = [
            { label: 'Habits %', values: yearHabitsByMonth, type: 'pct' },
            { label: 'Recovery %', values: yearMonthlyDataFull.map(m => m.recovery), type: 'pct' },
            { label: 'Sleep %', values: yearMonthlyDataFull.map(m => m.sleep), type: 'pct' },
            { label: 'Strain', values: yearMonthlyDataFull.map(m => m.strain), type: 'strain' },
            { label: 'Workouts', values: yearMonthlyDataFull.map(m => m.workoutCount), type: 'workouts' },
            { label: 'HRV', values: yearMonthlyDataFull.map(m => m.hrv), type: 'hrv' },
        ];
        return { rows };
    }, [yearMonthlyDataFull, yearHabitsByMonth, rangeMode]);

    const yearPeriodization = useMemo(() => {
        if (rangeMode !== 'year') return [];
        return yearMonthlyDataFull.map(m => ({
            month: m.month,
            strain: m.strain || 0,
            workouts: m.workoutCount,
            color: (m.strain || 0) > 10 ? T.red : (m.strain || 0) >= 7 ? T.gold : T.green,
            label: (m.strain || 0) > 10 ? 'High' : (m.strain || 0) >= 7 ? 'Moderate' : 'Recovery',
        }));
    }, [yearMonthlyDataFull, rangeMode]);

    // ── Year Biometric Trends (monthly aggregated for chart components) ──
    const yearBiometricMonthly = useMemo(() => {
        if (rangeMode !== 'year') return { recovery: [] as { date: string; recovery: number }[], hrv: [] as { date: string; hrv: number; rolling7d: number | null }[], rhr: [] as { date: string; rhr: number }[] };
        const buckets: DashboardDayData[][] = Array.from({ length: 12 }, () => []);
        data.forEach(d => { const m = new Date(d.date).getMonth(); if (!isNaN(m)) buckets[m].push(d); });
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const year = currentDate.getFullYear();

        const recoveryPts: { date: string; recovery: number }[] = [];
        const hrvPts: { date: string; hrv: number; rolling7d: number | null }[] = [];
        const rhrPts: { date: string; rhr: number }[] = [];

        buckets.forEach((m, i) => {
            // Use the 15th of each month as the synthetic date for parseISO compatibility
            const syntheticDate = `${year}-${String(i + 1).padStart(2, '0')}-15`;
            const vr = m.filter(d => d.recovery !== null && d.recovery > 0);
            const vh = m.filter(d => d.hrv !== null && d.hrv > 0);
            const vrhr = m.filter(d => d.rhr !== null && d.rhr > 0);

            if (vr.length > 0) {
                recoveryPts.push({ date: syntheticDate, recovery: Math.round(vr.reduce((a, d) => a + d.recovery!, 0) / vr.length) });
            }
            if (vh.length > 0) {
                hrvPts.push({ date: syntheticDate, hrv: Math.round(vh.reduce((a, d) => a + d.hrv!, 0) / vh.length), rolling7d: null });
            }
            if (vrhr.length > 0) {
                rhrPts.push({ date: syntheticDate, rhr: Math.round(vrhr.reduce((a, d) => a + d.rhr!, 0) / vrhr.length) });
            }
        });

        // Compute 3-month rolling average for HRV
        const hrvWithRolling = hrvPts.map((pt, idx) => {
            const windowStart = Math.max(0, idx - 2);
            const window = hrvPts.slice(windowStart, idx + 1);
            const rolling7d = window.length >= 2
                ? Math.round(window.reduce((s, w) => s + w.hrv, 0) / window.length)
                : null;
            return { ...pt, rolling7d };
        });

        return { recovery: recoveryPts, hrv: hrvWithRolling, rhr: rhrPts };
    }, [data, rangeMode, currentDate]);

    // Deep sleep trend for year mode
    const yearDeepSleepTrend = useMemo(() => {
        if (rangeMode !== 'year') return { data: [] as { month: string; deepPct: number | null }[], avg: 0 };
        const vals = yearMonthlyDataFull.map(m => {
            const bucket = data.filter(d => { const dt = new Date(d.date); return MONTH_NAMES[dt.getMonth()] === m.month && d.deepPct !== null; });
            const avg = bucket.length ? Math.round(bucket.reduce((a, d) => a + (d.deepPct || 0), 0) / bucket.length) : null;
            return { month: m.month, deepPct: avg };
        });
        const valid = vals.filter(v => v.deepPct !== null);
        const avg = valid.length ? Math.round(valid.reduce((a, v) => a + v.deepPct!, 0) / valid.length) : 0;
        return { data: vals, avg };
    }, [data, yearMonthlyDataFull, rangeMode]);

    // Scorecard cell color helper
    const scorecardCellColor = (value: number | null, type: string): string => {
        if (value === null) return T.textDim;
        switch (type) {
            case 'pct': return value > 75 ? T.green : value >= 50 ? T.gold : T.red;
            case 'strain': return value < 8 ? T.green : value <= 14 ? T.gold : T.red;
            case 'workouts': return value > 15 ? T.green : value >= 8 ? T.gold : T.red;
            case 'hrv': return value > 65 ? T.green : value >= 45 ? T.gold : T.red;
            default: return T.textMuted;
        }
    };

    return (
        <DataMaturityProvider>
        <div className="text-athena-text-primary font-manrope selection:bg-athena-gold-dim/30 pb-20">

            {/* ==================== MOBILE LAYOUT ==================== */}
            <div className={cn("md:hidden px-3 pb-2 space-y-3 font-sans transition-opacity duration-200", loading && "opacity-40 pointer-events-none")}
                onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
                onTouchEnd={(e) => {
                    if (touchStart === null) return;
                    const diff = e.changedTouches[0].clientX - touchStart;
                    if (Math.abs(diff) > 60) {
                        if (diff > 0) handlePrev();
                        else handleNext();
                    }
                    setTouchStart(null);
                }}>
                {/* Mobile Header: Month/Year toggle + nav arrows */}
                <div className="bg-athena-bg/95 py-1.5 -mx-3 px-3 flex items-center justify-between">
                    <button onClick={handlePrev} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-athena-border active:bg-athena-gold/20">
                        <ChevronLeft className="w-5 h-5 text-athena-gold" />
                    </button>
                    <div className="flex flex-col items-center">
                        <h1 className="text-lg font-serif text-transparent bg-clip-text bg-gradient-to-r from-athena-gold to-athena-gold-pale">
                            {headerLabel}
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex bg-athena-bg border border-athena-border rounded-full p-0.5">
                                {(['month', 'year'] as const).map(mode => (
                                    <button key={mode} onClick={() => setRangeMode(mode)}
                                        className={cn("px-3 py-1 text-[10px] uppercase tracking-wide rounded-full transition-all",
                                            rangeMode === mode ? "bg-athena-gold/20 text-athena-gold font-bold" : "text-athena-text-muted"
                                        )}>{mode}</button>
                                ))}
                            </div>
                            {whoopEnabled && (
                                <button onClick={handleSyncWhoop} disabled={isSyncing}
                                    className="p-1.5 border border-athena-border rounded-full text-athena-text-muted min-h-[36px] min-w-[36px] flex items-center justify-center">
                                    <RefreshCw size={12} className={isSyncing ? "animate-spin text-athena-gold" : ""} />
                                </button>
                            )}
                        </div>
                    </div>
                    <button onClick={handleNext} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-athena-border active:bg-athena-gold/20">
                        <ChevronRight className="w-5 h-5 text-athena-gold" />
                    </button>
                </div>

                {/* Mobile Key Metrics: scrollable horizontal pills */}
                {whoopEnabled && (
                    <div className="overflow-x-auto -mx-3 px-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        <div className="flex gap-2 min-w-max">
                            {[
                                { label: 'Recovery', value: `${avgRecovery}%`, color: 'text-athena-green' },
                                { label: 'HRV', value: keyMetrics.avgHrv, color: 'text-athena-green' },
                                { label: 'Sleep', value: `${avgSleep}%`, color: 'text-athena-purple' },
                                { label: 'Strain', value: `${avgStrain}`, color: 'text-athena-strain' },
                                { label: 'Habits', value: sparklineMetrics.find(m => m.label === 'Habits %')?.current !== undefined ? `${sparklineMetrics.find(m => m.label === 'Habits %')?.current}%` : '-', color: 'text-athena-gold' },
                                { label: 'Workouts', value: keyMetrics.activeDays, color: 'text-athena-gold' },
                            ].map((s) => (
                                <div key={s.label} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-athena-border/30 bg-white/[0.02]">
                                    <span className={cn("text-sm font-serif font-bold", s.color)}>{s.value}</span>
                                    <span className="text-[10px] text-athena-text-muted">{s.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══════════ MOBILE MONTH MODE ═══════════ */}
                {rangeMode === 'month' && whoopEnabled && (
                    <>
                        <MobileSection title="Biometrics" defaultOpen={true}>
                            {/* Recovery Trend */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Recovery Zone</div>
                                <div className="h-[180px]"><RecoveryZoneTrend data={recoveryZoneData} height={180} /></div>
                            </div>

                            {/* HRV Rolling */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">HRV (7-Day Rolling)</div>
                                <div className="h-[180px]"><HrvRollingAverage data={hrvRollingData} height={180} /></div>
                            </div>

                            {/* RHR Inverse */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Resting Heart Rate</div>
                                <div className="h-[180px]"><RhrInverseTrend data={rhrTrendData} height={180} /></div>
                            </div>
                        </MobileSection>

                        <MobileSection title="Sleep" defaultOpen={false}>
                            {/* Sleep Stages Nightly */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Nightly Sleep Stages</div>
                                <div className="h-[200px]"><SleepStageNightly data={sleepStageNightlyData} height={200} /></div>
                            </div>
                        </MobileSection>

                        <MobileSection title="Training" defaultOpen={true}>
                            {/* Training Calendar */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                    <div className="flex gap-1.5 min-w-max mb-3">
                                        {["All", "Push (Chest)", "Push (Tricep)", "Pull (Bicep)", "Pull (Back)", "Legs", "Cardio", "Recovery", "Other"].map(f => (
                                            <button key={f} onClick={() => setCalFilter(f)}
                                                className={cn(
                                                    "px-2 py-1 text-[10px] font-sans rounded-md border transition-all whitespace-nowrap min-h-[32px]",
                                                    calFilter === f
                                                        ? "bg-athena-gold text-athena-bg border-athena-gold font-bold"
                                                        : "bg-transparent text-athena-text-muted border-athena-border hover:border-athena-gold/50"
                                                )}
                                            >
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Training Calendar</div>
                                <div className="h-[200px]">
                                    <TrainingCalendarChartV2 workouts={workouts} dailyTasks={dailyTasks} currentDate={dateRange.start} filter={calFilter} viewType={rangeMode} />
                                </div>
                            </div>

                            {/* Coach Compliance Donut */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Coach Compliance</div>
                                <CoachComplianceDonut
                                    completed={coachComplianceData.completed}
                                    modified={coachComplianceData.modified}
                                    missed={coachComplianceData.missed}
                                    height={140}
                                />
                            </div>
                        </MobileSection>

                        <MobileSection title="Correlations" defaultOpen={false}>
                            {/* Sleep vs Habits Scatter */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Sleep Score vs Next-Day Habits</div>
                                <div className="h-[200px]"><SleepProductivityScatter data={sleepProductivityScatterData} height={200} /></div>
                            </div>

                            {/* Behavior Impact Bars */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Behavior Impact on Recovery</div>
                                <BehaviorImpactBars data={behaviorImpactData} height={240} />
                            </div>

                            {/* Recovery x Strain Heatmap */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Recovery x Strain Heatmap</div>
                                <div className="h-[180px]"><RecoveryTrainingHeatmap data={recoveryTrainingHeatmapData} height={180} /></div>
                            </div>
                        </MobileSection>

                        <MobileSection title="Overview" defaultOpen={true}>
                            {/* Sparkline Row */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Month at a Glance</div>
                                <SparklineRow metrics={sparklineMetrics} />
                            </div>

                            {/* Habit Score Rolling Trend */}
                            {habitScoreRollingData.length > 0 && (
                                <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                    <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Habit Score (7-Day Rolling)</div>
                                    <div className="h-[100px]"><HabitScoreRollingTrend data={habitScoreRollingData} height={100} /></div>
                                </div>
                            )}
                        </MobileSection>
                    </>
                )}

                {/* ═══════════ MOBILE YEAR MODE ═══════════ */}
                {rangeMode === 'year' && whoopEnabled && (
                    <>
                        <MobileSection title="Monthly Trends" defaultOpen={true}>
                            {/* Monthly Trends */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Monthly Trends</div>
                                <div className="h-[200px]">
                                    <ResponsiveContainer width="100%" height={200}>
                                        <ComposedChart data={trendData}>
                                            <XAxis dataKey="label" tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} />
                                            <YAxis yAxisId="strain" domain={[0, 21]} tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} width={25} />
                                            <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} unit="%" width={30} />
                                            <Tooltip content={<ChartTooltip formatter={(v: any, name: string) => name === 'Avg Strain' ? v?.toFixed?.(1) ?? v : `${v}%`} />} />
                                            <Bar yAxisId="strain" dataKey="strain" fill={T.gold} fillOpacity={0.6} name="Avg Strain" barSize={14} radius={[3, 3, 0, 0]} />
                                            <Line yAxisId="pct" type="monotone" dataKey="recovery" stroke={T.green} strokeWidth={2} dot={{ fill: T.green, r: 2, strokeWidth: 0 }} name="Avg Recovery" connectNulls />
                                            <Line yAxisId="pct" type="monotone" dataKey="sleep" stroke={T.purple} strokeWidth={2} dot={{ fill: T.purple, r: 2, strokeWidth: 0 }} name="Avg Sleep" connectNulls />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex gap-3 mt-2">
                                    {[{ label: 'Strain', color: T.gold }, { label: 'Recovery', color: T.green }, { label: 'Sleep', color: T.purple }].map(l => (
                                        <div key={l.label} className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
                                            <span className="text-[10px] text-athena-text-muted">{l.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </MobileSection>

                        <MobileSection title="Biometrics" defaultOpen={false}>
                            {/* Biometric Trends - stacked */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Recovery Zone</div>
                                <div className="h-[180px]"><RecoveryZoneTrend data={yearBiometricMonthly.recovery} height={180} /></div>
                            </div>
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">HRV (3-Month Rolling)</div>
                                <div className="h-[180px]"><HrvRollingAverage data={yearBiometricMonthly.hrv} height={180} /></div>
                            </div>
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Resting Heart Rate</div>
                                <div className="h-[180px]"><RhrInverseTrend data={yearBiometricMonthly.rhr} height={180} /></div>
                            </div>
                        </MobileSection>

                        <MobileSection title="Body + Training" defaultOpen={true}>
                            {/* Body Radar */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Body Radar</div>
                                <div className="h-[220px]">
                                    <ResponsiveContainer width="100%" height={220}>
                                        <RadarChart data={yearRadarData} outerRadius={80}>
                                            <PolarGrid stroke={T.border} />
                                            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 9, fill: T.textWarm }} />
                                            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 7, fill: T.textDim }} axisLine={false} />
                                            <Radar name="Year" dataKey="value" stroke={T.gold} fill={T.gold} fillOpacity={0.2} strokeWidth={2} />
                                            <Tooltip content={<ChartTooltip formatter={(v: any) => v} />} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Workout Distribution */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Workout Distribution</div>
                                <div className="flex flex-col items-center">
                                    <div className="relative">
                                        <ResponsiveContainer width={180} height={180}>
                                            <PieChart>
                                                <Pie data={yearWorkoutBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                                                    {yearWorkoutBreakdown.map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip content={({ active, payload }: any) => {
                                                    if (!active || !payload?.length) return null;
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', fontFamily: 'var(--font-manrope), sans-serif' }}>
                                                            <div style={{ fontSize: 10, color: d.color, fontWeight: 600 }}>{d.name}: {d.value}</div>
                                                        </div>
                                                    );
                                                }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <div className="text-center">
                                                <div className="text-xl font-serif" style={{ color: T.text }}>{yearWorkoutBreakdown.reduce((a, b) => a + b.value, 0)}</div>
                                                <div className="text-[10px] text-athena-text-muted uppercase tracking-wider">total</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2 justify-center">
                                        {yearWorkoutBreakdown.map(w => (
                                            <div key={w.name} className="flex items-center gap-1">
                                                <div className="w-2 h-2 rounded-sm" style={{ background: w.color }} />
                                                <span className="text-[10px] text-athena-text-muted">{w.name} ({w.value})</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </MobileSection>

                        <MobileSection title="Training Detail" defaultOpen={false}>
                            {/* Monthly Split */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Monthly Split</div>
                                <div className="h-[200px]">
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={yearMonthlyWorkoutTypes}>
                                            <XAxis dataKey="month" tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<ChartTooltip />} />
                                            {yearWorkoutBreakdown.map(w => (
                                                <Bar key={w.name} dataKey={w.name} stackId="s" fill={w.color} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Periodization */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Periodization</div>
                                <div className="h-[200px]">
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={yearPeriodization} layout="vertical">
                                            <XAxis type="number" tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} />
                                            <YAxis type="category" dataKey="month" tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} width={30} />
                                            <Tooltip content={({ active, payload }: any) => {
                                                if (!active || !payload?.length) return null;
                                                const d = payload[0].payload;
                                                return (
                                                    <div style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', fontFamily: 'var(--font-manrope), sans-serif' }}>
                                                        <div style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{d.month}</div>
                                                        <div style={{ fontSize: 10, color: d.color, marginTop: 2 }}>Avg Strain: {d.strain.toFixed(1)} ({d.label})</div>
                                                        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Workouts: {d.workouts}</div>
                                                    </div>
                                                );
                                            }} />
                                            <Bar dataKey="strain" name="Avg Strain" radius={[0, 4, 4, 0]}>
                                                {yearPeriodization.map((entry, i) => (
                                                    <Cell key={i} fill={entry.color} fillOpacity={0.75} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </MobileSection>

                        <MobileSection title="Sleep" defaultOpen={false}>
                            {/* Sleep Architecture */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Sleep Architecture</div>
                                <div className="h-[200px]">
                                    <ResponsiveContainer width="100%" height={200}>
                                        <ComposedChart data={architectureData}>
                                            <XAxis dataKey="name" tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} />
                                            <YAxis yAxisId="l" domain={[0, 100]} tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} unit="%" width={28} />
                                            <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} unit="%" width={28} />
                                            <Tooltip content={<ChartTooltip formatter={(v: any) => `${v}%`} />} />
                                            <Bar yAxisId="l" dataKey="deep" stackId="s" fill={T.indigo} name="Deep" />
                                            <Bar yAxisId="l" dataKey="rem" stackId="s" fill={T.purple} name="REM" />
                                            <Bar yAxisId="l" dataKey="light" stackId="s" fill={T.blue} name="Light" />
                                            <Bar yAxisId="l" dataKey="awake" stackId="s" fill={T.textDim} name="Awake" radius={[3, 3, 0, 0]} />
                                            <Line yAxisId="r" type="monotone" dataKey="recovery" stroke={T.green} strokeWidth={2} dot={{ fill: T.green, r: 3, strokeWidth: 0 }} name="Avg Recovery" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap gap-3 mt-2">
                                    {[{ label: 'Deep', color: T.indigo }, { label: 'REM', color: T.purple }, { label: 'Light', color: T.blue }, { label: 'Awake', color: T.textDim }, { label: 'Recovery', color: T.green }].map(l => (
                                        <div key={l.label} className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
                                            <span className="text-[10px] text-athena-text-muted">{l.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </MobileSection>

                        <MobileSection title="Scorecard" defaultOpen={true}>
                            {/* Monthly Scorecard */}
                            <div className="border border-athena-border rounded-xl bg-white/[0.02] p-3 overflow-x-auto">
                                <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Monthly Scorecard</div>
                                <table className="w-full border-collapse" style={{ minWidth: 600 }}>
                                    <thead>
                                        <tr>
                                            <th className="text-left text-[10px] uppercase tracking-wider text-athena-text-muted font-semibold p-0.5 w-16" />
                                            {MONTH_NAMES.map(m => (
                                                <th key={m} className="text-center text-[10px] uppercase tracking-wider text-athena-text-muted font-semibold p-0.5" style={{ width: 40 }}>{m}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {yearScorecard.rows.map(row => (
                                            <tr key={row.label}>
                                                <td className="text-[7px] text-athena-text-muted font-medium p-0.5 whitespace-nowrap">{row.label}</td>
                                                {row.values.map((val, i) => (
                                                    <td key={i} className="text-center p-0.5">
                                                        <div className="rounded px-0.5 py-0.5 text-[7px] font-semibold" style={{
                                                            background: val !== null ? `${scorecardCellColor(val, row.type)}15` : `${T.textDim}08`,
                                                            color: scorecardCellColor(val, row.type),
                                                        }}>
                                                            {val !== null ? (row.type === 'strain' ? val.toFixed(1) : val) : '-'}
                                                        </div>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </MobileSection>
                    </>
                )}

                {/* Connect WHOOP message when disabled */}
                {!whoopEnabled && (
                    <div className="rounded-xl border border-athena-border bg-white/[0.02] p-6 flex flex-col items-center justify-center gap-3">
                        <Heart className="w-8 h-8 text-athena-text-muted/30" />
                        <div className="text-center space-y-1">
                            <h3 className="text-base font-serif text-athena-gold">Health Analytics</h3>
                            <p className="text-xs text-athena-text-muted">
                                Connect a WHOOP device to unlock recovery trends, sleep architecture,
                                strain analysis, and cross-domain correlations.
                            </p>
                        </div>
                    </div>
                )}

                {/* Habit Insights */}
                <DataGate feature="habitInsights" label="habit insights">
                    <HabitInsightsSection
                        startDate={format(dateRange.start, 'yyyy-MM-dd')}
                        endDate={format(dateRange.end, 'yyyy-MM-dd')}
                    />
                </DataGate>
            </div>

            {/* ==================== DESKTOP LAYOUT ==================== */}
            <div className={cn("hidden md:block relative z-10 space-y-8 font-sans transition-opacity duration-200", loading && "opacity-40 pointer-events-none")}>

                {/* ==================== DESKTOP HEADER ==================== */}
                <motion.header
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="hidden md:flex flex-col sm:flex-row items-start sm:items-end justify-between pb-4 gap-4"
                >
                    <div>
                        <div className="text-[10px] text-athena-text-muted uppercase tracking-[0.3em] font-semibold mb-2 font-sans">Analytics</div>
                        <h1 className="text-base md:text-4xl lg:text-5xl font-serif text-athena-text-primary mt-2">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-athena-gold to-athena-gold-pale">
                                {headerLabel}
                            </span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-4 mb-2">
                        <button
                            onClick={handleSyncWhoop}
                            disabled={isSyncing}
                            className="p-2 border border-athena-border rounded-full hover:bg-athena-gold/10 hover:border-athena-gold/50 text-athena-text-muted hover:text-athena-gold transition-all"
                            title="Sync Whoop"
                        >
                            <RefreshCw size={14} className={isSyncing ? "animate-spin text-athena-gold" : ""} />
                        </button>
                        <div className="flex bg-athena-bg border border-athena-border rounded-full p-1">
                            {(['month', 'year'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setRangeMode(mode)}
                                    className={cn(
                                        "px-3 md:px-4 py-1 text-[10px] uppercase tracking-wide rounded-full transition-all",
                                        rangeMode === mode
                                            ? "bg-athena-gold/20 text-athena-gold font-bold shadow-sm"
                                            : "text-athena-text-muted hover:text-athena-text-primary"
                                    )}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                        <button onClick={handlePrev} className="p-2 border border-athena-border rounded-full hover:bg-athena-gold/10 hover:border-athena-gold/50 text-athena-text-muted hover:text-athena-gold transition-all">
                            <ChevronLeft size={16} />
                        </button>
                        <button onClick={handleNext} className="p-2 border border-athena-border rounded-full hover:bg-athena-gold/10 hover:border-athena-gold/50 text-athena-text-muted hover:text-athena-gold transition-all">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </motion.header>

                {/* ═══════════════ KEY METRICS ═══════════════ */}
                {whoopEnabled && (
                    <section>
                        <SectionHeader>Key Metrics</SectionHeader>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
                            <CompactMetric label="Avg HRV" value={keyMetrics.avgHrv} color={T.blue} />
                            <CompactMetric label="Avg RHR" value={keyMetrics.avgRhr} color={T.greenDim} />
                            <CompactMetric label="Sleep Hours" value={keyMetrics.sleepHrs} color={T.purple} />
                            <CompactMetric label={rangeMode === 'year' ? 'Total Calories' : 'Calories/day'} value={keyMetrics.cals} color={T.goldRose} />
                            <CompactMetric label="Active Days" value={keyMetrics.activeDays} color={T.orange} />
                            <CompactMetric label="Best Recovery" value={keyMetrics.bestRecovery} color={T.greenBright} />
                        </div>
                    </section>
                )}

                {/* ═══════════════ MONTH-SPECIFIC SECTIONS ═══════════════ */}
                {rangeMode === 'month' && whoopEnabled && (
                    <>
                        {/* SECTION 1: BIOMETRIC TRENDS */}
                        <DataGate feature="trendLines" label="biometric trends">
                        <section>
                            <SectionHeader>Biometric Trends</SectionHeader>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Recovery Zone</div>
                                    <div className="h-[120px] md:h-auto"><RecoveryZoneTrend data={recoveryZoneData} height={180} /></div>
                                </Card>
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">HRV (7-Day Rolling)</div>
                                    <div className="h-[120px] md:h-auto"><HrvRollingAverage data={hrvRollingData} height={180} /></div>
                                </Card>
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Resting Heart Rate</div>
                                    <div className="h-[120px] md:h-auto"><RhrInverseTrend data={rhrTrendData} height={180} /></div>
                                </Card>
                            </div>
                        </section>
                        </DataGate>

                        {/* SECTION 2: SLEEP DEEP DIVE */}
                        <DataGate feature="sleepArchitecture" label="sleep analysis">
                        <section>
                            <SectionHeader>Sleep Analysis</SectionHeader>
                            <div className="grid grid-cols-2 lg:grid-cols-[1.5fr_1fr] gap-2 md:gap-4">
                                <Card className="col-span-2 lg:col-span-1">
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Nightly Sleep Stages</div>
                                    <div className="h-[120px] md:h-auto"><SleepStageNightly data={sleepStageNightlyData} height={380} /></div>
                                </Card>
                                <div className="col-span-1 flex flex-col gap-2 md:gap-4">
                                    <Card>
                                        <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Bedtime & Wake Window</div>
                                        <div className="h-[120px] md:h-auto"><BedtimeWakeRange data={bedtimeWakeData} height={200} /></div>
                                    </Card>
                                    <Card>
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold">Sleep Debt</div>
                                            <div className="text-sm font-serif" style={{ color: currentDebtValue > 2 ? T.red : currentDebtValue > 1 ? T.yellow : T.green }}>
                                                {currentDebtValue.toFixed(1)}h
                                            </div>
                                        </div>
                                        <ResponsiveContainer width="100%" height={120}>
                                            <LineChart data={sleepDebtData}>
                                                <XAxis dataKey="day" tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                                <YAxis tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} unit="h" width={28} />
                                                <Tooltip content={<ChartTooltip formatter={(v: any) => `${v}h`} />} labelFormatter={(val: any) => `Day ${val}`} />
                                                <Line type="monotone" dataKey="cumulative_debt" stroke={T.green} strokeWidth={2} dot={false} name="Sleep Debt" connectNulls />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </Card>
                                </div>
                            </div>
                        </section>
                        </DataGate>

                        {/* SECTION 3: TRAINING */}
                        <section>
                            <SectionHeader>Training</SectionHeader>
                            {/* Row 1: Calendar chart (full width) */}
                            <Card className="mb-4">
                                <div className="flex flex-wrap gap-1.5 mb-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                    {["All", "Push (Chest)", "Push (Tricep)", "Pull (Bicep)", "Pull (Back)", "Legs", "Cardio", "Recovery", "Other"].map(f => (
                                        <button key={f} onClick={() => setCalFilter(f)}
                                            className={cn(
                                                "px-2 py-1 text-[10px] font-sans rounded-md border transition-all whitespace-nowrap min-h-[32px]",
                                                calFilter === f
                                                    ? "bg-athena-gold text-athena-bg border-athena-gold font-bold"
                                                    : "bg-transparent text-athena-text-muted border-athena-border hover:border-athena-gold/50"
                                            )}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                                <div className="h-[180px] md:h-[240px]">
                                    <TrainingCalendarChartV2 workouts={workouts} dailyTasks={dailyTasks} currentDate={dateRange.start} filter={calFilter} viewType={rangeMode} />
                                </div>
                            </Card>
                            {/* Row 2: ACWR + Coach Compliance + By Workout Type (3 columns) */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="flex flex-col items-center">
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2 self-start">Workload Ratio (ACWR)</div>
                                    <div className="relative w-[100px] h-[100px]">
                                        <svg viewBox="0 0 120 120" width={100} height={100}>
                                            <circle cx="60" cy="60" r="50" fill="none" stroke={T.textDim} strokeWidth="12" strokeOpacity={0.15} strokeDasharray="235 79" transform="rotate(-225 60 60)" />
                                            <circle cx="60" cy="60" r="50" fill="none" stroke={T.green} strokeWidth="12" strokeOpacity={0.2}
                                                strokeDasharray={`${(0.5 / 2) * 314} ${314 - (0.5 / 2) * 314}`}
                                                strokeDashoffset={`${-(0.8 / 2) * 314}`} transform="rotate(-225 60 60)" />
                                            <text x="60" y="52" textAnchor="middle" fontSize="22" fill={acwrData.color} fontFamily="var(--font-playfair), serif" fontWeight="500">{acwrData.ratio}</text>
                                            <text x="60" y="68" textAnchor="middle" fontSize="9" fill={acwrData.color} fontFamily="var(--font-manrope), sans-serif" fontWeight="600">{acwrData.status}</text>
                                            <text x="60" y="82" textAnchor="middle" fontSize="8" fill={T.textDim} fontFamily="var(--font-manrope), sans-serif">target 0.8-1.3</text>
                                        </svg>
                                    </div>
                                    <div className="flex gap-6 mt-1 text-[10px] font-sans text-athena-text-muted">
                                        <span>Acute: <span style={{ color: T.gold }} className="font-semibold">{acwrData.acute}</span></span>
                                        <span>Chronic: <span style={{ color: T.goldDim }} className="font-semibold">{acwrData.chronic}</span></span>
                                    </div>
                                </Card>
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Coach Compliance</div>
                                    <CoachComplianceDonut
                                        completed={coachComplianceData.completed}
                                        modified={coachComplianceData.modified}
                                        missed={coachComplianceData.missed}
                                        height={120}
                                    />
                                </Card>
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">By Workout Type</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {byType.slice(0, 6).map((t, i) => (
                                            <div key={i} className="p-2 rounded-lg border border-athena-border" style={{ borderLeftColor: t.color, borderLeftWidth: 3 }}>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[10px] text-athena-text-primary font-medium truncate">{t.type}</span>
                                                    <span className="text-[10px] text-athena-text-muted">{t.count}x</span>
                                                </div>
                                                <div className="flex gap-3 text-[10px]">
                                                    <span style={{ color: t.color }}>{t.avgStrain} strain</span>
                                                    <span className="text-athena-text-muted">{t.avgDuration}h</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </div>
                        </section>

                        {/* SECTION 4: CORRELATIONS */}
                        <DataGate feature="correlationScatter" label="metric correlations">
                        <section>
                            <SectionHeader>Correlations</SectionHeader>
                            <div className="grid grid-cols-2 gap-2 md:gap-4">
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Sleep Score vs Next-Day Habits</div>
                                    <div className="h-[120px] md:h-auto"><SleepProductivityScatter data={sleepProductivityScatterData} height={240} /></div>
                                </Card>
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Behavior Impact on Recovery</div>
                                    <div className="h-[120px] md:h-auto"><BehaviorImpactBars data={behaviorImpactData} height={240} /></div>
                                </Card>
                            </div>
                            <div className="mt-4">
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Recovery x Strain Heatmap</div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] text-athena-text-muted">Avg day score by recovery zone & strain level</span>
                                    </div>
                                    <RecoveryTrainingHeatmap data={recoveryTrainingHeatmapData} height={200} />
                                </Card>
                            </div>
                        </section>
                        </DataGate>

                        {/* SECTION 5: MULTI-METRIC SPARKLINES */}
                        <section>
                            <SectionHeader>Month at a Glance</SectionHeader>
                            <Card>
                                <SparklineRow metrics={sparklineMetrics} />
                            </Card>
                        </section>

                    </>
                )}

                {/* ═══════════════ YEAR-SPECIFIC SECTIONS ═══════════════ */}
                {rangeMode === 'year' && whoopEnabled && (
                    <>
                        {/* Monthly Trends — full width */}
                        <DataGate feature="trendLines" label="monthly trends">
                        <section>
                            <SectionHeader>Monthly Trends</SectionHeader>
                            <Card>
                                <ResponsiveContainer width="100%" height={220}>
                                    <ComposedChart data={trendData}>
                                        <XAxis dataKey="label" tick={{ fontSize: 9, fill: T.textDim }} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="strain" domain={[0, 21]} tick={{ fontSize: 9, fill: T.textDim }} axisLine={false} tickLine={false} label={{ value: 'Strain', angle: -90, position: 'insideLeft', fontSize: 9, fill: T.goldDim }} />
                                        <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 9, fill: T.textDim }} axisLine={false} tickLine={false} unit="%" />
                                        <Tooltip content={<ChartTooltip formatter={(v: any, name: string) => name === 'Avg Strain' ? v?.toFixed?.(1) ?? v : `${v}%`} />} />
                                        <Bar yAxisId="strain" dataKey="strain" fill={T.gold} fillOpacity={0.6} name="Avg Strain" barSize={20} radius={[3, 3, 0, 0]} />
                                        <Line yAxisId="pct" type="monotone" dataKey="recovery" stroke={T.green} strokeWidth={2} dot={{ fill: T.green, r: 3, strokeWidth: 0 }} name="Avg Recovery" connectNulls />
                                        <Line yAxisId="pct" type="monotone" dataKey="sleep" stroke={T.purple} strokeWidth={2} dot={{ fill: T.purple, r: 3, strokeWidth: 0 }} name="Avg Sleep" connectNulls />
                                    </ComposedChart>
                                </ResponsiveContainer>
                                <div className="flex gap-4 mt-2">
                                    {[{ label: 'Strain', color: T.gold }, { label: 'Recovery', color: T.green }, { label: 'Sleep', color: T.purple }].map(l => (
                                        <div key={l.label} className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
                                            <span className="text-[10px] text-athena-text-muted">{l.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </section>
                        </DataGate>

                        {/* Biometric Trends — monthly aggregated */}
                        <DataGate feature="trendLines" label="biometric trends">
                        <section>
                            <SectionHeader>Biometric Trends</SectionHeader>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Recovery Zone</div>
                                    <div className="h-[120px] md:h-auto"><RecoveryZoneTrend data={yearBiometricMonthly.recovery} height={180} /></div>
                                </Card>
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">HRV (3-Month Rolling)</div>
                                    <div className="h-[120px] md:h-auto"><HrvRollingAverage data={yearBiometricMonthly.hrv} height={180} /></div>
                                </Card>
                                <Card>
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Resting Heart Rate</div>
                                    <div className="h-[120px] md:h-auto"><RhrInverseTrend data={yearBiometricMonthly.rhr} height={180} /></div>
                                </Card>
                            </div>
                        </section>
                        </DataGate>

                        {/* Body Radar + Workout Donut — side by side */}
                        <DataGate feature="bodyRadar" label="body radar & workout breakdown">
                        <section>
                            <div className="grid grid-cols-2 gap-2 md:gap-4">
                                <div>
                                    <SectionHeader>Body Radar</SectionHeader>
                                    <Card className="min-h-0 md:min-h-[280px]">
                                        <ResponsiveContainer width="100%" height={250}>
                                            <RadarChart data={yearRadarData} outerRadius={90}>
                                                <PolarGrid stroke={T.border} />
                                                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: T.textWarm }} />
                                                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} />
                                                <Radar name="Year" dataKey="value" stroke={T.gold} fill={T.gold} fillOpacity={0.2} strokeWidth={2} />
                                                <Tooltip content={<ChartTooltip formatter={(v: any) => v} />} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    </Card>
                                </div>
                                <div>
                                    <SectionHeader>Workout Distribution</SectionHeader>
                                    <Card className="flex flex-col items-center min-h-0 md:min-h-[280px]">
                                        <div className="relative">
                                            <ResponsiveContainer width={200} height={200}>
                                                <PieChart>
                                                    <Pie data={yearWorkoutBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                                                        {yearWorkoutBreakdown.map((entry, i) => (
                                                            <Cell key={i} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip content={({ active, payload }: any) => {
                                                        if (!active || !payload?.length) return null;
                                                        const d = payload[0].payload;
                                                        return (
                                                            <div style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', fontFamily: 'var(--font-manrope), sans-serif' }}>
                                                                <div style={{ fontSize: 10, color: d.color, fontWeight: 600 }}>{d.name}: {d.value}</div>
                                                            </div>
                                                        );
                                                    }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <div className="text-center">
                                                    <div className="text-xl font-serif" style={{ color: T.text }}>{yearWorkoutBreakdown.reduce((a, b) => a + b.value, 0)}</div>
                                                    <div className="text-[10px] text-athena-text-muted uppercase tracking-wider">total</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-2 justify-center">
                                            {yearWorkoutBreakdown.map(w => (
                                                <div key={w.name} className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-sm" style={{ background: w.color }} />
                                                    <span className="text-[10px] text-athena-text-muted">{w.name} ({w.value})</span>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        </section>

                        </DataGate>

                        {/* Monthly Split + Periodization — side by side */}
                        <DataGate feature="periodization" label="workout periodization">
                        <section>
                            <div className="grid grid-cols-2 gap-2 md:gap-4">
                                <div>
                                    <SectionHeader>Monthly Split</SectionHeader>
                                    <Card>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <BarChart data={yearMonthlyWorkoutTypes}>
                                                <XAxis dataKey="month" tick={{ fontSize: 9, fill: T.textDim }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 9, fill: T.textDim }} axisLine={false} tickLine={false} />
                                                <Tooltip content={<ChartTooltip />} />
                                                {yearWorkoutBreakdown.map(w => (
                                                    <Bar key={w.name} dataKey={w.name} stackId="s" fill={w.color} />
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </Card>
                                </div>
                                <div>
                                    <SectionHeader>Periodization</SectionHeader>
                                    <Card>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <BarChart data={yearPeriodization} layout="vertical">
                                                <XAxis type="number" tick={{ fontSize: 9, fill: T.textDim }} axisLine={false} tickLine={false} />
                                                <YAxis type="category" dataKey="month" tick={{ fontSize: 9, fill: T.textDim }} axisLine={false} tickLine={false} width={35} />
                                                <Tooltip content={({ active, payload }: any) => {
                                                    if (!active || !payload?.length) return null;
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', fontFamily: 'var(--font-manrope), sans-serif' }}>
                                                            <div style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{d.month}</div>
                                                            <div style={{ fontSize: 10, color: d.color, marginTop: 2 }}>Avg Strain: {d.strain.toFixed(1)} ({d.label})</div>
                                                            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Workouts: {d.workouts}</div>
                                                        </div>
                                                    );
                                                }} />
                                                <Bar dataKey="strain" name="Avg Strain" radius={[0, 4, 4, 0]}>
                                                    {yearPeriodization.map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} fillOpacity={0.75} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                        <div className="flex gap-3 mt-1">
                                            {[{ label: 'High Volume (>10)', color: T.red }, { label: 'Moderate (7-10)', color: T.gold }, { label: 'Recovery (<7)', color: T.green }].map(l => (
                                                <div key={l.label} className="flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-sm" style={{ background: l.color }} />
                                                    <span className="text-[7px] text-athena-text-muted">{l.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        </section>

                        </DataGate>

                        {/* Sleep Architecture + Deep Sleep Trend — combined in one card */}
                        <DataGate feature="sleepArchitecture" label="sleep architecture">
                        <section>
                            <SectionHeader>Sleep Architecture</SectionHeader>
                            <Card>
                                <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Monthly Breakdown & Recovery</div>
                                <ResponsiveContainer width="100%" height={200}>
                                    <ComposedChart data={architectureData}>
                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="l" domain={[0, 100]} tick={{ fontSize: 9, fill: T.textDim }} axisLine={false} tickLine={false} unit="%" />
                                        <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 9, fill: T.textDim }} axisLine={false} tickLine={false} unit="%" />
                                        <Tooltip content={<ChartTooltip formatter={(v: any) => `${v}%`} />} />
                                        <Bar yAxisId="l" dataKey="deep" stackId="s" fill={T.indigo} name="Deep" />
                                        <Bar yAxisId="l" dataKey="rem" stackId="s" fill={T.purple} name="REM" />
                                        <Bar yAxisId="l" dataKey="light" stackId="s" fill={T.blue} name="Light" />
                                        <Bar yAxisId="l" dataKey="awake" stackId="s" fill={T.textDim} name="Awake" radius={[3, 3, 0, 0]} />
                                        <Line yAxisId="r" type="monotone" dataKey="recovery" stroke={T.green} strokeWidth={2} dot={{ fill: T.green, r: 4, strokeWidth: 0 }} name="Avg Recovery" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                                <div className="flex gap-4 mt-2">
                                    {[{ label: 'Deep', color: T.indigo }, { label: 'REM', color: T.purple }, { label: 'Light', color: T.blue }, { label: 'Awake', color: T.textDim }, { label: 'Recovery', color: T.green }].map(l => (
                                        <div key={l.label} className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
                                            <span className="text-[10px] text-athena-text-muted">{l.label}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t border-athena-border/30 pt-3 mt-3">
                                    <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Deep Sleep % Trend</div>
                                    <ResponsiveContainer width="100%" height={80}>
                                        <LineChart data={yearDeepSleepTrend.data}>
                                            <XAxis dataKey="month" tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 8, fill: T.textDim }} axisLine={false} tickLine={false} unit="%" width={30} />
                                            <ReferenceLine y={yearDeepSleepTrend.avg} stroke={T.purpleDim} strokeDasharray="4 4" label={{ value: `avg ${yearDeepSleepTrend.avg}%`, position: 'right', fontSize: 8, fill: T.textDim }} />
                                            <Tooltip content={<ChartTooltip formatter={(v: any) => `${v}%`} />} />
                                            <Line type="monotone" dataKey="deepPct" stroke={T.purple} strokeWidth={2} dot={{ fill: T.purple, r: 2, strokeWidth: 0 }} name="Deep %" connectNulls />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </Card>
                        </section>

                        </DataGate>

                        {/* Monthly Scorecard — compact */}
                        <DataGate feature="monthlyScorecard" label="monthly scorecard">
                        <section>
                            <SectionHeader>Monthly Scorecard</SectionHeader>
                            <Card className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-4">
                                <table className="w-full border-collapse" style={{ minWidth: 700 }}>
                                    <thead>
                                        <tr>
                                            <th className="text-left text-[10px] uppercase tracking-wider text-athena-text-muted font-semibold p-0.5 w-20" />
                                            {MONTH_NAMES.map(m => (
                                                <th key={m} className="text-center text-[10px] uppercase tracking-wider text-athena-text-muted font-semibold p-0.5" style={{ width: 50 }}>{m}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {yearScorecard.rows.map(row => (
                                            <tr key={row.label}>
                                                <td className="text-[10px] text-athena-text-muted font-medium p-0.5 whitespace-nowrap">{row.label}</td>
                                                {row.values.map((val, i) => (
                                                    <td key={i} className="text-center p-0.5">
                                                        <div className="rounded px-0.5 py-0.5 text-[10px] font-semibold" style={{
                                                            background: val !== null ? `${scorecardCellColor(val, row.type)}15` : `${T.textDim}08`,
                                                            color: scorecardCellColor(val, row.type),
                                                        }}>
                                                            {val !== null ? (row.type === 'strain' ? val.toFixed(1) : val) : '-'}
                                                        </div>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>
                        </section>
                        </DataGate>
                    </>
                )}

                {/* Connect WHOOP message when disabled */}
                {!whoopEnabled && (
                    <div className="rounded-xl border border-athena-border bg-white/[0.02] p-8 flex flex-col items-center justify-center gap-4">
                        <Heart className="w-10 h-10 text-athena-text-muted/30" />
                        <div className="text-center space-y-1">
                            <h3 className="text-lg font-serif text-athena-gold">Health Analytics</h3>
                            <p className="text-sm text-athena-text-muted max-w-md">
                                Connect a WHOOP device to unlock recovery trends, sleep architecture,
                                strain analysis, and cross-domain correlations.
                            </p>
                        </div>
                    </div>
                )}

                {/* ═══════════════ SECTION 6: HABIT INSIGHTS ═══════════════ */}
                <DataGate feature="habitInsights" label="habit insights">
                <section>
                    {rangeMode === 'month' && habitScoreRollingData.length > 0 && (
                        <div className="mb-4">
                            <SectionHeader>Habit Trends</SectionHeader>
                            <Card>
                                <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Habit Score (7-Day Rolling Average)</div>
                                <HabitScoreRollingTrend data={habitScoreRollingData} height={100} />
                            </Card>
                        </div>
                    )}
                    <HabitInsightsSection
                        startDate={format(dateRange.start, 'yyyy-MM-dd')}
                        endDate={format(dateRange.end, 'yyyy-MM-dd')}
                    />
                </section>
                </DataGate>

            </div>
        </div>
        </DataMaturityProvider>
    );
}
