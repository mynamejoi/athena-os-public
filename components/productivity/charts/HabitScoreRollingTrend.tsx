'use client';

import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line,
} from 'recharts';
import { cn } from '@/lib/utils';
import { T } from '@/components/productivity/analytics/SharedUI';

interface HabitScoreRollingTrendProps {
    data: { date: string; score: number; rolling7d: number | null }[];
    height?: number;
}

function HabitTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: T.surfaceEl, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: '8px 12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontFamily: 'var(--font-manrope), sans-serif',
        }}>
            <div style={{ fontSize: 10, color: T.text, fontWeight: 600, marginBottom: 3 }}>{label}</div>
            {payload.map((p: any, i: number) => (
                <div key={i} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: p.color }} />
                    <span style={{ color: T.textMuted }}>
                        {p.dataKey === 'score' ? 'Daily' : '7d Avg'}:
                    </span>
                    <span style={{ color: p.color, fontWeight: 600 }}>
                        {p.value != null ? `${Math.round(p.value)}%` : '—'}
                    </span>
                </div>
            ))}
        </div>
    );
}

export function HabitScoreRollingTrend({ data, height = 80 }: HabitScoreRollingTrendProps) {
    return (
        <div className={cn('w-full')} style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                        <linearGradient id="habitScoreFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={T.gold} stopOpacity={0.1} />
                            <stop offset="100%" stopColor={T.gold} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 8, fill: T.textDim }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 8, fill: T.textDim }}
                        tickLine={false}
                        axisLine={false}
                        width={30}
                    />
                    <Tooltip content={<HabitTooltip />} />
                    <Area
                        type="monotone"
                        dataKey="score"
                        stroke={T.gold}
                        strokeWidth={1}
                        strokeOpacity={0.3}
                        fill="url(#habitScoreFill)"
                        dot={{ r: 2, fill: T.gold, fillOpacity: 0.3, strokeWidth: 0 }}
                        isAnimationActive={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="rolling7d"
                        stroke={T.gold}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
