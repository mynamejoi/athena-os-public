"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { format } from 'date-fns';
import { X, Check, Save, Moon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';

interface DayReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date;
    onDataChange?: () => void;
}

interface DailyTask {
    id: string;
    title: string;
    status: 'Pending' | 'Completed';
    is_priority: boolean;
}

export function DayReportModal({ isOpen, onClose, date, onDataChange }: DayReportModalProps) {
    const supabase = createClient();
    const { whoopEnabled } = useWhoopMode();
    const dateStr = format(date, 'yyyy-MM-dd');

    // State
    const [tasks, setTasks] = useState<DailyTask[]>([]);

    // Sleep Stage Data
    const [sleepData, setSleepData] = useState<{
        deep: number | null;
        rem: number | null;
        light: number | null;
        awake: number | null;
        sleepScore: number | null;
        sleepHours: number | null;
        sleepDebtMinutes: number | null;
    }>({ deep: null, rem: null, light: null, awake: null, sleepScore: null, sleepHours: null, sleepDebtMinutes: null });

    // Journal State (Today 2.0 Style)
    const [win, setWin] = useState('');
    const [journalPoints, setJournalPoints] = useState<{ id: string, content: string }[]>([]);
    const [newJournalEntry, setNewJournalEntry] = useState('');
    const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
    const [editingJournalContent, setEditingJournalContent] = useState('');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Fetch Data
    useEffect(() => {
        if (!isOpen) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [{ data: tasksData }, { data: summaryData }, { data: whoopData }] = await Promise.all([
                    supabase.from('daily_tasks').select('*').eq('date', dateStr).order('order', { ascending: true }),
                    supabase.from('daily_summaries').select('*').eq('date', dateStr).maybeSingle(),
                    supabase.from('whoop_data').select('sleep_stage_deep_minutes, sleep_stage_rem_minutes, sleep_stage_light_minutes, sleep_stage_awake_minutes, sleep_performance, sleep_hours, sleep_debt_minutes, sleep_debt_corrected, whoop_reported_sleep_debt_minutes').eq('date', dateStr).maybeSingle()
                ]);

                setTasks(tasksData || []);
                setWin(summaryData?.win_of_the_day || '');

                // Set sleep data from whoop
                const debtMinutes = whoopData?.sleep_debt_corrected ?? whoopData?.sleep_debt_minutes ?? whoopData?.whoop_reported_sleep_debt_minutes ?? null;
                setSleepData({
                    deep: whoopData?.sleep_stage_deep_minutes ?? null,
                    rem: whoopData?.sleep_stage_rem_minutes ?? null,
                    light: whoopData?.sleep_stage_light_minutes ?? null,
                    awake: whoopData?.sleep_stage_awake_minutes ?? null,
                    sleepScore: whoopData?.sleep_performance ?? summaryData?.sleep_score ?? null,
                    sleepHours: whoopData?.sleep_hours ?? null,
                    sleepDebtMinutes: debtMinutes,
                });

                // Parse Journal Entry: Handle JSON string vs Plain Text
                if (summaryData?.journal_entry) {
                    try {
                        const parsed = JSON.parse(summaryData.journal_entry);
                        if (Array.isArray(parsed)) {
                            setJournalPoints(parsed);
                        } else if (parsed.content) {
                            setJournalPoints([parsed]);
                        } else {
                            // Fallback if not matching expected structure
                            setJournalPoints([{ id: '1', content: typeof parsed === 'string' ? parsed : JSON.stringify(parsed) }]);
                        }
                    } catch {
                        // Not JSON, assume plain text (Legacy Migration)
                        if (summaryData.journal_entry) {
                            const lines = summaryData.journal_entry.split('\n').filter((l: string) => l.trim().length > 0);
                            setJournalPoints(lines.map((line: string, i: number) => ({
                                id: `legacy-${i}`,
                                content: line
                            })));
                        } else {
                            setJournalPoints([]);
                        }
                    }
                } else {
                    setJournalPoints([]);
                }
            } catch (error) {
                console.error("Error fetching day report:", error);
                toast.error("Failed to load report");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [isOpen, dateStr, supabase]);

    // Handlers
    const toggleTask = async (task: DailyTask) => {
        const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed';

        // Optimistic Update
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

        // DB Update
        const { error } = await supabase.from('daily_tasks').update({ status: newStatus }).eq('id', task.id);

        if (error) {
            toast.error("Failed to update task");
            // Revert
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
        } else {
            if (onDataChange) onDataChange();
        }
    };

    // --- Journal Handlers (Today 2.0 Logic) ---

    const saveJournalData = async (field: 'win' | 'journal', value: any) => {
        setIsSaving(true);
        try {
            const updateData: any = { updated_at: new Date().toISOString() };
            if (field === 'win') updateData.win_of_the_day = value;
            if (field === 'journal') updateData.journal_entry = JSON.stringify(value);

            const { error } = await supabase.from('daily_summaries').upsert(
                { date: dateStr, ...updateData },
                { onConflict: 'date' }
            );

            if (error) throw error;
            if (onDataChange) onDataChange();
        } catch (error) {
            console.error("Error saving day report:", error);
            toast.error("Failed to save changes");
        } finally {
            setIsSaving(false);
        }
    };

    const addJournalPoint = async () => {
        if (!newJournalEntry.trim()) return;
        const newPoint = { id: crypto.randomUUID(), content: newJournalEntry };
        const updatedPoints = [...journalPoints, newPoint];
        setJournalPoints(updatedPoints);
        setNewJournalEntry('');
        await saveJournalData('journal', updatedPoints);
    };

    const deleteJournalPoint = async (id: string) => {
        if (confirm("Delete this entry?")) {
            const updatedPoints = journalPoints.filter(p => p.id !== id);
            setJournalPoints(updatedPoints);
            await saveJournalData('journal', updatedPoints);
        }
    };

    const startEditingJournal = (point: { id: string, content: string }) => {
        setEditingJournalId(point.id);
        setEditingJournalContent(point.content);
    };

    const saveEditedJournal = async () => {
        if (!editingJournalId) return;
        if (!editingJournalContent.trim()) {
            setEditingJournalId(null);
            return;
        }

        const updatedPoints = journalPoints.map(p => p.id === editingJournalId ? { ...p, content: editingJournalContent } : p);
        setJournalPoints(updatedPoints);
        setEditingJournalId(null);
        await saveJournalData('journal', updatedPoints);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[calc(100vw-2rem)] md:w-auto max-w-4xl bg-athena-bg border border-athena-gold/20 text-athena-text-primary p-0 overflow-hidden shadow-2xl">
                <DialogHeader className="p-4 md:p-6 bg-athena-panel border-b border-athena-border/50">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="font-serif text-2xl text-athena-gold">
                            {format(date, 'MMMM do, yyyy')}
                        </DialogTitle>
                    </div>
                </DialogHeader>

                <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 max-h-[80vh] overflow-y-auto">

                    {/* LEFT COLUMN: Tasks Section */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-athena-text-muted font-serif">Daily Tasks</h3>
                        {isLoading ? (
                            <div className="text-center py-4 text-athena-text-dim text-sm animate-pulse">Loading tasks...</div>
                        ) : tasks.length === 0 ? (
                            <div className="text-center py-4 text-athena-text-dim text-sm italic">No tasks recorded for this day.</div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {tasks.map(task => (
                                    <div
                                        key={task.id}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group",
                                            task.status === 'Completed'
                                                ? "bg-athena-gold/5 border-athena-gold/20 opacity-70"
                                                : "bg-athena-bg/50 border-athena-border/30 hover:border-athena-gold/30"
                                        )}
                                        onClick={() => toggleTask(task)}
                                    >
                                        <div className={cn(
                                            "w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0",
                                            task.status === 'Completed'
                                                ? "bg-athena-gold border-athena-gold text-athena-bg"
                                                : "border-athena-text-muted group-hover:border-athena-gold"
                                        )}>
                                            {task.status === 'Completed' && <Check size={12} strokeWidth={3} />}
                                        </div>
                                        <span className={cn(
                                            "text-sm font-medium transition-colors truncate",
                                            task.status === 'Completed' ? "text-athena-gold" : "text-athena-text-primary"
                                        )}>
                                            {task.title}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Sleep + Journal */}
                    <div className="space-y-6">
                        {/* Sleep Breakdown */}
                        {whoopEnabled && (sleepData.deep !== null || sleepData.rem !== null || sleepData.light !== null || sleepData.sleepScore !== null) && (() => {
                            const hasSleepStages = sleepData.deep !== null && sleepData.rem !== null && sleepData.light !== null;
                            const stages = hasSleepStages ? [
                                { label: 'Deep', minutes: sleepData.deep!, color: 'bg-indigo-500', textColor: 'text-indigo-400' },
                                { label: 'REM', minutes: sleepData.rem!, color: 'bg-blue-500', textColor: 'text-blue-400' },
                                { label: 'Light', minutes: sleepData.light!, color: 'bg-sky-400', textColor: 'text-sky-400' },
                                ...(sleepData.awake !== null && sleepData.awake > 0 ? [{ label: 'Awake', minutes: sleepData.awake, color: 'bg-orange-500', textColor: 'text-orange-400' }] : []),
                            ] : [];
                            const totalMinutes = stages.reduce((sum, s) => sum + s.minutes, 0);
                            const formatDuration = (mins: number) => {
                                const h = Math.floor(mins / 60);
                                const m = mins % 60;
                                return h > 0 ? `${h}h ${m}m` : `${m}m`;
                            };

                            return (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-athena-text-muted font-serif flex items-center gap-2">
                                            <Moon size={14} className="text-athena-gold/60" />
                                            Sleep Breakdown
                                        </h3>
                                        <div className="flex items-center gap-3 text-xs">
                                            {sleepData.sleepScore !== null && (
                                                <span className="text-athena-gold font-medium">Score: {sleepData.sleepScore}%</span>
                                            )}
                                            {sleepData.sleepHours !== null && (
                                                <span className="text-athena-text-muted">{sleepData.sleepHours.toFixed(1)}h total</span>
                                            )}
                                            {sleepData.sleepDebtMinutes !== null && (
                                                <span className="text-orange-400 font-medium">Debt: {(sleepData.sleepDebtMinutes / 60).toFixed(1)}h</span>
                                            )}
                                        </div>
                                    </div>

                                    {hasSleepStages && totalMinutes > 0 ? (
                                        <>
                                            {/* Stacked Bar */}
                                            <div className="flex h-6 rounded-lg overflow-hidden border border-athena-border/30">
                                                {stages.map((stage) => {
                                                    const pct = (stage.minutes / totalMinutes) * 100;
                                                    if (pct < 1) return null;
                                                    return (
                                                        <div
                                                            key={stage.label}
                                                            className={cn(stage.color, "relative group transition-all hover:brightness-110")}
                                                            style={{ width: `${pct}%` }}
                                                            title={`${stage.label}: ${formatDuration(stage.minutes)} (${Math.round(pct)}%)`}
                                                        />
                                                    );
                                                })}
                                            </div>

                                            {/* Legend */}
                                            <div className="grid grid-cols-4 gap-1">
                                                {stages.map((stage) => (
                                                    <div key={stage.label} className="flex items-center gap-1">
                                                        <div className={cn("w-2 h-2 rounded-sm shrink-0", stage.color)} />
                                                        <span className={cn("text-[9px] font-medium whitespace-nowrap", stage.textColor)}>{stage.label}</span>
                                                        <span className="text-[9px] text-athena-text-dim whitespace-nowrap">{formatDuration(stage.minutes)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        !hasSleepStages && (sleepData.sleepScore !== null || sleepData.sleepHours !== null) && (
                                            <div className="text-xs text-athena-text-dim italic">Detailed sleep stages not available for this day.</div>
                                        )
                                    )}
                                </div>
                            );
                        })()}

                        {/* Win of the Day */}
                        <div className="space-y-2">
                            <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-athena-gold-dim">Win of the Day</label>
                            <input
                                value={win}
                                onChange={(e) => setWin(e.target.value)}
                                onBlur={() => saveJournalData('win', win)}
                                placeholder="What was your highlight?"
                                className="w-full bg-athena-bg/40 border border-athena-border rounded-md px-3 h-11 focus:outline-none focus:border-athena-gold/50 text-athena-text-primary text-base md:text-sm"
                            />
                        </div>

                        {/* Journal Entries */}
                        <div className="space-y-2">
                            <label className="text-[9px] uppercase tracking-[0.2em] font-bold text-athena-gold-pale">Journal</label>

                            <div className="space-y-2 mb-3 max-h-[300px] overflow-y-auto pr-2">
                                {journalPoints.map(point => (
                                    <div
                                        key={point.id}
                                        className="group p-3 bg-athena-bg/30 border-l-2 border-athena-gold rounded-r-lg text-xs text-athena-text-warm leading-relaxed hover:bg-athena-bg/50 transition-colors cursor-pointer"
                                        onClick={() => startEditingJournal(point)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            deleteJournalPoint(point.id);
                                        }}
                                    >
                                        {editingJournalId === point.id ? (
                                            <input
                                                autoFocus
                                                value={editingJournalContent}
                                                onChange={(e) => setEditingJournalContent(e.target.value)}
                                                onBlur={saveEditedJournal}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveEditedJournal();
                                                    if (e.key === 'Escape') setEditingJournalId(null);
                                                }}
                                                className="w-full bg-transparent border-none focus:ring-0 px-2 py-1.5 text-base md:text-xs text-athena-text-primary focus:outline-none"
                                            />
                                        ) : (
                                            <span>{point.content}</span>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <input
                                value={newJournalEntry}
                                onChange={(e) => setNewJournalEntry(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addJournalPoint()}
                                placeholder="Add an entry..."
                                className="w-full bg-athena-bg/40 border border-athena-border rounded-md px-3 h-11 focus:outline-none focus:border-athena-gold/50 text-athena-text-primary text-base md:text-sm"
                            />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
