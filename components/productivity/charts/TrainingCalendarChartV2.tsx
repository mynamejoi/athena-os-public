
import React, { useState } from 'react';
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { format, getDaysInMonth, startOfMonth, startOfYear, endOfYear, eachDayOfInterval, getDayOfYear } from 'date-fns';
import { Zap } from 'lucide-react';
import { T } from '@/components/productivity/analytics/SharedUI';

interface TrainingCalendarChartProps {
    workouts: any[];
    dailyTasks?: any[];
    currentDate: Date;
    filter: string;
    viewType?: 'month' | 'year';
}

// Reuse Sport Colors from V1
const SPORT_COLORS: Record<string, string> = {
    'Push (Chest)': '#f472b6', 'Push (Tricep)': '#e879a0',
    'Pull (Bicep)': '#60a5fa', 'Pull (Back)': '#3b82f6',
    'Push Day': '#f472b6', 'Push': '#f472b6',
    'Pull Day': '#3b82f6', 'Pull': '#3b82f6',
    'Leg Day': '#a855f7', 'Legs': '#a855f7', 'Leg': '#a855f7',
    'Functional Fitness': '#818cf8',
    'Basketball': '#f97316',
    'Golf': '#22c55e',
    'Spin': 'rgb(var(--athena-gold))',
    'Running': '#3b82f6',
    'Cycling': '#3b82f6',
    'Swimming': '#06b6d4',
    'Weightlifting': '#a855f7',
    'Yoga': '#f472b6',
    'Sauna': '#fb923c',
    'Ice Bath': '#22d3ee',
    'Shoveling': '#71717a',
    'Walking': '#ec4899',
    'Walk': '#ec4899',
    'Hiking': '#84cc16',
    'hiking-rucking': '#84cc16',
    'General Activity': '#14b8a6',
};
const DEFAULT_COLOR = '#9ca3af';

// Helper to get color for activity
const getActivityColor = (workout: any) => {
    if (workout.workout_label && SPORT_COLORS[workout.workout_label]) return SPORT_COLORS[workout.workout_label];
    if (SPORT_COLORS[workout.sport_name]) return SPORT_COLORS[workout.sport_name];
    const name = (workout.sport_name || '').toLowerCase();
    if (name.includes('push')) return SPORT_COLORS['Push'];
    if (name.includes('pull')) return SPORT_COLORS['Pull'];
    if (name.includes('leg')) return SPORT_COLORS['Legs'];
    return DEFAULT_COLOR;
};

