'use client';

import React, { useMemo } from 'react';
import {
    ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Line, ComposedChart, Cell,
} from 'recharts';
import { T } from '@/components/productivity/analytics/SharedUI';
import { cn } from '@/lib/utils';

interface SleepProductivityScatterProps {
    data: { sleepScore: number; nextDayHabitScore: number; date: string }[];
    height?: number;
}

function linearRegression(points: { x: number; y: number }[]) {
    const n = points.length;
    if (n < 2) return { m: 0, b: 0, r2: 0 };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (const p of points) {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumX2 += p.x * p.x;
        sumY2 += p.y * p.y;
    }

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { m: 0, b: sumY / n, r2: 0 };

    const m = (n * sumXY - sumX * sumY) / denom;
    const b = (sumY - m * sumX) / n;

    // r² calculation
    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (const p of points) {
        ssTot += (p.y - meanY) ** 2;
        ssRes += (p.y - (m * p.x + b)) ** 2;
    }
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    return { m, b, r2 };
}

function ScatterTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
        <div style={{
            background: T.surfaceEl, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: '10px 14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontFamily: 'var(--font-manrope), sans-serif',
        }}>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 4 }}>
                {d.date}
            </div>
            <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.gold }} />
                <span style={{ color: T.textMuted }}>Sleep Score:</span>
                <span style={{ color: T.gold, fontWeight: 600 }}>{d.sleepScore}</span>
            </div>
            <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green }} />
                <span style={{ color: T.textMuted }}>Habit Score:</span>
                <span style={{ color: T.green, fontWeight: 600 }}>{d.nextDayHabitScore}%</span>
            </div>
        </div>
    );
}

export function SleepProductivityScatter({ data, height = 220 }: SleepProductivityScatterProps) {
    const regression = useMemo(() => {
        const points = data.map(d => ({ x: d.sleepScore, y: d.nextDayHabitScore }));
        return linearRegression(points);
    }, [data]);

    const regressionLine = useMemo(() => {
        if (data.length < 2) return [];
        const xMin = 0;
        const xMax = 100;
        return [
            { sleepScore: xMin, nextDayHabitScore: Math.max(0, Math.min(100, regression.m * xMin + regression.b)) },
            { sleepScore: xMax, nextDayHabitScore: Math.max(0, Math.min(100, regression.m * xMax + regression.b)) },
        ];
    }, [data.length, regression]);

    if (!data.length) return null;

    return (
        <div className={cn('relative w-full')}>
            <ResponsiveContainer width="100%" height={height}>
                <ComposedChart margin={{ top: 16, right: 16, bottom: 8, left: 5 }}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={T.border}
                        strokeOpacity={0.5}
                    />
                    <XAxis
                        type="number"
                        dataKey="sleepScore"
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: T.textMuted }}
                        axisLine={{ stroke: T.border }}
                        tickLine={false}
                        label={{ value: 'Sleep Score', position: 'insideBottom', offset: -2, fontSize: 9, fill: T.textMuted }}
                    />
                    <YAxis
                        type="number"
                        dataKey="nextDayHabitScore"
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: T.textMuted }}
                        axisLine={{ stroke: T.border }}
                        tickLine={false}
                        label={{ value: 'Habit %', angle: -90, position: 'insideLeft', offset: 10, fontSize: 9, fill: T.textMuted }}
                    />
                    <Tooltip content={<ScatterTooltip />} cursor={false} />
                    <Scatter data={data} fill={T.gold} fillOpacity={0.6}>
                        {data.map((_, i) => (
                            <Cell key={i} fill={T.gold} fillOpacity={0.6} stroke={T.bg} strokeWidth={1} />
                        ))}
                    </Scatter>
                    {regressionLine.length === 2 && (
                        <Line
                            data={regressionLine}
                            dataKey="nextDayHabitScore"
                            type="linear"
                            stroke={T.goldBright}
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            dot={false}
                            isAnimationActive={false}
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
            {/* r² annotation */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontSize: 11, color: T.textDim, opacity: 0.5 }}>
                r² = {regression.r2.toFixed(3)}
            </div>
        </div>
    );
}
