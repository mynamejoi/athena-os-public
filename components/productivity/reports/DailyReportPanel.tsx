'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { DataMaturityProvider, DataGate } from '@/components/productivity/DataGate';

const sectionFade = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } }
};

export default function DailyReportPanel() {
    const [report, setReport] = useState<any>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [sleepSynced, setSleepSynced] = useState(false);
    const [hasYesterdayData, setHasYesterdayData] = useState<boolean | null>(null);
    const { whoopEnabled } = useWhoopMode();

    // Check if today's WHOOP sleep data has synced (indicates day has started)
    // When WHOOP is disabled, skip the sleep check entirely
    const checkSleepSync = async () => {
        if (!whoopEnabled) return true;
        try {
            const { createClient } = await import('@/utils/supabase/client');
            const supabase = createClient();
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            const { data } = await supabase
                .from('whoop_data')
                .select('sleep_hours')
                .eq('date', today)
                .not('sleep_hours', 'is', null)
                .limit(1);
            return !!data && data.length > 0 && data[0].sleep_hours > 0;
        } catch { return false; }
    };

    // Check if yesterday has any meaningful data (habits or journal)
    const checkYesterdayData = async () => {
        try {
            const { createClient } = await import('@/utils/supabase/client');
            const supabase = createClient();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

            const [taskResult, journalResult] = await Promise.all([
                supabase
                    .from('daily_tasks')
                    .select('*', { count: 'exact', head: true })
                    .eq('date', yesterdayStr)
                    .eq('status', 'Completed'),
                supabase
                    .from('daily_summaries')
                    .select('journal_entry, win_of_the_day')
                    .eq('date', yesterdayStr)
                    .maybeSingle(),
            ]);

            const hasTasks = (taskResult.count || 0) > 0;
            const hasJournal = !!journalResult.data?.journal_entry || !!journalResult.data?.win_of_the_day;
            return hasTasks || hasJournal;
        } catch { return false; }
    };

    // Fetch report only if it belongs to the current period (yesterday's date)
    const fetchReport = async () => {
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            const previewParam = !whoopEnabled ? '&preview=true' : '';
            const res = await fetch(`/api/reports?cadence=daily&start=${yesterdayStr}&limit=1${previewParam}`);
            if (res.ok) {
                const data = await res.json();
                if (data.reports?.length > 0 && data.reports[0].status === 'completed') {
                    return data.reports[0];
                }
            }
        } catch (err) {
            console.error('Failed to fetch daily report', err);
        }
        return null;
    };

    useEffect(() => {
        setReport(null);
        setIsLoading(true);
        const load = async () => {
            const [hasSleep, hasData] = await Promise.all([
                checkSleepSync(),
                checkYesterdayData(),
            ]);
            setSleepSynced(hasSleep);
            setHasYesterdayData(hasData);

            if (hasSleep && hasData) {
                const r = await fetchReport();
                if (r) setReport(r);
            }
            setIsLoading(false);
        };
        load();

        // Poll every 30s — check for sleep sync and report
        const interval = setInterval(async () => {
            if (report) return;
            const [hasSleep, hasData] = await Promise.all([
                checkSleepSync(),
                checkYesterdayData(),
            ]);
            setSleepSynced(hasSleep);
            setHasYesterdayData(hasData);
            if (hasSleep && hasData) {
                const r = await fetchReport();
                if (r) setReport(r);
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [whoopEnabled]);

    // Generate report
    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cadence: 'daily' }),
            });
            if (res.ok) {
                const data = await res.json();
                // Re-fetch the latest daily report
                const previewParam = !whoopEnabled ? '&preview=true' : '';
                const refetch = await fetch(`/api/reports?cadence=daily&limit=1${previewParam}`);
                if (refetch.ok) {
                    const refetchData = await refetch.json();
                    if (refetchData.reports?.length > 0) {
                        setReport(refetchData.reports[0]);
                    }
                }
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
    const readiness = r.readiness;
    const habitNote = r.habitNote || r.habit_note;
    const trainingRec = r.trainingRec || r.training_rec;
    const reading: string | null = r.reading || null;
    const projectTasks: string[] = r.projectTasks || r.project_tasks || [];
    const focusItems: string[] = r.focusItems || r.focus_items || [];
    const insight = r.insight || r.crossDomainInsight || r.cross_domain_insight;
    const isCompleted = report?.status === 'completed';

    if (isLoading) {
        return (
            <motion.section variants={sectionFade} initial="hidden" animate="visible">
                <div className="rounded-xl border border-athena-border bg-white/[0.02] px-4 md:px-6 py-4 md:py-5">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-athena-gold/30 border-t-athena-gold rounded-full animate-spin" />
                        <span className="text-xs text-athena-text-muted">Loading daily report...</span>
                    </div>
                </div>
            </motion.section>
        );
    }

    return (
        <DataMaturityProvider>
        <DataGate feature="morningBriefing">
        <motion.section variants={sectionFade} initial="hidden" animate="visible" transition={{ delay: 0.4 }}>
            <div className="flex items-center gap-2 mb-3 min-h-[44px]">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 group flex-1 text-left"
                >
                    <Sparkles className="w-4 h-4 text-athena-gold" />
                    <h2 className="text-lg font-serif text-athena-gold">Morning Briefing</h2>
                </button>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center group"
                >
                    {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-athena-text-muted group-hover:text-athena-gold transition-colors" />
                        : <ChevronDown className="w-4 h-4 text-athena-text-muted group-hover:text-athena-gold transition-colors" />
                    }
                </button>
            </div>

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
                                ) : hasYesterdayData === false ? (
                                    <p className="text-sm text-athena-text-muted/60">Complete today's habits and check back tomorrow for your first Morning Briefing.</p>
                                ) : (
                                    <>
                                        <p className="text-sm text-athena-text-muted">
                                            {isGenerating ? 'Generating your morning briefing...' : (whoopEnabled ? 'Sleep data synced. Ready to generate your briefing.' : 'Ready to generate your briefing.')}
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
                                            ) : 'Generate Morning Briefing'}
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

                                {/* Readiness */}
                                {readiness && (
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Readiness</h3>
                                        <p className="text-sm text-athena-text-primary leading-relaxed">{readiness}</p>
                                    </div>
                                )}

                                {/* Two-column: Habits + Training */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                    {habitNote && (
                                        <div>
                                            <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Habits</h3>
                                            <p className="text-sm text-athena-text-primary leading-relaxed">{habitNote}</p>
                                        </div>
                                    )}
                                    {trainingRec && (
                                        <div>
                                            <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Training</h3>
                                            <p className="text-sm text-athena-text-primary leading-relaxed">{trainingRec}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Reading */}
                                {reading && (
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Reading</h3>
                                        <p className="text-sm text-athena-text-primary leading-relaxed">{reading}</p>
                                    </div>
                                )}

                                {/* Project Tasks */}
                                {projectTasks.length > 0 && (
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Projects</h3>
                                        <ul className="space-y-1.5">
                                            {projectTasks.map((task: string, i: number) => (
                                                <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                    <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                    <span>{task}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Focus Items */}
                                {focusItems.length > 0 && (
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">Today's Focus</h3>
                                        <ul className="space-y-1.5">
                                            {focusItems.map((item: string, i: number) => (
                                                <li key={i} className="text-sm text-athena-text-primary leading-relaxed flex items-start gap-2">
                                                    <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Insight */}
                                {insight && (
                                    <div className="border-l-2 border-athena-gold/40 pl-4">
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-1">Insight</h3>
                                        <p className="text-sm text-athena-text-warm leading-relaxed">{insight}</p>
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
