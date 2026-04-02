'use client';

import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import { T } from '../analytics/SharedUI';

interface BedtimeWakeRangeProps {
    data: { date: string; bedtime: number; wakeTime: number }[];
    height?: number;
}

/** Convert decimal hours (21–33 domain) to readable time, e.g. 22.5 → "10:30 PM", 30.5 → "6:30 AM" */
function decimalToTime(dec: number): string {
    let h = Math.floor(dec);
    const m = Math.round((dec - h) * 60);
    if (h >= 24) h -= 24;
    const ap = h >= 12 ? 'PM' : 'AM';
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour12}:${String(m).padStart(2, '0')} ${ap}`;
}

function formatShortDate(dateStr: string): string {
    try {
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

function yTickFormatter(value: number): string {
    let h = Math.floor(value);
    if (h >= 24) h -= 24;
    const ap = h >= 12 ? 'PM' : 'AM';
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour12} ${ap}`;
}

const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const entry = payload[0]?.payload;
    if (!entry) return null;

    const duration = entry.wakeTime - entry.bedtime;
    const durationH = Math.floor(duration);
    const durationM = Math.round((duration - durationH) * 60);

    return (
        <div style={{
            background: T.surfaceEl,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 6 }}>
                {entry.label}
            </div>
            <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.purple }} />
                <span style={{ color: T.textMuted }}>Bedtime:</span>
                <span style={{ color: T.purple, fontWeight: 600 }}>{decimalToTime(entry.bedtime)}</span>
            </div>
            <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.purpleBright || '#c084fc' }} />
                <span style={{ color: T.textMuted }}>Wake:</span>
                <span style={{ color: T.purpleBright || '#c084fc', fontWeight: 600 }}>{decimalToTime(entry.wakeTime)}</span>
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6, borderTop: `1px solid ${T.border}`, paddingTop: 4 }}>
                Duration: {durationH}h {durationM}m
            </div>
        </div>
    );
};

export function BedtimeWakeRange({ data, height = 160 }: BedtimeWakeRangeProps) {
    const chartData = useMemo(() =>
        data.map(d => ({
            ...d,
            label: formatShortDate(d.date),
            // Use a range bar: [bedtime, wakeTime] as a single dataKey
            sleepWindow: [d.bedtime, d.wakeTime] as [number, number],
        })),
        [data]
    );

    const avgBedtime = useMemo(() => {
        if (data.length === 0) return 0;
        return data.reduce((sum, d) => sum + d.bedtime, 0) / data.length;
    }, [data]);

    const avgWakeTime = useMemo(() => {
        if (data.length === 0) return 0;
        return data.reduce((sum, d) => sum + d.wakeTime, 0) / data.length;
    }, [data]);

    if (data.length === 0) {
        return <div className="text-center py-8 text-athena-text-muted text-xs">No sleep timing data</div>;
    }

    return (
        <div className={cn('w-full')}>
            <ResponsiveContainer width="100%" height={height}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={T.border}
                        vertical={false}
                    />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9, fill: T.textMuted }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        domain={[21, 33]}
                        ticks={[21, 23, 25, 27, 29, 31, 33]}
                        tickFormatter={yTickFormatter}
                        tick={{ fontSize: 9, fill: T.textMuted }}
                        axisLine={false}
                        tickLine={false}
                        reversed
                    />
                    <Tooltip
                        content={<CustomTooltip />}
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    />
                    {/* Range bar using [min, max] array format */}
                    <Bar
                        dataKey="sleepWindow"
                        name="Sleep Window"
                        fill={T.purple}
                        fillOpacity={0.4}
                        stroke={T.purpleDim || T.purple}
                        strokeWidth={0.5}
                        strokeOpacity={0.5}
                        radius={[3, 3, 3, 3]}
                    />
                    <ReferenceLine
                        y={avgBedtime}
                        stroke={T.purpleDim || T.purple}
                        strokeDasharray="4 4"
                        strokeOpacity={0.6}
                        label={{
                            value: `Avg bed ${decimalToTime(avgBedtime)}`,
                            position: 'right',
                            fontSize: 8,
                            fill: T.textDim,
                        }}
                    />
                    <ReferenceLine
                        y={avgWakeTime}
                        stroke={T.purpleBright || '#c084fc'}
                        strokeDasharray="4 4"
                        strokeOpacity={0.4}
                        label={{
                            value: `Avg wake ${decimalToTime(avgWakeTime)}`,
                            position: 'right',
                            fontSize: 8,
                            fill: T.textDim,
                        }}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
