'use client';

import { useMemo } from 'react';
import { Task } from '@/types/productivity';
import { parseISO, startOfWeek, addDays, subWeeks, format, isSameDay } from 'date-fns';

interface ActivityHeatmapProps {
    tasks: Task[];
    color?: string;
}

export function ActivityHeatmap({ tasks, color = 'purple' }: ActivityHeatmapProps) {
    const colors: Record<string, { base: string; levels: string[] }> = {
        purple: { base: '#1a0a2e', levels: ['#6b21a8', '#9333ea', '#a855f7', '#c084fc'] },
        blue: { base: '#0a1628', levels: ['#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd'] },
        green: { base: '#052e16', levels: ['#15803d', '#22c55e', '#4ade80', '#86efac'] },
        orange: { base: '#1c0a00', levels: ['#c2410c', '#f97316', '#fb923c', '#fdba74'] },
        red: { base: '#1c0a0a', levels: ['#b91c1c', '#ef4444', '#f87171', '#fca5a5'] },
        slate: { base: '#0f172a', levels: ['#475569', '#64748b', '#94a3b8', '#cbd5e1'] },
        gold: { base: 'rgba(255,255,255,0.04)', levels: ['rgb(var(--athena-gold-dim))', 'rgb(var(--athena-gold-dim))', 'rgb(var(--athena-gold))', 'rgb(var(--athena-gold-bright))'] },
        teal: { base: '#042f2e', levels: ['#0f766e', '#0d9488', '#14b8a6', '#5eead4'] },
    };

    const cv = colors[color || 'purple'] || colors.purple;

    const { grid, activeDays, streak } = useMemo(() => {
        const now = new Date();
        const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
        const gridStart = subWeeks(currentWeekStart, 6);

        const grid: { date: Date; count: number; future: boolean }[][] = [];
        let activeDays = 0;
        let streak = 0;
        let counting = true;

        for (let week = 0; week < 7; week++) {
            const col: { date: Date; count: number; future: boolean }[] = [];
            for (let day = 0; day < 7; day++) {
                const date = addDays(gridStart, week * 7 + day);
                const future = date > now;
                const count = tasks.filter(t =>
                    t.status === 'Done' && t.completed_at && isSameDay(parseISO(t.completed_at), date)
                ).length;
                col.push({ date, count, future });
                if (!future && count > 0) activeDays++;
            }
            grid.push(col);
        }

        const flat = grid.flat().filter(d => !d.future).reverse();
        for (const d of flat) {
            if (d.count > 0 && counting) streak++;
            else if (d.count === 0 && counting) counting = false;
        }

        return { grid, activeDays, streak };
    }, [tasks]);

    const getColor = (count: number, future: boolean) => {
        if (future) return 'rgba(255,255,255,0.02)';
        if (count === 0) return cv.base;
        return cv.levels[Math.min(count - 1, 3)];
    };

    const getGlow = (count: number) => {
        if (count >= 3) return `0 0 6px ${cv.levels[3]}40`;
        return 'none';
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 shrink-0">Activity</div>

            {/* Grid - centered and fills space */}
            <div className="flex-1 flex items-center justify-center min-h-0">
                <div className="flex gap-[3px]">
                    {/* Day labels */}
                    <div className="flex flex-col gap-[3px] pr-1">
                        {['M', '', 'W', '', 'F', '', 'S'].map((l, i) => (
                            <div key={i} className="w-3 h-3 flex items-center justify-end text-[8px] text-zinc-600">{l}</div>
                        ))}
                    </div>

                    {/* Grid cells */}
                    {grid.map((week, wi) => (
                        <div key={wi} className="flex flex-col gap-[3px]">
                            {week.map((day, di) => (
                                <div
                                    key={di}
                                    className="w-3 h-3 rounded-sm transition-transform hover:scale-150 cursor-pointer"
                                    style={{
                                        background: getColor(day.count, day.future),
                                        boxShadow: getGlow(day.count)
                                    }}
                                    title={`${format(day.date, 'MMM d')}: ${day.count} tasks`}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-baseline justify-between mt-2 shrink-0">
                <div className="flex items-baseline gap-4">
                    <div>
                        <span className="text-2xl font-bold" style={{ color: cv.levels[3] }}>{activeDays}</span>
                        <span className="text-[9px] text-zinc-500 ml-1">days</span>
                    </div>
                    <div>
                        <span className="text-2xl font-bold" style={{ color: cv.levels[3] }}>{streak}</span>
                        <span className="text-[9px] text-zinc-500 ml-1">streak</span>
                    </div>
                </div>
                <div className="flex items-center gap-[2px]">
                    {[cv.base, ...cv.levels.slice(0, 3)].map((c, i) => (
                        <div key={i} className="w-2 h-2 rounded-sm" style={{ background: c }} />
                    ))}
                </div>
            </div>
        </div>
    );
}
