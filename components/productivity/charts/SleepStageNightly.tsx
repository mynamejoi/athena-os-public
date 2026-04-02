'use client';

import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { T } from '../analytics/SharedUI';

interface SleepStageNightlyProps {
    data: { date: string; deep: number; rem: number; light: number; awake: number }[];
    height?: number | `${number}%`;
}

const STAGES = [
    { key: 'deep', label: 'Deep', color: '#7c3aed' },     // purple-700
    { key: 'rem', label: 'REM', color: '#c084fc' },        // purple-400
    { key: 'light', label: 'Light', color: '#93c5fd' },    // blue-300
    { key: 'awake', label: 'Awake', color: '#f87171' },    // red-400
] as const;

function fmtMinsToHrs(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatShortDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const totalMins = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);

    return (
        <div style={{
            background: T.surfaceEl,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontFamily: 'var(--sans)',
        }}>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 6 }}>
                {label}
            </div>
            {payload.map((p: any, i: number) => {
                const pct = totalMins > 0 ? Math.round((p.value / totalMins) * 100) : 0;
                return (
                    <div key={i} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
                        <span style={{ color: T.textMuted }}>{p.name}:</span>
                        <span style={{ color: p.color, fontWeight: 600 }}>
                            {fmtMinsToHrs(p.value)} ({pct}%)
                        </span>
                    </div>
                );
            })}
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6, borderTop: `1px solid ${T.border}`, paddingTop: 4 }}>
                Total: {fmtMinsToHrs(totalMins)}
            </div>
        </div>
    );
};

const CustomLegend = () => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
        {STAGES.map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
                <span style={{ fontSize: 10, color: T.textMuted, fontFamily: 'var(--sans)' }}>{s.label}</span>
            </div>
        ))}
    </div>
);

export function SleepStageNightly({ data, height = 220 }: SleepStageNightlyProps) {
    const chartData = data.map(d => ({
        ...d,
        label: formatShortDate(d.date),
        // Convert to hours for YAxis display
        deepH: d.deep / 60,
        remH: d.rem / 60,
        lightH: d.light / 60,
        awakeH: d.awake / 60,
    }));

    return (
        <div className={cn('w-full')}>
            <ResponsiveContainer width="100%" height={height}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
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
                        tick={{ fontSize: 9, fill: T.textMuted }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => `${v}h`}
                    />
                    <Tooltip
                        content={<CustomTooltip />}
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    />
                    {STAGES.map(s => (
                        <Bar
                            key={s.key}
                            dataKey={`${s.key}H`}
                            name={s.label}
                            stackId="sleep"
                            fill={s.color}
                            radius={s.key === 'awake' ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                            opacity={0.85}
                        />
                    ))}
                    <Legend content={<CustomLegend />} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
