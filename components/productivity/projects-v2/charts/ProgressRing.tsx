'use client';

import { useMemo } from 'react';
import { Task } from '@/types/productivity';

interface ProgressRingProps {
    tasks: Task[];
    color?: string;
}

export function ProgressRing({ tasks, color = 'purple' }: ProgressRingProps) {
    const colors: Record<string, string> = {
        purple: '#a855f7',
        blue: '#3b82f6',
        green: '#22c55e',
        orange: '#f97316',
        red: '#ef4444',
        slate: '#64748b',
    };

    const stroke = colors[color || 'purple'] || colors.purple;

    const { total, done, inProgress, pct } = useMemo(() => {
        const total = tasks.length;
        const done = tasks.filter(t => t.status === 'Done').length;
        const inProgress = tasks.filter(t => t.status === 'In Progress').length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return { total, done, inProgress, pct };
    }, [tasks]);

    const size = 90;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    return (
        <div className="flex flex-col items-center justify-center h-full">
            <div className="relative">
                <svg width={size} height={size} className="-rotate-90">
                    {/* Background circle */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth={strokeWidth}
                    />
                    {/* Progress circle */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className="transition-all duration-500"
                    />
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-white">{pct}%</span>
                </div>
            </div>
            {/* Stats below */}
            <div className="mt-3 text-center space-y-1">
                <div className="text-xs text-zinc-400">
                    <span className="text-white font-mono">{done}</span>/{total} complete
                </div>
                {inProgress > 0 && (
                    <div className="text-[10px] text-athena-gold/80">
                        {inProgress} in progress
                    </div>
                )}
            </div>
        </div>
    );
}
