'use client';

import React, { useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ReferenceLine, Line,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { T } from '@/components/productivity/analytics/SharedUI';

interface HrvRollingAverageProps {
    data: { date: string; hrv: number; rolling7d: number | null }[];
    height?: number;
}

function HrvTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: T.surfaceEl, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: '10px 14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontFamily: 'var(--font-manrope), sans-serif',
        }}>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 4 }}>
                {label}
            </div>
            {payload.map((p: any, i: number) => (
                <div key={i} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
                    <span style={{ color: T.textMuted }}>
                        {p.dataKey === 'hrv' ? 'HRV' : '7d Avg'}:
                    </span>
                    <span style={{ color: p.color, fontWeight: 600 }}>
                        {p.value != null ? Math.round(p.value) : '—'} ms
                    </span>
                </div>
            ))}
        </div>
    );
}

export function HrvRollingAverage({ data, height = 180 }: HrvRollingAverageProps) {
    const chartData = useMemo(() =>
        data.map(d => ({
            ...d,
            dateLabel: format(parseISO(d.date), 'MMM d'),
        })),
        [data]
    );

    const avg = useMemo(() => {
        const valid = data.filter(d => d.hrv > 0);
        if (!valid.length) return 0;
        return Math.round(valid.reduce((s, d) => s + d.hrv, 0) / valid.length);
    }, [data]);

    if (!data.length) return null;

    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} strokeOpacity={0.4} />

                <ReferenceLine
                    y={avg}
                    stroke={T.textMuted}
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{
                        value: `avg ${avg}`,
                        position: 'right',
                        fill: T.textMuted,
                        fontSize: 9,
                        fontFamily: 'var(--font-manrope), sans-serif',
                    }}
                />

                <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 9, fill: T.textMuted, fontFamily: 'var(--font-manrope), sans-serif' }}
                    axisLine={{ stroke: T.border }}
                    tickLine={false}
                />
                <YAxis
                    tick={{ fontSize: 9, fill: T.textMuted, fontFamily: 'var(--font-manrope), sans-serif' }}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                />
                <Tooltip content={<HrvTooltip />} />

                {/* Raw daily HRV area */}
                <Area
                    type="monotone"
                    dataKey="hrv"
                    name="HRV"
                    stroke={T.gold}
                    strokeWidth={1}
                    fill={T.gold}
                    fillOpacity={0.15}
                    dot={false}
                    activeDot={{ r: 3, fill: T.gold, stroke: T.bg, strokeWidth: 2 }}
                />

                {/* 7-day rolling average line */}
                <Line
                    type="monotone"
                    dataKey="rolling7d"
                    name="7d Avg"
                    stroke={T.gold}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 3, fill: T.gold, stroke: T.bg, strokeWidth: 2 }}
                    connectNulls={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
