'use client';

import { useMemo } from 'react';
import { Task } from '@/types/productivity';
import { parseISO, differenceInDays, subDays, isAfter } from 'date-fns';

interface MomentumGaugeProps {
    tasks: Task[];
    projectStatus?: string;
}

export function MomentumGauge({ tasks, projectStatus }: MomentumGaugeProps) {
    const { score, status, color, trend } = useMemo(() => {
        const now = new Date();
        const week1 = subDays(now, 7);
        const week2 = subDays(now, 14);

        // Check for completion first
        const totalTasks = tasks.length;
        const doneTasks = tasks.filter(t => t.status === 'Done').length;
        const completionRate = totalTasks > 0 ? doneTasks / totalTasks : 0;

        // If project is explicitly completed/archived OR strictly 100% done
        if (projectStatus === 'Completed' || projectStatus === 'Archived' || (totalTasks > 0 && doneTasks === totalTasks)) {
            return {
                score: 100,
                status: 'PEAK',
                color: { main: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)' },
                trend: 'Project Complete'
            };
        }

        const recent = tasks.filter(t =>
            t.status === 'Done' && t.completed_at && isAfter(parseISO(t.completed_at), week1)
        ).length;

        const previous = tasks.filter(t =>
            t.status === 'Done' && t.completed_at &&
            isAfter(parseISO(t.completed_at), week2) && !isAfter(parseISO(t.completed_at), week1)
        ).length;

        const lastDone = tasks
            .filter(t => t.status === 'Done' && t.completed_at)
            .map(t => parseISO(t.completed_at!))
            .sort((a, b) => b.getTime() - a.getTime())[0];

        const inactive = lastDone ? differenceInDays(now, lastDone) : 99;

        // NEW LOGIC: Target velocity of 5 tasks/week = 100% Momentum base
        // Old logic required 20% of TOTAL project to be done weekly, which is impossible for large projects
        const TARGET_VELOCITY = 5;
        const base = Math.min((recent / TARGET_VELOCITY) * 80, 80);

        const recencyBonus = Math.max(0, 20 - inactive * 4);
        const score = Math.min(100, Math.max(0, Math.round(base + recencyBonus)));

        let status: string;
        let color: { main: string; glow: string };
        if (score >= 70) {
            status = 'ON FIRE';
            color = { main: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)' };
        } else if (score >= 40) {
            status = 'CRUISING';
            color = { main: 'rgb(var(--athena-gold))', glow: 'rgb(var(--athena-gold))' };
        } else {
            status = 'DORMANT';
            color = { main: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)' };
        }

        let trend: string;
        if (inactive > 3) {
            trend = `${inactive}d inactive`;
        } else if (recent > previous && previous > 0) {
            trend = `↑ ${Math.round(((recent - previous) / previous) * 100)}%`;
        } else if (recent < previous && previous > 0) {
            trend = `↓ ${Math.round(((previous - recent) / previous) * 100)}%`;
        } else {
            trend = 'steady';
        }

        return { score, status, color, trend };
    }, [tasks]);

    // Arc geometry - responsive
    const radius = 40;
    const strokeWidth = 8;
    const cx = 50;
    const cy = 50;

    const arc = (pct: number) => {
        const angle = 180 - pct * 180;
        const rad = (angle * Math.PI) / 180;
        return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
    };

    const start = arc(0);
    const end = arc(1);
    const val = arc(score / 100);

    const bgPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
    const valPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${val.x} ${val.y}`;

    return (
        <div className="flex flex-col h-full items-center">
            {/* Header */}
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 self-start shrink-0">Momentum</div>

            {/* Gauge - fills space */}
            <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full">
                <div className="relative w-full max-w-[120px] aspect-[2/1.2]">
                    <svg viewBox="0 0 100 55" className="w-full h-full overflow-visible">
                        {/* Background arc */}
                        <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} strokeLinecap="round" />

                        {/* Glow */}
                        <path d={valPath} fill="none" stroke={color.glow} strokeWidth={strokeWidth + 6} strokeLinecap="butt" />

                        {/* Value arc */}
                        <path d={valPath} fill="none" stroke={color.main} strokeWidth={strokeWidth} strokeLinecap="butt" />
                    </svg>

                    {/* Score in center */}
                    <div className="absolute inset-x-0 bottom-0 flex justify-center">
                        <span className="text-3xl font-black font-mono" style={{ color: color.main, textShadow: `0 0 15px ${color.glow}` }}>
                            {score}
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col items-center gap-1 mt-1 shrink-0">
                <div
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: color.main, background: `${color.main}15`, border: `1px solid ${color.main}30` }}
                >
                    {status}
                </div>
                <span className="text-[10px] text-zinc-500">{trend}</span>
            </div>
        </div>
    );
}