const isRecovery = (name: string) => {
    const n = (name || '').toLowerCase();
    return n.includes('sauna') || n.includes('steam') || n.includes('ice bath') || n.includes('recovery');
};

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const totalDuration = data.dayTotalDuration;

        return (
            <div style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, minWidth: 200, fontFamily: "var(--font-manrope), sans-serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                <div style={{ paddingBottom: 8, borderBottom: `1px solid ${T.border}`, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "var(--font-playfair), serif" }}>
                            {format(new Date(data.date + 'T00:00:00'), 'MMM d')}
                        </span>
                        <span style={{ fontSize: 10, color: T.textDim }}>Day {data.day}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textMuted }}>
                        <span>{totalDuration?.toFixed(1)}h Total</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {Number(data.strain).toFixed(1)} <Zap size={10} fill={T.gold} color={T.gold} />
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[0, 1, 2, 3].map(idx => {
                        const name = data[`w${idx}_name`];
                        if (!name) return null;

                        const color = data[`w${idx}_color`];
                        const z0 = data[`w${idx}_z0`] || 0;
                        const z1 = data[`w${idx}_z1`] || 0;
                        const z2 = data[`w${idx}_z2`] || 0;
                        const z3 = data[`w${idx}_z3`] || 0;
                        const z4 = data[`w${idx}_z4`] || 0;
                        const z5 = data[`w${idx}_z5`] || 0;
                        const total = z0 + z1 + z2 + z3 + z4 + z5;
                        const displayTotal = total < 0.01 && data[`w${idx}_fallback`] ? data[`w${idx}_z0`] : total;

                        return (
                            <div key={idx} style={{ fontSize: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
                                    <span style={{ fontWeight: 500, color: T.text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                                    <span style={{ color: T.textDim }}>{Number(displayTotal).toFixed(1)}h</span>
                                </div>
                                <div style={{ display: 'flex', height: 4, width: '100%', borderRadius: 2, overflow: 'hidden', background: `${T.textDim}20` }}>
                                    {(z0 > 0) && <div style={{ width: `${(z0 / total) * 100}%`, backgroundColor: color, opacity: 0.2 }} />}
                                    {(z1 > 0) && <div style={{ width: `${(z1 / total) * 100}%`, backgroundColor: color, opacity: 0.35 }} />}
                                    {(z2 > 0) && <div style={{ width: `${(z2 / total) * 100}%`, backgroundColor: color, opacity: 0.5 }} />}
                                    {(z3 > 0) && <div style={{ width: `${(z3 / total) * 100}%`, backgroundColor: color, opacity: 0.65 }} />}
                                    {(z4 > 0) && <div style={{ width: `${(z4 / total) * 100}%`, backgroundColor: color, opacity: 0.8 }} />}
                                    {(z5 > 0) && <div style={{ width: `${(z5 / total) * 100}%`, backgroundColor: color, opacity: 1.0 }} />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
    return null;
};

const getWorkoutSplitFromTask = (tasks: any[], date: string) => {
    const workoutTask = tasks.find(t => {
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
};

export function TrainingCalendarChartV2({ workouts, dailyTasks, currentDate, filter, viewType = 'month' }: TrainingCalendarChartProps) {
    const filters = ['All', 'Push (Chest)', 'Push (Tricep)', 'Pull (Bicep)', 'Pull (Back)', 'Legs', 'Cardio', 'Recovery', 'Other'];

    // Determine range based on viewType
    let rangeStart: Date;
    let rangeEnd: Date;

    if (viewType === 'year') {
        rangeStart = startOfYear(currentDate);
        rangeEnd = endOfYear(currentDate);
    } else {
        rangeStart = startOfMonth(currentDate);
        rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0); // End of month
    }

    // Cap range to today so we don't show empty future days
    const today = new Date();
    if (rangeEnd > today) {
        rangeEnd = today;
    }

    const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

    // 1. Process only real WHOOP-synced workouts (no synthetic entries)
    const processedWorkouts = workouts.map(w => {
        const split = getWorkoutSplitFromTask(dailyTasks || [], w.date);
        let type = w.workout_label || w.sport_name || 'Other';
        const isLifting = ['Functional Fitness', 'Weightlifting', 'Gym', 'Powerlifting', 'CrossFit', 'Box Fitness'].includes(w.sport_name);

        if (split && isLifting) {
            if (split === 'Leg Day') type = 'Legs';
            else if (split === 'Push Day' || split === 'Push') type = 'Push (Chest)';
            else if (split === 'Pull Day' || split === 'Pull') type = 'Pull (Bicep)';
            else type = split;
        }
        else if (type === 'Leg Day' || type === 'Leg') type = 'Legs';
        else if (type === 'Push Day' || type === 'Push') type = 'Push (Chest)';
        else if (type === 'Pull Day' || type === 'Pull') type = 'Pull (Bicep)';

        // Normalize WHOOP API hyphenated sport names
        const lower = type.toLowerCase();
        if (lower === 'hiking-rucking' || lower === 'hiking' || lower === 'rucking') type = 'Hiking';
        else if (lower === 'walking' || lower === 'walk') type = 'Walk';

        return { ...w, displayType: type, workout_label: type };
    });

    // 2. Filter
    const displayWorkouts = processedWorkouts.filter(w => {
        const type = w.displayType;
        const isRecov = isRecovery(type);
        const isCardio = ['Running', 'Cycling', 'Spin', 'Swimming', 'Basketball', 'Rowing', 'Walking', 'Walk', 'Hiking'].includes(type);

        if (filter === 'All') return !isRecovery(type);
        if (filter === 'Recovery') return isRecov;
        if (filter === 'Cardio') return isCardio;
        if (filter === 'Other') return !isRecov && !isCardio && !['Push (Chest)', 'Push (Tricep)', 'Pull (Bicep)', 'Pull (Back)', 'Legs'].includes(type);
        return type === filter;
    });

    // 3. Prepare Chart Data (Zones etc)
    const data = allDays.map((dateObj, i) => {
        const dayNum = viewType === 'year' ? getDayOfYear(dateObj) : i + 1;
        const dateStr = format(dateObj, 'yyyy-MM-dd');

        // Filter Future Days
        if (dateStr > format(new Date(), 'yyyy-MM-dd')) return { day: dayNum, date: dateStr }; // Return empty data for future

        const daily = displayWorkouts.filter(w => w.date === dateStr);
        const payload: any = { day: dayNum, date: dateStr };

        // YEAR VIEW OPTIMIZATION: Calc total duration only, skip zones
        if (viewType === 'year') {
            payload.dayTotalDuration = daily.reduce((acc, w) => acc + ((w.duration_minutes || 0) / 60), 0);
            if (daily.length > 0) {
                const dominant = [...daily].sort((a, b) => b.strain - a.strain)[0];
                payload.dominantColor = getActivityColor(dominant);
            } else {
                payload.dominantColor = DEFAULT_COLOR;
            }
            if (daily.length > 0) payload.strain = Math.max(...daily.map(w => w.strain));
            return payload;
        }

        daily.forEach((w, idx) => {
            if (idx > 3) return;
            const prefix = `w${idx}`;
            payload[`${prefix}_name`] = w.displayType;
            const z0 = (w.zone_0_milli || 0) / 3600000;
            const z1 = (w.zone_1_milli || 0) / 3600000;
            const z2 = (w.zone_2_milli || 0) / 3600000;
            const z3 = (w.zone_3_milli || 0) / 3600000;
            const z4 = (w.zone_4_milli || 0) / 3600000;
            const z5 = (w.zone_5_milli || 0) / 3600000;
            const totalZones = z0 + z1 + z2 + z3 + z4 + z5;
            const durationHours = (w.duration_minutes || 0) / 60;
            const displayDuration = durationHours;
            const isFallback = (totalZones < 0.01 && durationHours > 0);

            if (isFallback) {
                payload[`${prefix}_z0`] = displayDuration;
                payload[`${prefix}_fallback`] = true;
            } else {
                payload[`${prefix}_z0`] = z0;
                payload[`${prefix}_z1`] = z1;
                payload[`${prefix}_z2`] = z2;
                payload[`${prefix}_z3`] = z3;
                payload[`${prefix}_z4`] = z4;
                payload[`${prefix}_z5`] = z5;
            }
            payload[`${prefix}_color`] = getActivityColor(w);
            if (!payload.strain || w.strain > payload.strain) payload.strain = w.strain;
        });

        payload.dayTotalDuration = daily.reduce((acc, w) => acc + ((w.duration_minutes || 0) / 60), 0);
        return payload;
    });

    return (
        <div className="w-full h-full flex flex-col gap-4">
            <div className="flex-1 min-h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <XAxis
                            dataKey={viewType === 'year' ? "date" : "day"}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: T.textDim, fontSize: 9 }}
                            interval={viewType === 'year' ? 30 : 2}
                            tickFormatter={(val) => viewType === 'year' ? new Date(val + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }) : val}
                        />
                        <YAxis yAxisId="duration" orientation="left" domain={[0, 'auto']} axisLine={false} tickLine={false} tick={{ fill: T.textDim, fontSize: 9 }} unit="h" width={40} />
                        <YAxis yAxisId="strain" orientation="right" domain={[0, 21]} axisLine={false} tickLine={false} tick={{ fill: T.gold, fontSize: 9 }} width={40} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        <Line yAxisId="strain" type="monotone" dataKey="strain" stroke={T.gold} strokeWidth={2} dot={viewType === 'year' ? false : { fill: T.gold, r: 2 }} connectNulls activeDot={{ r: 4, fill: '#fff' }} />

                        {viewType === 'year' ? (
                            <Bar yAxisId="duration" dataKey="dayTotalDuration" barSize={3} radius={[2, 2, 0, 0]}>
                                {data.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={entry.dominantColor} fillOpacity={0.8} />
                                ))}
                            </Bar>
                        ) : (
                            [0, 1, 2, 3].map(wIdx => (
                                [0, 1, 2, 3, 4, 5].map(z => (
                                    <Bar key={`w${wIdx}_z${z}`} dataKey={`w${wIdx}_z${z}`} stackId="day" yAxisId="duration" radius={z === 5 ? [2, 2, 0, 0] : [0, 0, 0, 0]}>
                                        {data.map((entry: any, index: number) => {
                                            const isFallback = entry[`w${wIdx}_fallback`];
                                            const opacity = (isFallback && z === 0) ? 0.7 : (0.2 + (z * 0.15));
                                            return <Cell key={`cell-${index}`} fill={entry[`w${wIdx}_color`] || DEFAULT_COLOR} fillOpacity={opacity} strokeWidth={0} />
                                        })}
                                    </Bar>
                                ))
                            ))
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
