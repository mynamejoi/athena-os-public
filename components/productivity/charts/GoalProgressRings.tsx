'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { T } from '@/components/productivity/analytics/SharedUI';

interface Goal {
    title: string;
    current: number;
    target: number;
    unit: string;
    timeElapsedPct: number;
    color?: string;
}

interface GoalProgressRingsProps {
    goals: Goal[];
    onGoalClick?: (index: number) => void;
}

function ProgressRing({ goal, onClick }: { goal: Goal; onClick?: () => void }) {
    const color = goal.color || T.gold;
    const progressPct = Math.min((goal.current / goal.target) * 100, 100);
    const timePct = Math.min(goal.timeElapsedPct, 100);

    const size = 80;
    const center = size / 2;

    // Outer ring
    const outerR = 34;
    const outerCircum = 2 * Math.PI * outerR;
    const outerOffset = outerCircum - (progressPct / 100) * outerCircum;

    // Inner ring
    const innerR = 24;
    const innerCircum = 2 * Math.PI * innerR;
    const innerOffset = innerCircum - (timePct / 100) * innerCircum;

    return (
        <div
            className={cn('flex flex-col items-center gap-1.5', onClick && 'cursor-pointer hover:opacity-80 transition-opacity')}
            onClick={onClick}
        >
            <div style={{ width: size, height: size, position: 'relative' }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {/* Outer track */}
                    <circle
                        cx={center} cy={center} r={outerR}
                        fill="none" stroke={T.border} strokeWidth={5}
                    />
                    {/* Outer progress */}
                    <circle
                        cx={center} cy={center} r={outerR}
                        fill="none" stroke={color} strokeWidth={5}
                        strokeLinecap="round"
                        strokeDasharray={outerCircum}
                        strokeDashoffset={outerOffset}
                        transform={`rotate(-90 ${center} ${center})`}
                        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                    />
                    {/* Inner track */}
                    <circle
                        cx={center} cy={center} r={innerR}
                        fill="none" stroke={`${T.border}`} strokeWidth={3}
                        opacity={0.5}
                    />
                    {/* Inner time elapsed */}
                    <circle
                        cx={center} cy={center} r={innerR}
                        fill="none" stroke={T.textDim} strokeWidth={3}
                        strokeLinecap="round"
                        strokeDasharray={innerCircum}
                        strokeDashoffset={innerOffset}
                        transform={`rotate(-90 ${center} ${center})`}
                        opacity={0.6}
                        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                    />
                    {/* Center text */}
                    <text
                        x={center} y={center + 1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={14}
                        fontWeight={600}
                        fill={color}
                        fontFamily="var(--font-manrope), sans-serif"
                    >
                        {Math.round(progressPct)}%
                    </text>
                </svg>
            </div>
            <div
                className="text-center max-w-[80px]"
                style={{ fontFamily: 'var(--font-manrope), sans-serif' }}
            >
                <div
                    className="text-[10px] truncate"
                    style={{ color: T.textMuted }}
                    title={goal.title}
                >
                    {goal.title}
                </div>
                <div className="text-xs" style={{ color: T.text, fontWeight: 600 }}>
                    {goal.current}/{goal.target} {goal.unit}
                </div>
            </div>
        </div>
    );
}

export function GoalProgressRings({ goals, onGoalClick }: GoalProgressRingsProps) {
    return (
        <div className={cn('grid grid-cols-2 gap-3')}>
            {goals.map((goal, idx) => (
                <ProgressRing key={idx} goal={goal} onClick={onGoalClick ? () => onGoalClick(idx) : undefined} />
            ))}
        </div>
    );
}
