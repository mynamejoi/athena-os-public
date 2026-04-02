'use client';

import React, { useMemo } from 'react';
import { T } from '@/components/productivity/analytics/SharedUI';
import { cn } from '@/lib/utils';

interface HeatmapCell {
    recoveryBucket: string;
    strainBucket: string;
    avgPerformance: number;
    count: number;
}

interface RecoveryTrainingHeatmapProps {
    data: HeatmapCell[];
    height?: number;
}

const RECOVERY_BUCKETS = ['67-100%', '34-66%', '0-33%'];
const STRAIN_BUCKETS = ['Low (0-7)', 'Medium (7-14)', 'High (14-21)'];

function interpolateColor(value: number): string {
    // value 0-100: red (low) -> yellow (mid) -> green (high)
    const clamped = Math.max(0, Math.min(100, value));
    const ratio = clamped / 100;

    let r: number, g: number, b: number;

    if (ratio < 0.5) {
        // red to yellow
        const t = ratio * 2;
        r = 196;
        g = Math.round(80 + t * 112); // 80 -> 192
        b = Math.round(64 * (1 - t));  // 64 -> 0
    } else {
        // yellow to green
        const t = (ratio - 0.5) * 2;
        r = Math.round(196 * (1 - t)); // 196 -> 0
        g = Math.round(192 - t * 3);   // 192 -> 189
        b = Math.round(t * 107);        // 0 -> 107
    }

    return `rgb(${r}, ${g}, ${b})`;
}

export function RecoveryTrainingHeatmap({ data, height = 200 }: RecoveryTrainingHeatmapProps) {
    const cellMap = useMemo(() => {
        const map: Record<string, HeatmapCell> = {};
        for (const cell of data) {
            map[`${cell.recoveryBucket}|${cell.strainBucket}`] = cell;
        }
        return map;
    }, [data]);

    if (!data.length) return null;

    return (
        <div className={cn('w-full')} style={{ height, fontFamily: 'var(--font-manrope), sans-serif' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gridTemplateRows: '1fr auto', height: '100%', gap: 0 }}>
                {/* Y-axis label + grid area */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', paddingRight: 6 }}>
                    {RECOVERY_BUCKETS.map((bucket) => (
                        <div key={bucket} style={{
                            fontSize: 9,
                            color: T.textMuted,
                            textAlign: 'right',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            height: '100%',
                        }}>
                            {bucket}
                        </div>
                    ))}
                </div>

                {/* Grid cells */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gridTemplateRows: 'repeat(3, 1fr)',
                    gap: 3,
                }}>
                    {RECOVERY_BUCKETS.map((recovery) =>
                        STRAIN_BUCKETS.map((strain) => {
                            const cell = cellMap[`${recovery}|${strain}`];
                            const perf = cell?.avgPerformance ?? 0;
                            const count = cell?.count ?? 0;
                            const bgColor = count > 0 ? interpolateColor(perf) : T.border;
                            const textColor = perf > 60 ? '#1a1a1a' : '#ede8df';

                            return (
                                <div
                                    key={`${recovery}|${strain}`}
                                    className={cn('flex flex-col items-center justify-center rounded-md transition-colors')}
                                    style={{
                                        backgroundColor: count > 0 ? bgColor : 'transparent',
                                        border: `1px solid ${T.border}`,
                                        opacity: count > 0 ? 0.85 : 0.3,
                                        minHeight: 0,
                                    }}
                                >
                                    {count > 0 ? (
                                        <>
                                            <span className="font-serif" style={{ fontSize: 13, fontWeight: 600, color: textColor, lineHeight: 1.2 }}>
                                                {Math.round(perf)}%
                                            </span>
                                            <span className="font-serif" style={{ fontSize: 8, color: textColor, opacity: 0.7, lineHeight: 1.2 }}>
                                                {count}d
                                            </span>
                                        </>
                                    ) : (
                                        <span style={{ fontSize: 9, color: T.textDim }}>—</span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Empty bottom-left corner */}
                <div />

                {/* X-axis labels */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 3,
                    paddingTop: 4,
                }}>
                    {STRAIN_BUCKETS.map((bucket) => (
                        <div key={bucket} style={{
                            fontSize: 9,
                            color: T.textMuted,
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                        }}>
                            {bucket}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
