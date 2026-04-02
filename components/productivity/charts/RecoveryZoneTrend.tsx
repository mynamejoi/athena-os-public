'use client';

import React, { useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ReferenceArea, ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { T } from '@/components/productivity/analytics/SharedUI';

interface RecoveryZoneTrendProps {
    data: { date: string; recovery: number }[];
    height?: number;
}

function RecoveryTooltip({ active, payload, label }: any) {
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
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.gold }} />
                <span style={{ color: T.textMuted }}>Recovery:</span>
                <span style={{ color: T.gold, fontWeight: 600 }}>{payload[0].value}%</span>
            </div>
        </div>
    );
}

export function RecoveryZoneTrend({ data, height = 180 }: RecoveryZoneTrendProps) {
    const chartData = useMemo(() =>
        data.map(d => ({
            ...d,
            dateLabel: format(parseISO(d.date), 'MMM d'),
        })),
        [data]
    );

    const avg = useMemo(() => {
        if (!data.length) return 0;
        return Math.round(data.reduce((s, d) => s + d.recovery, 0) / data.length);
    }, [data]);

    if (!data.length) return null;

    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} strokeOpacity={0.4} />

                {/* Zone backgrounds */}
                <ReferenceArea y1={0} y2={33} fill="rgba(239,68,68,0.08)" fillOpacity={1} />
                <ReferenceArea y1={33} y2={66} fill="rgba(234,179,8,0.08)" fillOpacity={1} />
                <ReferenceArea y1={66} y2={100} fill="rgba(34,197,94,0.08)" fillOpacity={1} />

                {/* Average line */}
                <ReferenceLine
                    y={avg}
                    stroke={T.textMuted}
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{
                        value: `avg ${avg}%`,
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
                    domain={[0, 100]}
                    tick={{ fontSize: 9, fill: T.textMuted, fontFamily: 'var(--font-manrope), sans-serif' }}
                    axisLine={false}
                    tickLine={false}
                />
                <Tooltip content={<RecoveryTooltip />} />
                <Area
                    type="monotone"
                    dataKey="recovery"
                    stroke={T.gold}
                    strokeWidth={2}
                    fill={T.gold}
                    fillOpacity={0.1}
                    dot={false}
                    activeDot={{ r: 3, fill: T.gold, stroke: T.bg, strokeWidth: 2 }}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
