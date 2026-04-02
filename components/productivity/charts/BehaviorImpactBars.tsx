'use client';

import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Cell, LabelList,
} from 'recharts';
import { T } from '@/components/productivity/analytics/SharedUI';
import { cn } from '@/lib/utils';

interface BehaviorImpactData {
    behavior: string;
    withAvgRecovery: number;
    withoutAvgRecovery: number;
    count: number;
}

interface BehaviorImpactBarsProps {
    data: BehaviorImpactData[];
    height?: number;
}

function BehaviorTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const entry = payload[0]?.payload;
    if (!entry) return null;
    return (
        <div style={{
            background: T.surfaceEl, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: '10px 14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontFamily: 'var(--font-manrope), sans-serif',
        }}>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 4 }}>
                {entry.behavior}
            </div>
            <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green }} />
                <span style={{ color: T.textMuted }}>With:</span>
                <span style={{ color: T.green, fontWeight: 600 }}>{entry.withAvgRecovery}%</span>
            </div>
            <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.textDim }} />
                <span style={{ color: T.textMuted }}>Without:</span>
                <span style={{ color: T.textDim, fontWeight: 600 }}>{entry.withoutAvgRecovery}%</span>
            </div>
            <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4 }}>
                {entry.count} day{entry.count !== 1 ? 's' : ''} observed
            </div>
        </div>
    );
}

export function BehaviorImpactBars({ data, height }: BehaviorImpactBarsProps) {
    const computedHeight = height ?? (data.length * 50 + 40);

    if (!data.length) return null;

    return (
        <div className={cn('w-full')}>
            <ResponsiveContainer width="100%" height={computedHeight}>
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 8, right: 40, bottom: 8, left: 10 }}
                    barGap={2}
                    barCategoryGap="20%"
                >
                    <CartesianGrid
                        horizontal={false}
                        strokeDasharray="3 3"
                        stroke={T.border}
                        strokeOpacity={0.5}
                    />
                    <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: T.textMuted }}
                        axisLine={{ stroke: T.border }}
                        tickLine={false}
                        tickFormatter={(v) => `${v}%`}
                    />
                    <YAxis
                        type="category"
                        dataKey="behavior"
                        tick={{ fontSize: 10, fill: T.textWarm }}
                        axisLine={false}
                        tickLine={false}
                        width={80}
                    />
                    <Tooltip content={<BehaviorTooltip />} cursor={{ fill: T.border, fillOpacity: 0.2 }} />
                    <Bar dataKey="withAvgRecovery" name="With" fill={T.green} radius={[0, 4, 4, 0]} barSize={12}>
                        <LabelList
                            dataKey="withAvgRecovery"
                            position="right"
                            style={{ fontSize: 9, fill: T.green, fontWeight: 600, fontFamily: 'var(--font-manrope), sans-serif' }}
                            formatter={(v: any) => `${v}%`}
                        />
                    </Bar>
                    <Bar dataKey="withoutAvgRecovery" name="Without" fill={T.textDim} radius={[0, 4, 4, 0]} barSize={12}>
                        <LabelList
                            dataKey="withoutAvgRecovery"
                            position="right"
                            style={{ fontSize: 9, fill: T.textDim, fontWeight: 600, fontFamily: 'var(--font-manrope), sans-serif' }}
                            formatter={(v: any) => `${v}%`}
                        />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
