'use client';

import React, { useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { T } from '@/components/productivity/analytics/SharedUI';

interface RhrInverseTrendProps {
    data: { date: string; rhr: number }[];
    height?: number;
}

function RhrTooltip({ active, payload, label }: any) {
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
            <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.purple }} />
                <span style={{ color: T.textMuted }}>RHR:</span>
                <span style={{ color: T.purple, fontWeight: 600 }}>{payload[0].value} bpm</span>
            </div>
        </div>
    );
}

export function RhrInverseTrend({ data, height = 180 }: RhrInverseTrendProps) {
    const chartData = useMemo(() =>
        data.map(d => ({
            ...d,
            dateLabel: format(parseISO(d.date), 'MMM d'),
        })),
        [data]
    );

    if (!data.length) return null;

    return (
        <div style={{ position: 'relative' }}>
            {/* Annotation */}
            <div style={{
                position: 'absolute', top: 2, right: 8, zIndex: 10,
                fontSize: 9, color: T.textDim,
                fontFamily: 'var(--font-manrope), sans-serif',
                letterSpacing: '0.05em',
                opacity: 0.6,
            }}>
                ↑ lower is better
            </div>

            <ResponsiveContainer width="100%" height={height}>
                <AreaChart data={chartData} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} strokeOpacity={0.4} />

                    <XAxis
                        dataKey="dateLabel"
                        tick={{ fontSize: 9, fill: T.textMuted, fontFamily: 'var(--font-manrope), sans-serif' }}
                        axisLine={{ stroke: T.border }}
                        tickLine={false}
                    />
                    <YAxis
                        reversed
                        tick={{ fontSize: 9, fill: T.textMuted, fontFamily: 'var(--font-manrope), sans-serif' }}
                        axisLine={false}
                        tickLine={false}
                        domain={['auto', 'auto']}
                    />
                    <Tooltip content={<RhrTooltip />} />

                    <Area
                        type="monotone"
                        dataKey="rhr"
                        name="RHR"
                        stroke={T.purple}
                        strokeWidth={2}
                        fill={T.purple}
                        fillOpacity={0.15}
                        dot={false}
                        activeDot={{ r: 3, fill: T.purple, stroke: T.bg, strokeWidth: 2 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
