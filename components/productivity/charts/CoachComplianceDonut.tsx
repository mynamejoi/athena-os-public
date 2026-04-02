'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { T } from '@/components/productivity/analytics/SharedUI';

interface CoachComplianceDonutProps {
    completed: number;
    modified: number;
    missed: number;
    height?: number;
}

const SEGMENTS = [
    { key: 'completed', label: 'Completed', color: T.green },
    { key: 'modified', label: 'Modified', color: T.gold },
    { key: 'missed', label: 'Missed', color: T.textDim },
] as const;

export function CoachComplianceDonut({ completed, modified, missed, height = 160 }: CoachComplianceDonutProps) {
    const total = completed + modified + missed;
    const compliancePct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const pieData = [
        { name: 'Completed', value: completed, color: T.green },
        { name: 'Modified', value: modified, color: T.gold },
        { name: 'Missed', value: missed, color: T.textDim },
    ].filter(d => d.value > 0);

    const counts = { completed, modified, missed };

    return (
        <div className={cn('flex flex-col items-center')}>
            <div style={{ width: '100%', height, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius="60%"
                            outerRadius="85%"
                            dataKey="value"
                            stroke="none"
                            isAnimationActive={false}
                        >
                            {pieData.map((entry, idx) => (
                                <Cell key={idx} fill={entry.color} opacity={0.85} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                {/* Center text overlay */}
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        pointerEvents: 'none',
                    }}
                >
                    <div style={{
                        fontSize: 22,
                        fontWeight: 500,
                        color: T.text,
                        fontFamily: 'var(--font-playfair), serif',
                        lineHeight: 1,
                    }}>
                        {compliancePct}%
                    </div>
                    <div style={{
                        fontSize: 8,
                        color: T.textMuted,
                        fontFamily: 'var(--font-manrope), sans-serif',
                        marginTop: 2,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                    }}>
                        Compliance
                    </div>
                </div>
            </div>
            {/* Legend */}
            <div className={cn('flex items-center gap-4 mt-2')}>
                {SEGMENTS.map((seg) => (
                    <div key={seg.key} className="flex items-center gap-1.5">
                        <div
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: seg.color,
                            }}
                        />
                        <span style={{
                            fontSize: 10,
                            color: T.textMuted,
                            fontFamily: 'var(--font-manrope), sans-serif',
                        }}>
                            {seg.label}
                        </span>
                        <span style={{
                            fontSize: 10,
                            color: seg.color,
                            fontWeight: 600,
                            fontFamily: 'var(--font-manrope), sans-serif',
                        }}>
                            {counts[seg.key]}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
