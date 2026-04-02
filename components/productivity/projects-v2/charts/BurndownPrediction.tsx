'use client';

import { useMemo } from 'react';
import { Task } from '@/types/productivity';
import {
    ComposedChart,
    Line,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
} from 'recharts';
import {
    parseISO,
    startOfWeek,
    differenceInWeeks,
    addWeeks,
    isBefore,
    format,
} from 'date-fns';

interface BurndownPredictionProps {
    tasks: Task[];
    projectCreatedAt: string;
    deadline?: string | null;
    projectColor?: string;
    compact?: boolean;
}

interface WeekDataPoint {
    week: number;
    label: string;
    total: number;
    completed: number;
    projected?: number;
    optimistic?: number;
    pessimistic?: number;
}

type StatusKind = 'on-track' | 'at-risk' | 'behind' | 'no-deadline';

interface StatusInfo {
    kind: StatusKind;
    label: string;
    detail: string;
    color: string;
    bgColor: string;
}

const COLORS = {
    completed: '#4ade80',
    scope: 'rgba(255,255,255,0.15)',
    projection: 'rgba(212,175,55,0.7)',
    projectionFill: 'rgba(212,175,55,0.08)',
    deadlineOnTrack: 'rgba(212,175,55,0.6)',
    deadlineBehind: 'rgba(239,68,68,0.7)',
    behind: '#ef4444',
    atRisk: 'rgba(212,175,55,0.8)',
    onTrack: '#4ade80',
    muted: 'rgba(255,255,255,0.35)',
};

function computeVelocityStats(weeklyCompletions: number[]) {
    const recent = weeklyCompletions.slice(-4);
    if (recent.length === 0) return { velocity: 0, stddev: 0 };

    const velocity = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance =
        recent.reduce((sum, v) => sum + (v - velocity) ** 2, 0) / recent.length;
    const stddev = Math.sqrt(variance);

    return { velocity, stddev };
}

