'use client';

import React from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { cn } from '@/lib/utils';
import { T } from '@/components/productivity/analytics/SharedUI';

interface SparklineMetric {
    label: string;
    data: number[];
    color?: string;
    unit?: string;
    current?: number;
}

interface SparklineRowProps {
    metrics: SparklineMetric[];
}

export function SparklineRow({ metrics }: SparklineRowProps) {
    return (
        <div className={cn('grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2')}>
            {metrics.map((metric, idx) => {
                const color = metric.color || T.gold;
                const chartData = metric.data.map((v, i) => ({ i, v }));
                const display = metric.current != null
                    ? `${metric.current}${metric.unit ? ` ${metric.unit}` : ''}`
                    : metric.data.length > 0
                        ? `${metric.data[metric.data.length - 1]}${metric.unit ? ` ${metric.unit}` : ''}`
                        : '—';

                return (
                    <div
                        key={idx}
                        className={cn(
                            'rounded-lg p-2 flex flex-col items-center',
                            'border border-[rgba(50,44,34,0.3)]'
                        )}
                        style={{ background: 'transparent' }}
                    >
                        <div className="w-full h-[70px] md:h-[60px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
                                    <Line
                                        type="monotone"
                                        dataKey="v"
                                        stroke={color}
                                        strokeWidth={1.5}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div
                            className="text-[11px] md:text-[10px] mt-1"
                            style={{ color: T.textMuted, fontFamily: 'var(--font-manrope), sans-serif' }}
                        >
                            {metric.label}
                        </div>
                        <div
                            className="text-sm font-bold"
                            style={{ color, fontFamily: 'var(--font-manrope), sans-serif' }}
                        >
                            {display}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
