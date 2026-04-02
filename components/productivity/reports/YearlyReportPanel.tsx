'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Sparkles, Target, Clock, Trophy, TrendingUp, ArrowUpRight } from 'lucide-react';
import { format } from 'date-fns';
import { DataMaturityProvider, DataGate } from '@/components/productivity/DataGate';

interface YearlyReportPanelProps {
    year: number;
}

const sectionFade = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } }
};

export default function YearlyReportPanel({ year }: YearlyReportPanelProps) {
    const [report, setReport] = useState<any>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    // Fetch existing report for this year
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`/api/reports?cadence=yearly&start=${year}-01-01&limit=1`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.reports?.length > 0 && data.reports[0].status === 'completed') {
                        setReport(data.reports[0]);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch yearly report', err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [year]);

    // Generate report
    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cadence: 'yearly', year }),
            });
            if (res.ok) {
                // Re-fetch from GET to get consistent DB row shape
                const refetch = await fetch(`/api/reports?cadence=yearly&start=${year}-01-01&limit=1`);
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

    // Extract fields from the report JSON (handles camelCase from Claude)
    const r = report?.report || {};
    const yearNarrative = r.yearNarrative || r.year_narrative;
    const accomplishments = r.accomplishments || [];
    const improvements = r.improvements || [];
    const recommendations = r.recommendations || [];
    const isCompleted = report?.status === 'completed';

    if (isLoading) {
        return (
            <motion.section variants={sectionFade} initial="hidden" animate="visible">
                <div className="rounded-xl border border-athena-border bg-white/[0.02] px-4 md:px-6 py-4 md:py-5">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-athena-gold/30 border-t-athena-gold rounded-full animate-spin" />
                        <span className="text-xs text-athena-text-muted">Loading yearly report...</span>
                    </div>
                </div>
            </motion.section>
        );
    }

    return (
        <DataMaturityProvider>
        <DataGate feature="yearlyBriefing">
        <motion.section variants={sectionFade} initial="hidden" animate="visible" transition={{ delay: 0.4 }}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 mb-3 group w-full text-left min-h-[44px]"
            >
                <Sparkles className="w-4 h-4 text-athena-gold" />
                <h2 className="text-lg font-serif text-athena-gold">Yearly Briefing</h2>
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
                        {/* No report — show generate button */}
                        {!isCompleted && (
                            <div className="rounded-xl border border-athena-border bg-white/[0.02] px-4 md:px-6 py-4 md:py-5 text-center space-y-3">
                                <p className="text-sm text-athena-text-muted">
                                    {isGenerating ? 'Generating your yearly briefing...' : 'Ready to generate your yearly briefing.'}
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
                                    ) : 'Generate Yearly Briefing'}
                                </button>
                            </div>
                        )}

                        {/* Completed report */}
                        {isCompleted && (
                            <div className="rounded-xl border border-athena-border bg-white/[0.02] px-4 md:px-6 py-4 md:py-5 space-y-3 md:space-y-4">
                                {yearNarrative && (
                                    <div className="px-4 md:px-5 py-4 md:py-5 rounded-lg border border-athena-border/30 bg-white/[0.02]">
                                        <p className="text-sm text-athena-text-primary leading-[1.8] whitespace-pre-line font-serif">
                                            {typeof yearNarrative === 'string' ? yearNarrative : JSON.stringify(yearNarrative)}
                                        </p>
                                    </div>
                                )}

                                {/* Accomplishments & Improvements side by side */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                    {Array.isArray(accomplishments) && accomplishments.length > 0 && (
                                        <div className="px-3 md:px-4 py-3 md:py-4 rounded-lg border border-athena-green/20 bg-athena-green/5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Trophy className="w-4 h-4 text-athena-green" />
                                                <span className="text-[9px] uppercase tracking-widest text-athena-green font-bold font-sans">Accomplishments</span>
                                            </div>
                                            <ul className="space-y-2">
                                                {accomplishments.map((item: string, i: number) => (
                                                    <li key={i} className="flex items-start gap-2 text-sm text-athena-text-primary leading-relaxed">
                                                        <ArrowUpRight className="w-3 h-3 text-athena-green mt-1 flex-shrink-0" />
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {Array.isArray(improvements) && improvements.length > 0 && (
                                        <div className="px-3 md:px-4 py-3 md:py-4 rounded-lg border border-athena-gold/20 bg-athena-gold/5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <TrendingUp className="w-4 h-4 text-athena-gold" />
                                                <span className="text-[9px] uppercase tracking-widest text-athena-gold font-bold font-sans">Areas to Improve</span>
                                            </div>
                                            <ul className="space-y-2">
                                                {improvements.map((item: string, i: number) => (
                                                    <li key={i} className="flex items-start gap-2 text-sm text-athena-text-primary leading-relaxed">
                                                        <Target className="w-3 h-3 text-athena-gold mt-1 flex-shrink-0" />
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                {/* Recommendations */}
                                {Array.isArray(recommendations) && recommendations.length > 0 && (
                                    <div className="px-3 md:px-4 py-3 md:py-4 rounded-lg border border-athena-purple/20 bg-athena-purple/5">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Target className="w-4 h-4 text-athena-purple" />
                                            <span className="text-[9px] uppercase tracking-widest text-athena-purple font-bold font-sans">Recommendations</span>
                                        </div>
                                        <ul className="space-y-2">
                                            {recommendations.map((rec: string, i: number) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-athena-text-primary leading-relaxed">
                                                    <span className="text-athena-purple mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-athena-purple/60" />
                                                    <span>{rec}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="flex items-center gap-1.5 text-[10px] text-athena-text-muted/50 pt-1">
                                    <Clock className="w-3 h-3" />
                                    <span>
                                        Generated {report.created_at ? format(new Date(report.created_at), 'h:mm a') : ''}
                                        {report.model && ` · ${report.model}`}
                                        {report.cost != null && Number(report.cost) > 0 && ` · ~$${Number(report.cost).toFixed(4)}`}
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
