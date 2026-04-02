'use client';

import { useMemo } from 'react';
import { Task } from '@/types/productivity';
import { parseISO, differenceInDays, formatDistanceToNow } from 'date-fns';

interface ProjectHealthProps {
    tasks: Task[];
    projectCreatedAt: string;
}

export function ProjectHealth({ tasks, projectCreatedAt }: ProjectHealthProps) {
    const metrics = useMemo(() => {
        const now = new Date();
        const projectStart = parseISO(projectCreatedAt);
        const daysActive = differenceInDays(now, projectStart);

        const total = tasks.length;
        const done = tasks.filter(t => t.status === 'Done').length;
        const inProgress = tasks.filter(t => t.status === 'In Progress').length;
        const todo = total - done - inProgress;

        // Last activity
        const lastCompleted = tasks
            .filter(t => t.status === 'Done' && t.completed_at)
            .map(t => parseISO(t.completed_at!))
            .sort((a, b) => b.getTime() - a.getTime())[0];

        const daysSinceActivity = lastCompleted ? differenceInDays(now, lastCompleted) : daysActive;
        const lastActivityText = lastCompleted ? formatDistanceToNow(lastCompleted, { addSuffix: true }) : 'No completions yet';

        // Health score
        const completionRate = total > 0 ? done / total : 0;
        const recencyScore = Math.max(0, 100 - daysSinceActivity * 10);
        const healthScore = Math.round((completionRate * 60) + (recencyScore * 0.4));

        // Status
        let status: 'healthy' | 'stale' | 'abandoned';
        if (daysSinceActivity <= 3) status = 'healthy';
        else if (daysSinceActivity <= 14) status = 'stale';
        else status = 'abandoned';

        return {
            total, done, inProgress, todo,
            daysActive, daysSinceActivity, lastActivityText,
            healthScore, status
        };
    }, [tasks, projectCreatedAt]);

    const statusColors = {
        healthy: 'text-green-400 bg-green-500/10 border-green-500/20',
        stale: 'text-athena-gold bg-athena-gold/10 border-athena-gold/20',
        abandoned: 'text-red-400 bg-red-500/10 border-red-500/20'
    };

    const statusLabels = {
        healthy: '● Active',
        stale: '◐ Stale',
        abandoned: '○ Cold'
    };

    return (
        <div className="flex flex-col h-full">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Status
            </div>

            <div className="flex-1 flex flex-col justify-center space-y-3">
                {/* Status badge */}
                <div className={`inline-flex self-start items-center px-2 py-1 rounded-full text-xs font-medium border ${statusColors[metrics.status]}`}>
                    {statusLabels[metrics.status]}
                </div>

                {/* Task breakdown bar */}
                <div className="space-y-1">
                    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden flex">
                        {metrics.done > 0 && (
                            <div
                                className="h-full bg-green-500 transition-all"
                                style={{ width: `${(metrics.done / metrics.total) * 100}%` }}
                            />
                        )}
                        {metrics.inProgress > 0 && (
                            <div
                                className="h-full bg-athena-gold transition-all"
                                style={{ width: `${(metrics.inProgress / metrics.total) * 100}%` }}
                            />
                        )}
                    </div>
                    <div className="flex justify-between text-[9px] text-zinc-500">
                        <span><span className="text-green-400">{metrics.done}</span> done</span>
                        <span><span className="text-athena-gold">{metrics.inProgress}</span> active</span>
                        <span><span className="text-zinc-400">{metrics.todo}</span> todo</span>
                    </div>
                </div>

                {/* Last activity */}
                <div className="text-[10px] text-zinc-500">
                    Last activity: <span className="text-zinc-300">{metrics.lastActivityText}</span>
                </div>
            </div>

            {/* Project age */}
            <div className="text-[10px] text-zinc-600 mt-2 pt-2 border-t border-white/5">
                {metrics.daysActive} days old
            </div>
        </div>
    );
}
