'use client';

import { useMemo } from 'react';
import { Task } from '@/types/productivity';
import { parseISO, startOfWeek, subWeeks, isAfter, isBefore, addWeeks, format } from 'date-fns';

interface WeeklyVelocityProps {
    tasks: Task[];
    color?: string;
}

export function WeeklyVelocity({ tasks, color = 'purple' }: WeeklyVelocityProps) {
    const colors: Record<string, { bar: string; glow: string }> = {
        purple: { bar: 'bg-purple-500', glow: 'shadow-purple-500/30' },
        blue: { bar: 'bg-blue-500', glow: 'shadow-blue-500/30' },
        green: { bar: 'bg-green-500', glow: 'shadow-green-500/30' },
        orange: { bar: 'bg-orange-500', glow: 'shadow-orange-500/30' },
        red: { bar: 'bg-red-500', glow: 'shadow-red-500/30' },
        slate: { bar: 'bg-slate-500', glow: 'shadow-slate-500/30' },
    };

    const { bar, glow } = colors[color || 'purple'] || colors.purple;

    const { weeks, maxTasks, avgVelocity, trend } = useMemo(() => {
        const now = new Date();
        const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });

        const weeks: { label: string; count: number; isCurrent: boolean }[] = [];

        for (let i = 7; i >= 0; i--) {
            const weekStart = subWeeks(currentWeekStart, i);
            const weekEnd = addWeeks(weekStart, 1);

            const count = tasks.filter(t => {
                if (t.status !== 'Done' || !t.completed_at) return false;
                const date = parseISO(t.completed_at);
                return isAfter(date, weekStart) && isBefore(date, weekEnd);
            }).length;

            weeks.push({
                label: format(weekStart, 'M/d'),
                count,
                isCurrent: i === 0
            });
        }

        const maxTasks = Math.max(...weeks.map(w => w.count), 1);
        const recentWeeks = weeks.slice(-4);
        const avgVelocity = Math.round(recentWeeks.reduce((sum, w) => sum + w.count, 0) / 4);

        // Trend: compare last 4 weeks to previous 4
        const recent = weeks.slice(-4).reduce((sum, w) => sum + w.count, 0);
        const previous = weeks.slice(0, 4).reduce((sum, w) => sum + w.count, 0);
        const trend = previous > 0 ? Math.round(((recent - previous) / previous) * 100) : 0;

        return { weeks, maxTasks, avgVelocity, trend };
    }, [tasks]);

    return (
        <div className="flex flex-col h-full">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Weekly Velocity
            </div>

            {/* Bar chart */}
            <div className="flex-1 flex items-end gap-1 min-h-0">
                {weeks.map((week, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex-1 flex items-end">
                            <div
                                className={`w-full rounded-t transition-all ${bar} ${week.isCurrent ? `shadow-lg ${glow}` : 'opacity-70'}`}
                                style={{ height: `${Math.max((week.count / maxTasks) * 100, 4)}%` }}
                            />
                        </div>
                        <span className={`text-[8px] ${week.isCurrent ? 'text-white' : 'text-zinc-600'}`}>
                            {week.isCurrent ? 'now' : ''}
                        </span>
                    </div>
                ))}
            </div>

            {/* Stats */}
            <div className="flex justify-between text-[10px] text-zinc-500 mt-2 pt-2 border-t border-white/5">
                <span>
                    <span className="text-white font-mono">{avgVelocity}</span>/wk avg
                </span>
                <span className={trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : ''}>
                    {trend > 0 ? '▲' : trend < 0 ? '▼' : '—'} {Math.abs(trend)}%
                </span>
            </div>
        </div>
    );
}