export function BurndownPrediction({
    tasks,
    projectCreatedAt,
    deadline,
    projectColor: _projectColor,
    compact = false,
}: BurndownPredictionProps) {
    const { data, deadlineWeek, status } = useMemo(() => {
        const projectStart = startOfWeek(parseISO(projectCreatedAt), {
            weekStartsOn: 1,
        });
        const now = new Date();
        const totalWeeks = Math.max(differenceInWeeks(now, projectStart), 1);

        // Build historical data points
        const historicalData: WeekDataPoint[] = [];
        const weeklyCompletions: number[] = [];

        let prevCompleted = 0;
        for (let w = 0; w <= totalWeeks; w++) {
            const weekEnd = addWeeks(projectStart, w + 1);
            const total = tasks.filter((t) =>
                isBefore(parseISO(t.created_at), weekEnd)
            ).length;
            const completed = tasks.filter(
                (t) =>
                    t.status === 'Done' &&
                    t.completed_at &&
                    isBefore(parseISO(t.completed_at), weekEnd)
            ).length;

            if (w > 0) {
                weeklyCompletions.push(completed - prevCompleted);
            }
            prevCompleted = completed;

            historicalData.push({
                week: w,
                label: `W${w + 1}`,
                total,
                completed,
            });
        }

        const lastPoint = historicalData[historicalData.length - 1];
        const currentTotal = lastPoint.total;
        const currentCompleted = lastPoint.completed;
        const remaining = currentTotal - currentCompleted;

        // Velocity calculation
        const { velocity, stddev } = computeVelocityStats(weeklyCompletions);

        // Projection lines
        const projectionData: WeekDataPoint[] = [];

        if (velocity > 0 && remaining > 0) {
            const pessimisticVelocity = Math.max(velocity - stddev, 0.5);
            const optimisticVelocity = velocity + stddev;

            const projectedWeeks = Math.ceil(remaining / velocity);
            const pessimisticWeeks = Math.ceil(remaining / pessimisticVelocity);
            const maxProjectionWeeks = Math.max(pessimisticWeeks, projectedWeeks) + 2;

            // Start projection from the last historical point
            projectionData.push({
                week: totalWeeks,
                label: `W${totalWeeks + 1}`,
                total: currentTotal,
                completed: currentCompleted,
                projected: currentCompleted,
                optimistic: currentCompleted,
                pessimistic: currentCompleted,
            });

            for (let w = 1; w <= maxProjectionWeeks; w++) {
                const weekNum = totalWeeks + w;
                const proj = Math.min(
                    currentCompleted + velocity * w,
                    currentTotal
                );
                const opt = Math.min(
                    currentCompleted + optimisticVelocity * w,
                    currentTotal
                );
                const pess = Math.min(
                    currentCompleted + pessimisticVelocity * w,
                    currentTotal
                );

                projectionData.push({
                    week: weekNum,
                    label: `W${weekNum + 1}`,
                    total: currentTotal, // assume scope stays flat in projection
                    completed: currentCompleted, // historical completed stays flat
                    projected: proj,
                    optimistic: opt,
                    pessimistic: pess,
                });

                // Stop if pessimistic line reaches total
                if (pess >= currentTotal) break;
            }
        }

        // Merge historical + projection
        const allData: WeekDataPoint[] = [
            ...historicalData.map((d) => ({
                ...d,
                projected: undefined,
                optimistic: undefined,
                pessimistic: undefined,
            })),
            ...projectionData.slice(1), // skip first point (overlap with last historical)
        ];

        // Deadline week calculation
        let dlWeek: number | null = null;
        if (deadline) {
            const deadlineDate = parseISO(deadline);
            dlWeek = differenceInWeeks(deadlineDate, projectStart);
        }

        // Status calculation
        let statusInfo: StatusInfo;
        if (!deadline) {
            if (velocity > 0 && remaining > 0) {
                const projectedDate = addWeeks(now, remaining / velocity);
                statusInfo = {
                    kind: 'no-deadline',
                    label: 'No Deadline',
                    detail: `Est. ${format(projectedDate, 'MMM d')}`,
                    color: COLORS.muted,
                    bgColor: 'rgba(255,255,255,0.05)',
                };
            } else if (remaining === 0) {
                statusInfo = {
                    kind: 'on-track',
                    label: 'Complete',
                    detail: 'All tasks done',
                    color: COLORS.onTrack,
                    bgColor: 'rgba(74,222,128,0.1)',
                };
            } else {
                statusInfo = {
                    kind: 'no-deadline',
                    label: 'No Deadline',
                    detail: 'No velocity data',
                    color: COLORS.muted,
                    bgColor: 'rgba(255,255,255,0.05)',
                };
            }
        } else if (remaining === 0) {
            statusInfo = {
                kind: 'on-track',
                label: 'Complete',
                detail: 'All tasks done',
                color: COLORS.onTrack,
                bgColor: 'rgba(74,222,128,0.1)',
            };
        } else if (velocity <= 0) {
            statusInfo = {
                kind: 'behind',
                label: 'Behind',
                detail: 'No recent velocity',
                color: COLORS.behind,
                bgColor: 'rgba(239,68,68,0.1)',
            };
        } else {
            const projectedWeeksLeft = remaining / velocity;
            const projectedDate = addWeeks(now, projectedWeeksLeft);
            const deadlineDate = parseISO(deadline);
            const weeksUntilDeadline = differenceInWeeks(deadlineDate, now);
            const bufferWeeks = weeksUntilDeadline - projectedWeeksLeft;

            if (bufferWeeks < -0.5) {
                statusInfo = {
                    kind: 'behind',
                    label: 'Behind',
                    detail: `Est. ${format(projectedDate, 'MMM d')}`,
                    color: COLORS.behind,
                    bgColor: 'rgba(239,68,68,0.1)',
                };
            } else if (bufferWeeks < 1) {
                statusInfo = {
                    kind: 'at-risk',
                    label: 'At Risk',
                    detail: `Est. ${format(projectedDate, 'MMM d')}`,
                    color: COLORS.atRisk,
                    bgColor: 'rgba(212,175,55,0.1)',
                };
            } else {
                const weeksLeft = Math.ceil(projectedWeeksLeft);
                statusInfo = {
                    kind: 'on-track',
                    label: 'On Track',
                    detail:
                        weeksLeft <= 1
                            ? '~1 week left'
                            : `~${weeksLeft} weeks left`,
                    color: COLORS.onTrack,
                    bgColor: 'rgba(74,222,128,0.1)',
                };
            }
        }

        return {
            data: allData,
            deadlineWeek: dlWeek,
            status: statusInfo,
        };
    }, [tasks, projectCreatedAt, deadline]);

    const chartHeight = compact ? 100 : 180;
    const deadlineColor =
        status.kind === 'behind' ? COLORS.deadlineBehind : COLORS.deadlineOnTrack;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            {!compact && (
                <div className="flex items-center justify-between mb-1 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        Burndown Prediction
                    </span>
                </div>
            )}

            {/* Chart */}
            <div style={{ width: '100%', height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={data}
                        margin={
                            compact
                                ? { top: 4, right: 4, bottom: 0, left: 0 }
                                : { top: 8, right: 12, bottom: 4, left: -16 }
                        }
                    >
                        {!compact && (
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                tickLine={false}
                                interval="preserveStartEnd"
                            />
                        )}
                        {compact && <XAxis dataKey="label" hide />}

                        {!compact && (
                            <YAxis
                                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                                axisLine={false}
                                tickLine={false}
                                allowDecimals={false}
                            />
                        )}
                        {compact && <YAxis hide />}

                        {!compact && (
                            <Tooltip
                                contentStyle={{
                                    background: 'rgba(22,20,16,0.9)',
                                    border: '1px solid rgba(50,44,34,0.5)',
                                    borderRadius: 10,
                                    fontSize: 11,
                                    color: 'rgba(255,255,255,0.8)',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                }}
                                labelFormatter={(label: string) => label}
                                formatter={(
                                    value: number | undefined,
                                    name?: string
                                ) => {
                                    const labels: Record<string, string> = {
                                        completed: 'Completed',
                                        total: 'Total Scope',
                                        projected: 'Projected',
                                        optimistic: 'Optimistic',
                                        pessimistic: 'Pessimistic',
                                    };
                                    return [
                                        value != null ? Math.round(value) : '-',
                                        name ? (labels[name] || name) : '',
                                    ];
                                }}
                            />
                        )}

                        {!compact && (
                            <Legend
                                wrapperStyle={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}
                                iconSize={8}
                                formatter={(value: string) => {
                                    const labels: Record<string, string> = {
                                        completed: 'Completed',
                                        total: 'Scope',
                                        projected: 'Projection',
                                    };
                                    return labels[value] || value;
                                }}
                            />
                        )}

                        {/* Confidence band */}
                        <Area
                            dataKey="optimistic"
                            stroke="none"
                            fill={COLORS.projectionFill}
                            fillOpacity={1}
                            isAnimationActive={false}
                            legendType="none"
                            dot={false}
                            activeDot={false}
                        />
                        <Area
                            dataKey="pessimistic"
                            stroke="none"
                            fill="rgba(0,0,0,0)"
                            fillOpacity={1}
                            isAnimationActive={false}
                            legendType="none"
                            dot={false}
                            activeDot={false}
                        />

                        {/* Scope line (dashed, muted) */}
                        <Line
                            dataKey="total"
                            stroke={COLORS.scope}
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            dot={false}
                            activeDot={false}
                            isAnimationActive={false}
                            legendType="none"
                            connectNulls={false}
                        />

                        {/* Completed line (solid, green) */}
                        <Line
                            dataKey="completed"
                            stroke={COLORS.completed}
                            strokeWidth={2}
                            dot={false}
                            activeDot={!compact ? { r: 3, fill: COLORS.completed } : false}
                            isAnimationActive={false}
                            legendType="none"
                        />

                        {/* Projection line (dashed, gold) */}
                        <Line
                            dataKey="projected"
                            stroke={COLORS.projection}
                            strokeWidth={1.5}
                            strokeDasharray="6 3"
                            dot={false}
                            activeDot={!compact ? { r: 3, fill: COLORS.projection } : false}
                            isAnimationActive={false}
                            legendType="none"
                            connectNulls={false}
                        />

                        {/* Deadline reference line */}
                        {deadlineWeek !== null && (
                            <ReferenceLine
                                x={`W${deadlineWeek + 1}`}
                                stroke={deadlineColor}
                                strokeDasharray="4 3"
                                strokeWidth={1.5}
                                label={
                                    !compact
                                        ? {
                                              value: 'Deadline',
                                              position: 'top',
                                              fill: deadlineColor,
                                              fontSize: 9,
                                          }
                                        : undefined
                                }
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Status badge */}
            <div
                className="flex items-center justify-between mt-1.5 px-2 py-1 rounded-md shrink-0"
                style={{ background: status.bgColor }}
            >
                <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: status.color }}
                >
                    {status.label}
                </span>
                <span
                    className="text-[10px] font-mono"
                    style={{ color: status.color, opacity: 0.8 }}
                >
                    {status.detail}
                </span>
            </div>
        </div>
    );
}
