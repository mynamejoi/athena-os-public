'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { DataMaturityProvider, DataGate } from '@/components/productivity/DataGate';

interface WeeklyReportPanelProps {
    weekStart: string; // YYYY-MM-DD
}

const sectionFade = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } }
};

export default function WeeklyReportPanel({ weekStart }: WeeklyReportPanelProps) {
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
    }, [weekStart, whoopEnabled]);

    // Fetch the weekly report that covers the week BEFORE the one being viewed
    const fetchReport = async () => {
        try {
            // The weekly report reviews the prior week (Sun-Sat), so for weekStart=2026-03-30
            // the report has period_start=2026-03-23 (the previous Sunday)
            const viewDate = new Date(weekStart + 'T12:00:00');
            const prevSunday = new Date(viewDate);
            prevSunday.setDate(viewDate.getDate() - 7);
            const periodStart = prevSunday.toLocaleDateString('en-CA');

            const previewParam = !whoopEnabled ? '&preview=true' : '';
            const res = await fetch(`/api/reports?cadence=weekly&start=${periodStart}&end=${periodStart}&limit=1${previewParam}`);
            if (res.ok) {
                const data = await res.json();
                if (data.reports?.length > 0 && data.reports[0].status === 'completed') {
                    setReport(data.reports[0]);
                }
            }
        } catch (err) {
            console.error('Failed to fetch weekly report', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setReport(null);
        setIsLoading(true);
        fetchReport();
    }, [weekStart, whoopEnabled]);

    // Generate report (reviews the prior week based on the weekStart being viewed)
    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cadence: 'weekly', date: weekStart }),
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
    const health: string[] = r.health || [];
    const habits: string[] = r.habits || [];
    const training: string[] = r.training || [];
    const coachRecap: string | null = r.coachRecap || r.coach_recap || null;
    const projects: string[] = r.projects || [];
    const insights: string[] = r.insights || r.topInsights || [];
    const thisWeekSplit: string | null = r.thisWeekSplit || null;
    const thisWeek: string[] = r.thisWeek || r.recommendations || [];
    const isCompleted = report?.status === 'completed';

    if (isLoading) {
        return (
            <motion.section variants={sectionFade} initial="hidden" animate="visible">
                <div className="rounded-xl border border-athena-border bg-white/[0.02] px-4 md:px-6 py-4 md:py-5">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-athena-gold/30 border-t-athena-gold rounded-full animate-spin" />
                        <span className="text-xs text-athena-text-muted">Loading weekly report...</span>
                    </div>
                </div>
            </motion.section>
        );
    }

    return (
        <DataMaturityProvider>
        <DataGate feature="weeklyBriefing">
        <motion.section variants={sectionFade} initial="hidden" animate="visible" transition={{ delay: 0.4 }}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 mb-3 group w-full text-left min-h-[44px]"
            >
                <Sparkles className="w-4 h-4 text-athena-gold" />
                <h2 className="text-lg font-serif text-athena-gold">Weekly Briefing</h2>
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
                                            {isGenerating ? 'Generating your weekly briefing...' : (whoopEnabled ? 'Sleep data synced. Ready to generate your briefing.' : 'Ready to generate your briefing.')}
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
                                            ) : 'Generate Weekly Briefing'}
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

                                {/* COACH RECAP */}
                                {coachRecap && (
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Coach Recap</h3>
                                        <p className="text-sm text-athena-text-primary leading-relaxed">{coachRecap}</p>
                                    </div>
                                )}

                                {/* PROJECTS */}
                                {projects.length > 0 && (
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Projects</h3>
                                        <ul className="space-y-1.5">
                                            {projects.map((item: string, i: number) => (
                                                <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                    <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* INSIGHTS */}
                                {insights.length > 0 && (
                                    <div className="border-l-2 border-athena-gold/40 pl-4">
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Insights</h3>
                                        <ul className="space-y-1.5">
                                            {insights.map((item: string, i: number) => (
                                                <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                    <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* NEXT WEEK */}
                                {thisWeekSplit && (
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-1">Training Split</h3>
                                        <p className="text-sm text-athena-text-warm leading-relaxed">{thisWeekSplit}</p>
                                    </div>
                                )}

                                {thisWeek.length > 0 && (
                                    <div className="border-l-2 border-purple-400/40 pl-4">
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">This Week</h3>
                                        <ul className="space-y-1.5">
                                            {thisWeek.map((item: string, i: number) => (
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
