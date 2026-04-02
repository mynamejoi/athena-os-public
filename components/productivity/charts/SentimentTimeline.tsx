'use client';

import React, { useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import { T } from '@/components/productivity/analytics/SharedUI';

interface SentimentTimelineProps {
    data: { date: string; sentiment: number }[];
    height?: number;
}

function getDescriptor(value: number): string {
    if (value >= 0.5) return 'Positive';
    if (value > 0.1) return 'Slightly Positive';
    if (value >= -0.1) return 'Neutral';
    if (value > -0.5) return 'Slightly Negative';
    return 'Negative';
}

function SentimentTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const value = payload[0]?.value as number;
    const descriptor = getDescriptor(value);
    const color = value >= 0 ? T.green : '#f87171';

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
            <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                <span style={{ color: T.textMuted }}>Sentiment:</span>
                <span style={{ color, fontWeight: 600 }}>
                    {value != null ? value.toFixed(2) : '—'}
                </span>
            </div>
            <div style={{ fontSize: 9, color: T.textMuted, marginTop: 3 }}>
                {descriptor}
            </div>
        </div>
    );
}

export function SentimentTimeline({ data, height = 160 }: SentimentTimelineProps) {
    const chartData = useMemo(() =>
        data.map(d => ({
            ...d,
            positive: d.sentiment >= 0 ? d.sentiment : 0,
            negative: d.sentiment < 0 ? d.sentiment : 0,
        })),
        [data]
    );

    return (
        <div className={cn('w-full')} style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <defs>
                        <linearGradient id="sentimentPosFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={T.green} stopOpacity={0.2} />
                            <stop offset="100%" stopColor={T.green} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="sentimentNegFill" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#f87171" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9, fill: T.textDim }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        domain={[-1, 1]}
                        tick={{ fontSize: 9, fill: T.textDim }}
                        tickLine={false}
                        axisLine={false}
                        ticks={[-1, -0.5, 0, 0.5, 1]}
                        width={35}
                    />
                    <ReferenceLine
                        y={0}
                        stroke={T.textDim}
                        strokeDasharray="3 3"
                        strokeOpacity={0.5}
                    />
                    <Tooltip content={<SentimentTooltip />} />
                    <Area
                        type="monotone"
                        dataKey="positive"
                        stroke={T.green}
                        strokeWidth={1.5}
                        fill="url(#sentimentPosFill)"
                        dot={false}
                        isAnimationActive={false}
                        baseValue={0}
                    />
                    <Area
                        type="monotone"
                        dataKey="negative"
                        stroke="#f87171"
                        strokeWidth={1.5}
                        fill="url(#sentimentNegFill)"
                        dot={false}
                        isAnimationActive={false}
                        baseValue={0}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
