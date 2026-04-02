'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { T } from './SharedUI';
import { useThemeColor } from '@/components/providers/ThemeColorProvider';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
    ArrowUp, ArrowDown, RefreshCw, Lightbulb, TrendingUp, TrendingDown, AlertTriangle,
    Check, Footprints, Brain, Book, Moon, Zap, Snowflake, Thermometer, Droplet,
    Pen, Clock, Dumbbell, Puzzle,
    type LucideIcon,
} from 'lucide-react';
import type { HabitInsight, CorrelationResult } from '@/lib/habit-correlations';

const ICON_MAP: Record<string, LucideIcon> = {
    check: Check, footprints: Footprints, brain: Brain, book: Book,
    moon: Moon, zap: Zap, snowflake: Snowflake, thermometer: Thermometer,
    droplet: Droplet, pen: Pen, clock: Clock, dumbbell: Dumbbell, puzzle: Puzzle,
};

function HabitIcon({ name, className = '' }: { name: string; className?: string }) {
    const Icon = ICON_MAP[name.toLowerCase()];
    if (Icon) return <Icon size={14} className={className} />;
    return <span className={`text-xs ${className}`}>{name}</span>;
}

interface AiHabitRec {
    title: string;
    reason: string;
    icon?: string;
}

interface HabitInsightsResponse {
    correlations: CorrelationResult;
    aiRecommendations?: {
        topHabits?: AiHabitRec[];
        frequencyChanges?: Array<{ title: string; current: string; recommended: string; reason: string }>;
        surprisingInsights?: string[];
        surprisingInsight?: string;
        dropCandidates?: AiHabitRec[];
    };
    cached?: boolean;
}

