'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { DataMaturityProvider, DataGate } from '@/components/productivity/DataGate';

interface MonthlyReportPanelProps {
    month: string; // YYYY-MM
}

const sectionFade = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } }
};

export default function MonthlyReportPanel({ month }: MonthlyReportPanelProps) {
    const [report, setReport] = useState<any>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [sleepSynced, setSleepSynced] = useState(false);
    const { whoopEnabled } = useWhoopMode();

    // Check if today's sleep data has synced
    // When WHOOP is disabled, skip the sleep check entirely
    useEffect(() => {
        if (!whoopEnabled) {
            setSleepSynced(true);
            return;
        }
        const check = async () => {
            try {
                const { createClient } = await import('@/utils/supabase/client');
                const supabase = createClient();
                const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                const { data } = await supabase.from('whoop_data').select('sleep_hours').eq('date', today).not('sleep_hours', 'is', null).limit(1);
                setSleepSynced(!!data && data.length > 0 && data[0].sleep_hours > 0);
            } catch { setSleepSynced(false); }
        };
        check();
    }, [month, whoopEnabled]);

    // Fetch the monthly report that covers the month BEFORE the one being viewed
    const fetchReport = async () => {
        try {
            // The monthly report reviews the prior month, so for month=2026-04 the report has period_start=2026-03-01
            const viewDate = new Date(month + '-15T12:00:00');
            const priorMonthStart = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
            const periodStart = priorMonthStart.toLocaleDateString('en-CA');

            const previewParam = !whoopEnabled ? '&preview=true' : '';
            const res = await fetch(`/api/reports?cadence=monthly&start=${periodStart}&end=${periodStart}&limit=1${previewParam}`);
            if (res.ok) {
                const data = await res.json();
                if (data.reports?.length > 0 && data.reports[0].status === 'completed') {
                    setReport(data.reports[0]);
                }
            }
        } catch (err) {
            console.error('Failed to fetch monthly report', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setReport(null);
        setIsLoading(true);
        fetchReport();
    }, [month, whoopEnabled]);

    // Generate report (reviews the prior month based on the month being viewed)
    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cadence: 'monthly', date: month + '-15' }),
            });
            if (res.ok) {
                await fetchReport();
            }
        } catch (err) {
            console.error('Failed to generate report', err);
        } finally {
            setIsGenerating(false);
        }
    };

    // Extract fields from the report JSON
    const r = report?.report || {};
    const headline = r.headline;
    const narrative = r.narrative;
    const health: string[] = r.health || [];
    const habits: string[] = r.habits || [];
    const training: string[] = r.training || [];
    const trainingProgression: string[] | null = r.trainingProgression || r.training_progression || null;
    const goals: Array<{goal: string; progress: string; note?: string; status: string}> = r.goals || r.goalProgress || [];
    const patterns: string[] = r.patterns || r.correlations || [];
    const bestDay: { date: string; note: string } | null = r.bestDay || null;
    const worstDay: { date: string; note: string } | null = r.worstDay || null;
    const thisMonth: string[] = r.thisMonth || r.recommendations || [];
    const isCompleted = report?.status === 'completed';

    if (isLoading) {
        return (
            <motion.section variants={sectionFade} initial="hidden" animate="visible">
                <div className="rounded-xl border border-athena-border bg-white/[0.02] px-4 md:px-6 py-4 md:py-5">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-athena-gold/30 border-t-athena-gold rounded-full animate-spin" />
                        <span className="text-xs text-athena-text-muted">Loading monthly report...</span>
                    </div>
                </div>
            </motion.section>
        );
    }

    return (
        <DataMaturityProvider>
        <DataGate feature="monthlyBriefing">
        <motion.section variants={sectionFade} initial="hidden" animate="visible" transition={{ delay: 0.4 }}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 mb-3 group w-full text-left min-h-[44px]"
            >
                <Sparkles className="w-4 h-4 text-athena-gold" />
                <h2 className="text-lg font-serif text-athena-gold">Monthly Briefing</h2>
                {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-athena-text-muted ml-auto group-hover:text-athena-gold transition-colors" />
                    : <ChevronDown className="w-4 h-4 text-athena-text-muted ml-auto group-hover:text-athena-gold transition-colors" />
                }
            </button>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        {/* No report */}
                        {!isCompleted && (
                            <div className="rounded-xl border border-athena-border bg-white/[0.02] px-4 md:px-6 py-4 md:py-5 text-center space-y-3">
                                {!sleepSynced && whoopEnabled ? (
                                    <p className="text-sm text-athena-text-muted/60">Waiting for sleep data to sync...</p>
                                ) : (
                                    <>
                                        <p className="text-sm text-athena-text-muted">
                                            {isGenerating ? 'Generating your monthly briefing...' : (whoopEnabled ? 'Sleep data synced. Ready to generate your briefing.' : 'Ready to generate your briefing.')}
                                        </p>
                                        <button
                                            onClick={handleGenerate}
                                            disabled={isGenerating}
                                            className="px-4 min-h-[44px] rounded-lg bg-athena-gold/20 text-athena-gold text-xs font-sans font-semibold hover:bg-athena-gold/30 border border-athena-gold/30 transition-all disabled:opacity-50 disabled:cursor-wait"
                                        >
                                            {isGenerating ? (
                                                <span className="flex items-center gap-2">
                                                    <div className="w-3 h-3 border-2 border-athena-gold/30 border-t-athena-gold rounded-full animate-spin" />
                                                    Generating...
                                                </span>
                                            ) : 'Generate Monthly Briefing'}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Completed report */}
                        {isCompleted && (
                            <div className="rounded-xl border border-athena-border bg-white/[0.02] px-4 md:px-6 py-4 md:py-5 space-y-3 md:space-y-4">
                                {/* Headline */}
                                {headline && (
                                    <p className="text-[15px] font-serif italic text-athena-gold leading-relaxed">{headline}</p>
                                )}

                                {/* Narrative */}
                                {narrative && (
                                    <p className="text-sm font-serif text-athena-text-warm leading-relaxed">{narrative}</p>
                                )}

                                {/* Two-column: HEALTH + HABITS */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                    {health.length > 0 && (
                                        <div>
                                            <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Health</h3>
                                            <ul className="space-y-1.5">
                                                {health.map((item: string, i: number) => (
                                                    <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                        <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {habits.length > 0 && (
                                        <div>
                                            <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Habits</h3>
                                            <ul className="space-y-1.5">
                                                {habits.map((item: string, i: number) => (
                                                    <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                        <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                {/* TRAINING */}
                                {training.length > 0 && (
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Training</h3>
                                        <ul className="space-y-1.5">
                                            {training.map((item: string, i: number) => (
                                                <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                    <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* STRENGTH PROGRESSION */}
                                {trainingProgression && trainingProgression.length > 0 && (
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Strength Progression</h3>
                                        <ul className="space-y-1.5">
                                            {trainingProgression.map((item: string, i: number) => (
                                                <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                    <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* GOALS */}
                                {goals.length > 0 && (
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Goals</h3>
                                        <ul className="space-y-2">
                                            {goals.map((g, i: number) => (
                                                <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                    <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                    <span>
                                                        <span className="text-athena-gold font-medium">{g.goal}</span>
                                                        {g.progress && <span className="text-athena-text-muted ml-1.5">{g.progress}</span>}
                                                        {g.note && <span> — {g.note}</span>}
                                                        {g.status && (
                                                            <span className={`ml-2 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                                                                g.status === 'on-track' || g.status === 'ahead'
                                                                    ? 'text-emerald-400 bg-emerald-400/10'
                                                                    : g.status === 'completed'
                                                                    ? 'text-athena-gold bg-athena-gold/10'
                                                                    : g.status === 'behind'
                                                                    ? 'text-red-400 bg-red-400/10'
                                                                    : 'text-athena-text-muted bg-white/5'
                                                            }`}>
                                                                {g.status}
                                                            </span>
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* BEST / WORST DAYS */}
                                {(bestDay || worstDay) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {bestDay && (
                                            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2.5">
                                                <h3 className="text-[9px] uppercase tracking-[0.25em] text-emerald-400 font-bold mb-1">Best Day</h3>
                                                <p className="text-xs text-athena-text-muted mb-0.5">{bestDay.date}</p>
                                                <p className="text-sm text-athena-text-primary leading-relaxed">{bestDay.note}</p>
                                            </div>
                                        )}
                                        {worstDay && (
                                            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2.5">
                                                <h3 className="text-[9px] uppercase tracking-[0.25em] text-red-400 font-bold mb-1">Worst Day</h3>
                                                <p className="text-xs text-athena-text-muted mb-0.5">{worstDay.date}</p>
                                                <p className="text-sm text-athena-text-primary leading-relaxed">{worstDay.note}</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* PATTERNS */}
                                {patterns.length > 0 && (
                                    <div className="border-l-2 border-athena-gold/40 pl-4">
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Patterns</h3>
                                        <ul className="space-y-1.5">
                                            {patterns.map((item: string, i: number) => (
                                                <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                    <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* NEXT MONTH */}
                                {thisMonth.length > 0 && (
                                    <div className="border-l-2 border-purple-400/40 pl-4">
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">This Month</h3>
                                        <ul className="space-y-1.5">
                                            {thisMonth.map((item: string, i: number) => (
                                                <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                    <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {!whoopEnabled && (
                                    <p className="text-[10px] text-athena-text-muted/40 text-center pt-1">
                                        Connect WHOOP for recovery-aware insights
                                    </p>
                                )}

                                {/* Footer */}
                                <div className="text-center pt-1">
                                    <span className="text-[9px] text-athena-text-muted/30">
                                        {report.created_at ? format(new Date(report.created_at), 'h:mm a') : ''}
                                        {report.model ? ` · ${report.model}` : ''}
                                    </span>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.section>
        </DataGate>
        </DataMaturityProvider>
    );
}