function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse bg-white/5 rounded-xl ${className}`} />;
}

function ImpactTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div style={{
            background: T.surfaceEl,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: '10px 14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontFamily: 'var(--font-manrope), sans-serif',
        }}>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <HabitIcon name={d.icon} /> {d.title}
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                Avg score when done: <span style={{ color: T.green, fontWeight: 600 }}>{d.avgCompleted}%</span>
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                Avg score when skipped: <span style={{ color: T.red, fontWeight: 600 }}>{d.avgSkipped}%</span>
            </div>
        </div>
    );
}

function FrequencyCard({ insight }: { insight: HabitInsight }) {
    const currentDays = insight.currentFrequency?.length ?? 7;
    const optimalDays = insight.optimalDaysPerWeek;
    if (optimalDays === null || optimalDays === currentDays) return null;

    const isIncrease = optimalDays > currentDays;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/[0.02] border border-athena-border rounded-xl p-4"
        >
            <div className="flex items-center gap-2 mb-2">
                <HabitIcon name={insight.habitIcon} className="text-athena-text-muted" />
                <span className="text-sm font-serif text-athena-text-primary">{insight.habitTitle}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
                <span className="text-athena-text-muted">{currentDays}x/week</span>
                {isIncrease
                    ? <ArrowUp size={14} className="text-green-400" />
                    : <ArrowDown size={14} className="text-red-400" />}
                <span style={{ color: T.gold }} className="font-semibold">{optimalDays}x/week</span>
            </div>
            <p className="text-[10px] text-athena-text-muted mt-2">
                {isIncrease
                    ? `Data suggests increasing to ${optimalDays} days/week for higher day scores.`
                    : `Data suggests reducing to ${optimalDays} days/week may yield better outcomes.`}
            </p>
        </motion.div>
    );
}

function InsightCard({ icon, title, items, iconLookup }: { icon: React.ReactNode; title: string; items: AiHabitRec[]; iconLookup?: Map<string, string> }) {
    if (!items || items.length === 0) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/[0.02] border border-athena-border rounded-xl p-4"
            style={{ borderLeft: `3px solid ${T.gold}` }}
        >
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-xs font-semibold uppercase tracking-widest text-athena-text-muted">{title}</span>
            </div>
            <ul className="space-y-2">
                {items.map((item, i) => {
                    const habitIcon = iconLookup?.get(item.title.toLowerCase());
                    return (
                        <li key={i} className="text-xs text-athena-text-primary leading-relaxed">
                            <span className="font-semibold inline-flex items-center gap-1.5">
                                {habitIcon && <HabitIcon name={habitIcon} className="text-athena-text-muted" />}
                                {item.title}
                            </span>
                            {item.reason && (
                                <span className="block text-[10px] text-athena-text-muted mt-0.5">{item.reason}</span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </motion.div>
    );
}

// ── Client-side cache ──
const clientCache = new Map<string, HabitInsightsResponse>();

interface HabitInsightsProps {
    startDate: string;
    endDate: string;
}

export function HabitInsightsSection({ startDate, endDate }: HabitInsightsProps) {
    const { accent } = useThemeColor();
    const cacheKey = `${startDate}_${endDate}`;
    const [data, setData] = useState<HabitInsightsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track which request is current so stale responses are discarded
    const requestIdRef = useRef(0);

    const fetchInsights = useCallback(async (key: string, start: string, end: string, forceRefresh: boolean) => {
        const myRequestId = ++requestIdRef.current;

        try {
            const params = new URLSearchParams({ start, end });
            if (forceRefresh) params.set('refresh', 'true');
            const res = await fetch(`/api/productivity/habit-insights?${params}`);
            if (!res.ok) {
                const text = await res.text();
                // Guard against HTML error pages (e.g. auth redirect)
                if (text.startsWith('<!')) throw new Error('Not enough data for habit insights yet');
                throw new Error(text || 'Failed to fetch habit insights');
            }
            const json: HabitInsightsResponse = await res.json();

            // Only apply if this is still the latest request
            if (myRequestId !== requestIdRef.current) return;

            clientCache.set(key, json);
            setData(json);
            setError(null);
        } catch (e: any) {
            if (myRequestId !== requestIdRef.current) return;
            setError(e.message || 'Something went wrong');
        } finally {
            if (myRequestId !== requestIdRef.current) return;
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // When date range changes, serve cache or fetch
    useEffect(() => {
        const cached = clientCache.get(cacheKey);
        if (cached) {
            setData(cached);
            setLoading(false);
            setError(null);
        } else {
            setData(null);
            setLoading(true);
            setError(null);
            fetchInsights(cacheKey, startDate, endDate, false);
        }
    }, [cacheKey, startDate, endDate, fetchInsights]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchInsights(cacheKey, startDate, endDate, true);
    };

    // ── Loading State ──
    if (loading) {
        return (
            <section>
                <h2 className="text-lg font-serif text-athena-gold mb-3">Habit Insights</h2>
                <div className="space-y-4">
                    <Skeleton className="h-[260px]" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Skeleton className="h-[120px]" />
                        <Skeleton className="h-[120px]" />
                    </div>
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section>
                <h2 className="text-lg font-serif text-athena-gold mb-3">Habit Insights</h2>
                <div className="bg-white/[0.02] border border-athena-border rounded-xl p-6 text-center">
                    <p className="text-sm text-red-400 mb-3">{error}</p>
                    <button
                        onClick={handleRefresh}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs border border-athena-border rounded-full hover:bg-athena-gold/10 hover:border-athena-gold/50 text-athena-text-muted hover:text-athena-gold transition-all"
                    >
                        <RefreshCw size={12} /> Retry
                    </button>
                </div>
            </section>
        );
    }

    if (!data) return null;

    const { correlations, aiRecommendations } = data;
    const { insights, dataQuality } = correlations;

    if (dataQuality === 'insufficient') {
        return (
            <section>
                <h2 className="text-lg font-serif text-athena-gold mb-3">Habit Insights</h2>
                <div className="bg-white/[0.02] border border-athena-border rounded-xl p-6 text-center">
                    <AlertTriangle size={20} className="mx-auto mb-2 text-athena-gold" />
                    <p className="text-sm text-athena-text-muted">
                        Need at least 2 weeks of data to generate insights. Keep tracking!
                    </p>
                </div>
            </section>
        );
    }

    const impactData = insights
        .filter(h => h.sampleSize >= 5)
        .slice(0, 12)
        .map(h => ({
            title: h.habitTitle,
            icon: h.habitIcon,
            impact: Math.round(h.impactScore * 10) / 10,
            avgCompleted: h.avgScoreCompleted !== null ? Math.round(h.avgScoreCompleted) : '—',
            avgSkipped: h.avgScoreSkipped !== null ? Math.round(h.avgScoreSkipped) : '—',
        }));

    const habitIconLookup = new Map(insights.map(h => [h.habitTitle.toLowerCase(), h.habitIcon]));

    const freqRecommendations = insights.filter(h => {
        const current = h.currentFrequency?.length ?? 7;
        return h.optimalDaysPerWeek !== null && h.optimalDaysPerWeek !== current;
    });

    return (
        <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
        >
            <h2 className="text-lg font-serif text-athena-gold mb-3">Habit Insights</h2>

            {dataQuality === 'limited' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-athena-gold/5 border border-athena-gold/15 rounded-lg px-4 py-2 mb-4 text-[10px] text-athena-text-muted"
                >
                    Limited data — insights will improve with more tracking history.
                </motion.div>
            )}

            <div className="space-y-6">
                {impactData.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <div className="bg-white/[0.02] border border-athena-border rounded-xl p-4">
                            <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">
                                Habit Impact Rankings
                            </div>
                            <ResponsiveContainer width="100%" height={impactData.length * 36 + 20}>
                                <BarChart
                                    data={impactData}
                                    layout="vertical"
                                    margin={{ top: 4, right: 20, bottom: 4, left: 8 }}
                                >
                                    <XAxis
                                        type="number"
                                        tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="title"
                                        tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={100}
                                        tickFormatter={(value: string) => value.length > 14 ? value.slice(0, 14) + '...' : value}
                                    />
                                    <Tooltip content={<ImpactTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                    <Bar dataKey="impact" radius={[0, 4, 4, 0]} barSize={16}>
                                        {impactData.map((entry, i) => (
                                            <Cell
                                                key={i}
                                                fill={entry.impact >= 0 ? accent.DEFAULT : '#c45040'}
                                                fillOpacity={0.8}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                )}

                {freqRecommendations.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">
                            Frequency Recommendations
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {freqRecommendations.slice(0, 4).map(h => (
                                <FrequencyCard key={h.habitId} insight={h} />
                            ))}
                        </div>
                    </motion.div>
                )}

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[9px] uppercase tracking-widest text-athena-text-muted font-semibold">
                            AI Analysis
                            {data?.cached && (
                                <span className="ml-2 text-athena-text-muted/50 normal-case tracking-normal">(cached)</span>
                            )}
                        </div>
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] border border-athena-border rounded-full hover:bg-athena-gold/10 hover:border-athena-gold/50 text-athena-text-muted hover:text-athena-gold transition-all disabled:opacity-50"
                        >
                            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>
                    {aiRecommendations ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <InsightCard
                                icon={<TrendingUp size={14} style={{ color: T.green }} />}
                                title="Prioritize"
                                items={aiRecommendations.topHabits || []}
                                iconLookup={habitIconLookup}
                            />
                            <InsightCard
                                icon={<Lightbulb size={14} style={{ color: T.gold }} />}
                                title="Surprising Insights"
                                items={
                                    aiRecommendations.surprisingInsights
                                        ? aiRecommendations.surprisingInsights.map(s => ({ title: s, reason: '' }))
                                        : aiRecommendations.surprisingInsight
                                            ? [{ title: aiRecommendations.surprisingInsight, reason: '' }]
                                            : []
                                }
                            />
                            <InsightCard
                                icon={<TrendingDown size={14} style={{ color: T.red }} />}
                                title="Drop Candidates"
                                items={aiRecommendations.dropCandidates || []}
                                iconLookup={habitIconLookup}
                            />
                        </div>
                    ) : (
                        <p className="text-[10px] text-athena-text-muted">No AI analysis yet. Hit Refresh to generate, or it will auto-generate on the next weekly sync.</p>
                    )}
                </motion.div>
            </div>
        </motion.section>
    );
}
