"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';

import { createClient } from '@/utils/supabase/client';
import {
    Activity,
    Check,
    ChevronDown,
    Plus,
    X,
    Settings,
    RotateCcw,
    BookOpen,
    Zap,
    Flame,
    Heart,
    Moon
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useRouter } from 'next/navigation';
import { ManageHabitsModal } from './ManageHabitsModal';
import DailyReportPanel from './reports/DailyReportPanel';
import { AthenaNavBar } from './AthenaNavBar';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { SINGLE_USER_ID } from '@/lib/constants';
import { HABIT_PRESETS, CATEGORY_LABELS, type HabitPreset } from '@/lib/onboarding-presets';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { MobileDrawerSheet } from '@/components/mobile/MobileDrawerSheet';

// --- Types ---
type JournalPoint = {
    id: string;
    content: string;
};

type Book = {
    id: string;
    name: string;
    current_page: number;
    total_pages: number;
    is_active: boolean;
};

type DailyTask = {
    id: string;
    date: string;
    title: string;
    status: 'Pending' | 'Completed';
    is_priority: boolean;
    is_one_off: boolean;
    source_habit_id?: string;
    order: number;
};

type DailySummary = {
    id: string;
    date: string;
    win_of_the_day: string;
    journal_entry: string;
    day_percentage: number;
    recovery_score: number;
    strain_score: number;
    sleep_score: number;
    vitals_data: any;
};

type HabitConfig = {
    id: string;
    title: string;
    category: 'good' | 'bad';
    frequency: number[] | null;
    icon: string;
};

type BiomarkerPoint = {
    date: string;
    resting_hr: number | null;
    skin_temp_celsius: number | null;
    respiratory_rate: number | null;
};

// --- Animations ---
const fadeSlide = {
    hidden: { opacity: 0, y: 14 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: {
            delay: i * 0.06,
            duration: 0.55,
            ease: [0.25, 0.1, 0.25, 1.0] as const
        }
    })
};

const numberVariant = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" as const } }
};

// --- Inline Habit Preset Picker (empty state nudge) ---
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function HabitPresetPicker({ supabase, dateStr, dayIndex, onDone, onOpenManage }: {
    supabase: ReturnType<typeof createClient>;
    dateStr: string;
    dayIndex: number;
    onDone: () => void;
    onOpenManage: () => void;
}) {
    const [selected, setSelected] = useState<Map<string, HabitPreset & { key: string }>>(new Map());
    const [saving, setSaving] = useState(false);

    const togglePreset = (category: string, preset: HabitPreset) => {
        const key = `${category}:${preset.title}`;
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(key)) next.delete(key);
            else next.set(key, { ...preset, key });
            return next;
        });
    };

    const handleSave = async () => {
        if (selected.size === 0) return;
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            const habitsToInsert = Array.from(selected.values()).map(h => ({
                title: h.title,
                category: 'good',
                frequency: null,
                icon: h.icon,
                user_id: user?.id,
            }));

            const { data: created } = await supabase.from('today_habits').insert(habitsToInsert).select();

            if (created) {
                const tasksToInsert = created
                    .filter(h => {
                        const freq = typeof h.frequency === 'string' ? JSON.parse(h.frequency) : h.frequency;
                        return !freq || (freq as number[]).includes(dayIndex);
                    })
                    .map((h, i) => ({
                        date: dateStr,
                        title: h.title,
                        status: 'Pending',
                        source_habit_id: h.id,
                        order: i,
                        is_priority: false,
                        is_one_off: false,
                    }));

                if (tasksToInsert.length > 0) {
                    await supabase.from('daily_tasks').insert(tasksToInsert);
                }

                toast.success(`${created.length} habit${created.length !== 1 ? 's' : ''} created`);
            }

            onDone();
        } catch (err) {
            console.error('Failed to create habits:', err);
            toast.error('Failed to create habits');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-xl border border-athena-border bg-white/[0.02] p-5 space-y-4">
            <div className="text-center mb-2">
                <h3 className="text-sm font-serif text-athena-gold">Set Up Your Daily Habits</h3>
                <p className="text-xs text-athena-text-muted mt-1">Habits refresh each morning based on your schedule.</p>
            </div>

            {Object.entries(HABIT_PRESETS).map(([category, presets]) => (
                <div key={category}>
                    <p className="text-[10px] uppercase tracking-widest text-athena-text-dim/60 mb-2 font-bold">
                        {CATEGORY_LABELS[category]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {presets.map(preset => {
                            const key = `${category}:${preset.title}`;
                            const isSelected = selected.has(key);
                            return (
                                <button
                                    key={key}
                                    onClick={() => togglePreset(category, preset)}
                                    className={cn(
                                        'px-3 py-2 rounded-lg text-sm font-medium border transition-all min-h-[44px]',
                                        isSelected
                                            ? 'bg-athena-gold/15 border-athena-gold/50 text-athena-gold'
                                            : 'bg-transparent border-athena-border/50 text-athena-text-muted hover:border-athena-gold/30'
                                    )}
                                >
                                    {preset.title}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}

            <button
                onClick={onOpenManage}
                className="flex items-center gap-2 text-sm text-athena-text-dim hover:text-athena-gold transition-colors"
            >
                <Plus className="w-4 h-4" /> Add Custom
            </button>

            {selected.size > 0 && (
                <p className="text-xs text-athena-text-dim text-center">
                    {selected.size} habit{selected.size !== 1 ? 's' : ''} selected
                </p>
            )}

            <Button
                onClick={handleSave}
                disabled={selected.size === 0 || saving}
                className="w-full bg-athena-gold/20 text-athena-gold text-xs font-sans font-semibold hover:bg-athena-gold/30 border border-athena-gold/30 disabled:opacity-40 min-h-[44px]"
            >
                {saving ? 'Creating...' : 'Save Habits'}
            </Button>
        </div>
    );
}

export function HabitTrackerWidgetV2() {
    const { whoopEnabled } = useWhoopMode();

    // --- State ---
    const [dailyTasks, setDailyTasks] = useState<DailyTask[] | null>(null);
    const [todaysTasks, setTodaysTasks] = useState<any[]>([]); // These are 'tasks' table items (due today)
    const [upcomingTasks, setUpcomingTasks] = useState<any[]>([]); // Tasks due in next 3 days
    const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
    const [activeBook, setActiveBook] = useState<Book | null>(null);

    // Whoop/Vitals State
    const [whoopMetrics, setWhoopMetrics] = useState<any>(null);
    const [yesterdayWhoopMetrics, setYesterdayWhoopMetrics] = useState<any>(null);
    const [baselines, setBaselines] = useState<any>(null);
    const [yesterdaySummary, setYesterdaySummary] = useState<DailySummary | null>(null);
    const [biomarkerTrend, setBiomarkerTrend] = useState<BiomarkerPoint[]>([]);

    // Journal State
    const [journalPoints, setJournalPoints] = useState<JournalPoint[]>([]);
    const [win, setWin] = useState("");
    const [mission, setMission] = useState(""); // Legacy support or maybe move to summary?
    const [newJournalEntry, setNewJournalEntry] = useState("");
    const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
    const [editingJournalContent, setEditingJournalContent] = useState("");


    // Book Tracking State
    const [loggingBookTask, setLoggingBookTask] = useState<DailyTask | null>(null);
    const [bookPageInput, setBookPageInput] = useState<number>(0);

    // UI State
    const [addTaskOpen, setAddTaskOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [mobileExpandedSections, setMobileExpandedSections] = useState<Set<string>>(new Set());
    const toggleMobileSection = (section: string) => {
        setMobileExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };
    const [mobileAddTaskOpen, setMobileAddTaskOpen] = useState(false);
    const [mobileJournalDrawerOpen, setMobileJournalDrawerOpen] = useState(false);
    const [mobileReportDrawerOpen, setMobileReportDrawerOpen] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState("");
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editingTaskTitle, setEditingTaskTitle] = useState("");

    // Streaks State
    const [streaks, setStreaks] = useState<Record<string, { current: number; previousStreak: number }>>({});
    const [isFirstDay, setIsFirstDay] = useState(false);

    // Date State
    const [today, setToday] = useState(new Date());
    const dateStr = today.toLocaleDateString('en-CA');
    const dayIndex = today.getDay();

    const supabase = createClient();
    const router = useRouter();

    // --- Effects ---
    useEffect(() => {
        const timer = setInterval(() => {
            setToday(new Date());
        }, 1000);

        // Poll for data updates every 15 minutes
        const dataTimer = setInterval(() => {
            fetchData();
        }, 15 * 60 * 1000);

        return () => {
            clearInterval(timer);
            clearInterval(dataTimer);
        };
    }, []);

    useEffect(() => {
        fetchData();
        // Fetch streaks data
        fetch('/api/productivity/streaks')
            .then(res => res.json())
            .then(data => {
                if (data.streaks) setStreaks(data.streaks);
            })
            .catch(err => { console.error('Failed to fetch streaks:', err); toast.error('Failed to load streaks'); });
        // Fetch personal baselines
        fetch('/api/productivity/baselines')
            .then(res => res.json())
            .then(data => {
                if (data.baselines) setBaselines(data.baselines);
            })
            .catch(err => { console.error('Failed to fetch baselines:', err); toast.error('Failed to load baselines'); });
    }, [dateStr]);

    // Ensure daily report exists — catches cases where WHOOP sync failed to trigger it
    useEffect(() => {
        fetch('/api/productivity/daily-trigger', { method: 'POST' }).catch(() => {});
    }, []);

    // --- Trend State ---
    const [trends, setTrends] = useState({
        day: 0,
        recovery: 0,
        strain: 0,
        sleep: 0
    });

    // --- Helpers ---
    const formatDecimalToTime = (decimal: number) => {
        if (!decimal && decimal !== 0) return '--';
        const hours = Math.floor(decimal);
        const minutes = Math.round((decimal - hours) * 60);
        return `${hours}:${minutes.toString().padStart(2, '0')}`;
    };

    // --- Helper to Identify Auto-Tasks ---
    // WHOOP-detected: auto-completed by WHOOP sync when matching sport is detected
    const isWhoopAutoTask = (title: string) => {
        const t = title.toLowerCase();
        return t.includes('gym') ||
            t.startsWith('push') ||
            t.startsWith('pull') ||
            t === 'legs' ||
            t === 'workout' ||
            t.includes('leg day') ||
            t.includes('strength') ||
            t.includes('sauna') ||
            t.includes('ice bath') ||
            t.includes('cold plunge') ||
            t.includes('6+ hour sleep');
    };
    // App-internal: auto-completed by in-app actions (journal entry, project task done)
    const isAppAutoTask = (title: string) => {
        const t = title.toLowerCase();
        return t === 'journal' || t === 'creative work';
    };
    const isAutoTask = (title: string) => {
        if (whoopEnabled && isWhoopAutoTask(title)) return true;
        if (isAppAutoTask(title)) return true;
        return false;
    };

    // --- Helper for Creative Work Check ---
    const checkCreativeWork = async (todayTasks: any[], dailyTasksList: DailyTask[]) => {
        const anyTaskDone = todayTasks.some((t: any) => {
            if (!t.due_date) return false;
            const d = t.due_date.split('T')[0];
            return d === dateStr && t.status === 'Done';
        });

        if (anyTaskDone) {
            const creativeTask = dailyTasksList.find(t => t.title === 'Creative Work' && t.status !== 'Completed');
            if (creativeTask) {
                // Update locally + DB
                setDailyTasks(prev => (prev || []).map(t => t.id === creativeTask.id ? { ...t, status: 'Completed' } : t));
                await supabase.from('daily_tasks').update({ status: 'Completed' }).eq('id', creativeTask.id);
            }
        }
    };


    // --- Journal Helpers ---
    const deleteJournalPoint = async (id: string) => {
        if (!confirm("Delete this journal entry?")) return;
        const updatedPoints = journalPoints.filter(p => p.id !== id);
        setJournalPoints(updatedPoints);

        // Update DB
        const { error } = await supabase.from('daily_summaries').upsert({
            id: dailySummary?.id,
            date: dateStr,
            journal_entry: JSON.stringify(updatedPoints),
            updated_at: new Date().toISOString()
        });
        if (error) toast.error("Failed to delete entry");
    };

    const startEditingJournal = (point: JournalPoint) => {
        setEditingJournalId(point.id);
        setEditingJournalContent(point.content);
    };

    const saveEditedJournal = async () => {
        if (!editingJournalId) return;
        if (!editingJournalContent.trim()) {
            deleteJournalPoint(editingJournalId);
            setEditingJournalId(null);
            return;
        }

        const updatedPoints = journalPoints.map(p => p.id === editingJournalId ? { ...p, content: editingJournalContent } : p);
        setJournalPoints(updatedPoints);
        setEditingJournalId(null);

        await supabase.from('daily_summaries').upsert({
            id: dailySummary?.id,
            date: dateStr,
            journal_entry: JSON.stringify(updatedPoints),
            updated_at: new Date().toISOString()
        });
    };

    const setGymSplit = async (task: DailyTask, split: string) => {
        // The split IS the new title (e.g., "Push (Chest)", "Pull (Back)", "Legs")
        const newTitle = split;

        // 1. Optimistic Update
        setDailyTasks(prev => (prev || []).map(t => t.id === task.id ? { ...t, title: newTitle } : t));

        // 2. Update daily_task title
        const { error } = await supabase.from('daily_tasks').update({ title: newTitle }).eq('id', task.id);
        if (error) {
            toast.error("Failed to update split");
            fetchData();
            return;
        }

        // 3. Also write the label to today's whoop_workout (always override, not just null)
        await supabase
            .from('whoop_workouts')
            .update({ workout_label: split, label_locked: true })
            .eq('date', dateStr)
            .eq('user_id', SINGLE_USER_ID)
            .in('sport_name', ['Functional Fitness', 'Weightlifting', 'Powerlifting', 'Bodybuilding', 'CrossFit', 'Box Fitness']);

        toast.success(`Set to ${split}`);
    };

    // --- Book Helpers ---
    const handleBookCompletion = async (task: DailyTask) => {
        if (task.status === 'Completed') {
            toggleTask(task);
            return;
        }

        // If checking, prompt for page
        setLoggingBookTask(task);
        setBookPageInput(activeBook?.current_page || 0);
    };

    const saveBookProgress = async () => {
        if (!loggingBookTask || !activeBook) return;

        // 1. Optimistic Update Book
        const updatedBook = { ...activeBook, current_page: bookPageInput };
        setActiveBook(updatedBook);

        // 2. Optimistic Update Task
        const updatedTasks = (dailyTasks || []).map(t => t.id === loggingBookTask.id ? { ...t, status: 'Completed' } as DailyTask : t);
        setDailyTasks(updatedTasks);
        setLoggingBookTask(null); // Close modal

        // 3. DB Updates
        try {
            await Promise.all([
                supabase.from('books').update({ current_page: bookPageInput }).eq('id', activeBook.id),
                supabase.from('daily_tasks').update({ status: 'Completed' }).eq('id', loggingBookTask.id)
            ]);
            toast.success("Progress saved!");
        } catch (e) {
            toast.error("Failed to save progress");
            fetchData(); // Revert on error
        }
    };

    // --- Data Fetching ---
    async function fetchData() {
        try {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

            // 1. Fetch Daily Data
            const [
                { data: summaryData },
                { data: tasksData },
                { data: yesterdaySummaryData },
                { data: whoopData },
                { data: yesterdayWhoop },
                { data: workoutData },
                { data: _activeBook },
                { count: totalSummaries },
            ] = await Promise.all([
                supabase.from('daily_summaries').select('*').eq('date', dateStr).maybeSingle(),
                supabase.from('daily_tasks').select('*').eq('date', dateStr).order('order', { ascending: true }).order('created_at', { ascending: true }),
                supabase.from('daily_summaries').select('*').eq('date', yesterdayStr).maybeSingle(),
                supabase.from('whoop_data').select('*').eq('date', dateStr).maybeSingle(),
                supabase.from('whoop_data').select('*').eq('date', yesterdayStr).maybeSingle(),
                supabase.from('whoop_workouts').select('*').eq('date', dateStr),
                supabase.from('books').select('*').eq('is_active', true).maybeSingle(),
                supabase.from('daily_summaries').select('*', { count: 'exact', head: true }),
            ]);

            setIsFirstDay((totalSummaries || 0) <= 1);

            setActiveBook(_activeBook);

            // --- Whoop Auto-Sync Check ---
            // Only runs in browser
            if (typeof window !== 'undefined') {
                const lastSync = localStorage.getItem('whoop_last_auto_sync_v2');
                const now = Date.now();
                const FIFTEEN_MINS = 15 * 60 * 1000;

                let isStale = false;
                if (!whoopData) {
                    isStale = true; // No data for today
                } else if (whoopData.updated_at) {
                    const dataAge = now - new Date(whoopData.updated_at).getTime();
                    if (dataAge > FIFTEEN_MINS) isStale = true;
                }

                // Rate Limit: Don't spam API if we tried recently
                const recentlySynced = lastSync && (now - parseInt(lastSync)) < FIFTEEN_MINS;

                if (isStale && !recentlySynced) {
                    localStorage.setItem('whoop_last_auto_sync_v2', now.toString()); // Set lock

                    // Non-blocking background sync
                    fetch('/api/whoop/sync', { method: 'POST' })
                        .then(res => {
                            if (res.ok) {
                                fetchData();
                            }
                        })
                        .catch(e => { console.error("Auto-sync error", e); toast.error('WHOOP sync failed'); });
                }
            }


            // 1.5. Fetch last 14 days of biomarker data for sparklines
            {
                const fourteenDaysAgo = new Date(today);
                fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
                const startDate14 = fourteenDaysAgo.toLocaleDateString('en-CA');

                const { data: bioData } = await supabase
                    .from('whoop_data')
                    .select('date, resting_hr, skin_temp_celsius, respiratory_rate')
                    .gte('date', startDate14)
                    .lte('date', dateStr)
                    .order('date', { ascending: true })
                    .limit(14);

                setBiomarkerTrend(bioData || []);
            }

            // 2. Generate Tasks if None Exist
            let currentTasks = tasksData || [];
            let currentSummary = summaryData;

            // Check if habit-based tasks exist (ignore auto-created gym/workout tasks that have no source_habit_id)
            const hasHabitTasks = currentTasks.some(t => t.source_habit_id);
            if (!hasHabitTasks) {
                // No habit tasks for today — generate them (gym tasks may already exist from workout plan)
                const { data: habits } = await supabase.from('today_habits').select('*');

                // Gym, Sauna, Cold Plunge tasks are managed by the workout weekly plan — not created from habits

                if (habits) {
                    const tasksToInsert = habits
                        .filter((h: HabitConfig) => {
                            if (!h.frequency) return true;
                            const freq = Array.isArray(h.frequency) ? h.frequency : JSON.parse(h.frequency as any);
                            if (!freq.includes(dayIndex)) return false;
                            return true;
                        })
                        .map((h: HabitConfig, index: number) => ({
                            date: dateStr,
                            title: h.title,
                            status: 'Pending',
                            source_habit_id: h.id,
                            order: index,
                            is_priority: false,
                            is_one_off: false,
                        }));

                    if (tasksToInsert.length > 0) {
                        // Use upsert to handle race conditions gracefully (requires unique index on date, source_habit_id)
                        // Or catch insert error. Since we added a unique index, insert will fail if duplicates exist.
                        const { data: insertedTasks, error } = await supabase.from('daily_tasks').insert(tasksToInsert).select();

                        if (error) {
                            // If duplicate key error (23505) or any other error, check if tasks were already created by another process
                            if (error.code === '23505' || error.message?.includes('duplicate')) {
                                const { data: existing } = await supabase.from('daily_tasks').select('*').eq('date', dateStr).order('order');
                                if (existing && existing.length > 0) {
                                    currentTasks = existing;
                                }
                            } else {
                                console.error("Generation Error", error);
                                toast.error('Failed to generate daily tasks');
                            }
                        } else {
                            currentTasks = insertedTasks;
                        }
                    }

                    // Create Summary Placeholder
                    const { data: insertedSummary, error: summaryError } = await supabase.from('daily_summaries').insert({
                        date: dateStr,
                        day_percentage: 0
                    }).select().single();
                    if (!summaryError) currentSummary = insertedSummary;
                }
            }

            setDailyTasks(currentTasks);
            setDailySummary(currentSummary);
            setYesterdaySummary(yesterdaySummaryData);

            // 3. Whoop Data
            if (whoopData) {
                // Update local state for display
                // Calculate Max HR: Priority 1: Workouts, Priority 2: Raw Whoop Data, Priority 3: Whoop Data Column
                let derivedMaxHr = 0;

                // 1. Try Workouts
                if (workoutData && workoutData.length > 0) {
                    derivedMaxHr = Math.max(...workoutData.map((w: any) => w.max_hr || 0));
                }

                // 2. Try Raw Data (Cycle Score) if still 0
                if (!derivedMaxHr && whoopData.raw_data?.cycle?.score?.max_heart_rate) {
                    derivedMaxHr = whoopData.raw_data.cycle.score.max_heart_rate;
                }

                setWhoopMetrics({
                    ...whoopData,
                    hours_slept: whoopData.sleep_hours,
                    recovery: whoopData.recovery_score,
                    strain: whoopData.strain,
                    sleep_performance: whoopData.sleep_performance,
                    sleep_debt: whoopData.sleep_debt_minutes ? (whoopData.sleep_debt_minutes / 60) : 0, // Keep as decimal for logic, format in render
                    hrv: whoopData.hrv,
                    rhr: whoopData.resting_hr,
                    calories: whoopData.calories_burned,
                    max_hr: derivedMaxHr > 0 ? derivedMaxHr : (whoopData.max_hr || null)
                });

                // Sync to Daily Summary if changed (Snapshotting)
                if (currentSummary && (currentSummary.recovery_score !== whoopData.recovery_score)) {
                    await supabase.from('daily_summaries').update({
                        recovery_score: whoopData.recovery_score,
                        strain_score: whoopData.strain,
                        sleep_score: whoopData.sleep_performance,
                        vitals_data: {
                            hrv: whoopData.hrv,
                            rhr: whoopData.resting_hr,
                            hours_slept: whoopData.sleep_hours
                        }
                    }).eq('id', currentSummary.id);
                }
            }

            // 3.5. Yesterday's Whoop Data
            if (yesterdayWhoop) {
                setYesterdayWhoopMetrics({
                    recovery: yesterdayWhoop.recovery_score,
                    strain: yesterdayWhoop.strain,
                    sleep_performance: yesterdayWhoop.sleep_performance
                });
            } else {
                setYesterdayWhoopMetrics(null);
            }

            // 4. Calculate Trends
            const calcTrend = (now: number | undefined, prev: number | undefined, inverse = false) => {
                if (now == null || prev == null) return 0;
                if (now > prev) return inverse ? -1 : 1;
                if (now < prev) return inverse ? 1 : -1;
                return 0;
            };

            const total = currentTasks.length || 1;
            const done = currentTasks.filter(t => t.status === 'Completed').length;
            const todayPct = Math.round((done / total) * 100);

            // Update Day % in Summary if changed
            if (currentSummary && currentSummary.day_percentage !== todayPct) {
                await supabase.from('daily_summaries').update({ day_percentage: todayPct }).eq('id', currentSummary.id);
            }

            setTrends({
                day: calcTrend(todayPct, yesterdaySummaryData?.day_percentage),
                recovery: calcTrend(whoopData?.recovery_score, yesterdaySummaryData?.recovery_score),
                strain: calcTrend(whoopData?.strain, yesterdaySummaryData?.strain_score),
                sleep: calcTrend(whoopData?.sleep_performance, yesterdaySummaryData?.sleep_score)
            });


            // 5. Journal Data
            setWin(currentSummary?.win_of_the_day || "");

            if (currentSummary?.journal_entry) {
                try {
                    const parsed = JSON.parse(currentSummary.journal_entry);
                    if (Array.isArray(parsed)) setJournalPoints(parsed);
                    else setJournalPoints([{ id: '1', content: currentSummary.journal_entry }]);
                } catch {
                    // Legacy Migration: Split by newline
                    const lines = currentSummary.journal_entry.split('\n').filter((l: string) => l.trim().length > 0);
                    setJournalPoints(lines.map((line: string, i: number) => ({
                        id: `legacy-${i}`,
                        content: line
                    })));
                }
            } else {
                setJournalPoints([]);
            }



            // --- Auto-Complete Logic (Backend) ---
            // We now call the API to handle this securely (bypassing potential RLS issues on whoop_workouts)
            try {
                // User ID handled server-side via SINGLE_USER_ID default
                fetch('/api/productivity/auto-complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: dateStr })
                }).then(res => res.json()).then(data => {
                    if (data.success && data.updates.length > 0) {
                        // Refresh tasks to show the new state
                        supabase.from('daily_tasks').select('*').eq('date', dateStr).order('order', { ascending: true }).order('created_at', { ascending: true })
                            .then(({ data: refinedTasks }) => {
                                if (refinedTasks) setDailyTasks(refinedTasks);
                            });
                    }
                });
            } catch (e) {
                console.error("Auto-complete API error:", e);
                toast.error('Failed to auto-complete tasks');
            }

            // --- Client-Side Checks (Journal & Creative Work depend on local state updates/tasks) ---
            // 1. "Journal" IF journal entries exist (we can keep this client side as we have the summary data right here)
            // 2. "Creative Work" (Dependent on Task interactions, handled separately)

            const updates: string[] = [];

            // Journal Check
            if (currentSummary?.journal_entry || (currentSummary?.win_of_the_day && currentSummary.win_of_the_day.length > 0)) {
                const journalTask = currentTasks.find(t => t.title === 'Journal' && t.status !== 'Completed');
                if (journalTask) updates.push(journalTask.id);
            }

            // Apply Updates
            if (updates.length > 0) {
                // Optimistic update locally
                currentTasks = currentTasks.map(t => updates.includes(t.id) ? { ...t, status: 'Completed' } : t);
                // Fire off DB updates
                await Promise.all(updates.map(id => supabase.from('daily_tasks').update({ status: 'Completed' }).eq('id', id)));
            }


            // 6. Tasks (Due Today and Upcoming)
            const { data: tasks } = await supabase.from('tasks').select('*, projects(name, color)').order('priority', { ascending: false });
            if (tasks) {
                const today = new Date(dateStr);
                const threeDaysFromNow = new Date(today);
                threeDaysFromNow.setDate(today.getDate() + 3);

                const dueToday: any[] = [];
                const dueSoon: any[] = [];


                tasks.forEach((t: any) => {
                    if (!t.due_date) return;
                    const d = t.due_date.split('T')[0];
                    const taskDate = new Date(d);

                    // Normalize for comparison
                    // We treat dates as strings YYYY-MM-DD
                    if (d === dateStr) {
                        dueToday.push(t);
                    } else if (d > dateStr && taskDate <= threeDaysFromNow) {
                        dueSoon.push(t);
                    }
                });


                setTodaysTasks(dueToday);
                setUpcomingTasks(dueSoon);

                // Check Creative Work: IF ANY "Due Today" task is checked off (Done)
                checkCreativeWork(dueToday, currentTasks);
            }

        } catch (e) {
            console.error("Fetch Error", e);
            toast.error("Could not load daily data.");
        }
    }

    // --- Handlers ---
    const toggleTask = useCallback(async (task: DailyTask) => {
        const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed';

        // Optimistic Update
        setDailyTasks(prev => (prev || []).map(t => t.id === task.id ? { ...t, status: newStatus } : t));

        const { error } = await supabase.from('daily_tasks').update({ status: newStatus }).eq('id', task.id);

        if (error) {
            toast.error("Failed to update task");
            fetchData(); // Revert
            return;
        }

        // Sync gym tasks to whoop_workouts
        if (task.title.toLowerCase().startsWith('gym')) {
            const match = task.title.match(/^Gym\s*\((.+)\)$/i);
            const SPLIT_MAP: Record<string, string> = {
                'Push Chest': 'Push (Chest)', 'Push (Chest)': 'Push (Chest)',
                'Push Tricep': 'Push (Tricep)', 'Push (Tricep)': 'Push (Tricep)',
                'Pull Back': 'Pull (Back)', 'Pull (Back)': 'Pull (Back)',
                'Pull Bicep': 'Pull (Bicep)', 'Pull (Bicep)': 'Pull (Bicep)',
                'Legs': 'Legs', 'Leg Day': 'Legs',
                'Cardio': 'Cardio', 'Recovery': 'Recovery',
            };
            const rawLabel = match ? match[1].trim() : null;
            const workoutLabel = rawLabel ? (SPLIT_MAP[rawLabel] || rawLabel) : null;

            if (newStatus === 'Completed') {
                try {
                    // Check if a WHOOP workout already exists for today
                    const { data: existingWorkout } = await supabase
                        .from('whoop_workouts')
                        .select('id, whoop_id')
                        .eq('date', dateStr)
                        .eq('user_id', SINGLE_USER_ID)
                        .not('whoop_id', 'like', 'manual-%')
                        .limit(1)
                        .maybeSingle();

                    if (existingWorkout) {
                        // WHOOP already logged a workout — just update the label if needed
                        if (workoutLabel) {
                            await supabase
                                .from('whoop_workouts')
                                .update({ workout_label: workoutLabel })
                                .eq('id', existingWorkout.id)
                                .is('workout_label', null);
                        }
                    } else {
                        // No WHOOP workout — create a manual entry
                        await supabase
                            .from('whoop_workouts')
                            .upsert({
                                user_id: SINGLE_USER_ID,
                                whoop_id: `manual-${dateStr}`,
                                date: dateStr,
                                sport_name: 'Weight Training',
                                sport_id: 1,
                                workout_label: workoutLabel,
                                strain: null,
                                calories: null,
                                duration_minutes: null,
                            }, { onConflict: 'user_id, whoop_id' });
                    }
                } catch (err) {
                    console.error('Failed to sync gym task to workouts:', err);
                }
            } else {
                // Toggled back to Pending — remove manual entry only
                try {
                    await supabase
                        .from('whoop_workouts')
                        .delete()
                        .eq('date', dateStr)
                        .eq('user_id', SINGLE_USER_ID)
                        .like('whoop_id', 'manual-%');
                } catch (err) {
                    console.error('Failed to remove manual workout entry:', err);
                }
            }
        }
    }, [dateStr]);

    const handleAddTask = async () => {
        if (!newTaskTitle.trim()) return;

        // Check if this matches an existing habit (case-insensitive)
        const { data: matchingHabit } = await supabase
            .from('today_habits')
            .select('id')
            .ilike('title', newTaskTitle.trim())
            .maybeSingle();

        const newTask: Partial<DailyTask> = {
            date: dateStr,
            title: newTaskTitle.trim(),
            status: 'Pending',
            is_one_off: !matchingHabit,
            source_habit_id: matchingHabit?.id || undefined,
            order: (dailyTasks || []).length, // Append to end
            is_priority: false
        };

        const { data, error } = await supabase.from('daily_tasks').insert(newTask).select().single();

        if (error) {
            toast.error("Failed to add task");
            return;
        }

        setDailyTasks([...(dailyTasks || []), data]);
        setNewTaskTitle("");
        toast.success("Task added");
    };

    const saveJournal = useCallback(async (field: string, value: any) => {
        // Upsert to Daily Summary
        const payload: any = { date: dateStr };
        if (field === 'win') payload.win_of_the_day = value;
        if (field === 'points') {
            payload.journal_entry = JSON.stringify(value);
        }

        const { error } = await supabase.from('daily_summaries').upsert(payload, { onConflict: 'date' });
        if (error) toast.error("Failed to save journal");
    }, [dateStr]);

    const addJournalPoint = useCallback(async () => {
        if (!newJournalEntry.trim()) return;
        const newPointObj = { id: crypto.randomUUID(), content: newJournalEntry };
        const updatedPoints = [...journalPoints, newPointObj];
        setJournalPoints(updatedPoints);
        setNewJournalEntry("");
        saveJournal('points', updatedPoints);

        // Optimistically complete "Journal" task
        const journalTask = (dailyTasks || []).find(t => t.title.toLowerCase().includes('journal') && t.status !== 'Completed');
        if (journalTask) {
            setDailyTasks(prev => (prev || []).map(t => t.id === journalTask.id ? { ...t, status: 'Completed' } : t));
            await supabase.from('daily_tasks').update({ status: 'Completed' }).eq('id', journalTask.id);
        }
    }, [newJournalEntry, journalPoints, dailyTasks, saveJournal]);



    const TaskCard = ({ task, isUpcoming }: { task: any, isUpcoming: boolean }) => {
        // Determine color based on project
        let projectColor = "bg-athena-text-muted"; // default
        let textColor = "text-athena-text-muted";
        const projName = task.projects?.name?.toLowerCase() || '';

        if (projName.includes('athena')) {
            projectColor = "bg-athena-gold";
            textColor = "text-athena-gold";
        } else if (projName.includes('personal') || projName.includes('life')) {
            projectColor = "bg-blue-400";
            textColor = "text-blue-400";
        } else if (task.priority === 'High') {
            projectColor = "bg-athena-red";
        } else if (task.priority === 'Medium') {
            projectColor = "bg-athena-gold-rose";
        }

        const isDone = task.status === 'Done';
        const title = task.title || task.name || '';

        // Book Logic
        const isBookTask = title.toLowerCase().includes('read book') && activeBook;
        const displayTitle = isBookTask ? `Read ${activeBook?.name}` : title;

        return (
            <div
                onClick={async () => {
                    // Intercept Book Task
                    if (isBookTask) {
                        handleBookCompletion(task);
                        return;
                    }

                    const newStatus = isDone ? 'In Progress' : 'Done';

                    // Optimistic Update
                    const updater = (tasks: any[]) => tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t);
                    setTodaysTasks(prev => updater(prev));
                    setUpcomingTasks(prev => updater(prev));

                    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);

                    // Trigger Creative Work Check
                    if (newStatus === 'Done') {
                        const currentToday = todaysTasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t);
                        checkCreativeWork(currentToday, dailyTasks || []);
                    }
                }}
                className={cn(
                    "bg-white/[0.02] border border-athena-border rounded-xl p-3 flex items-center gap-3 relative overflow-hidden group hover:border-athena-gold/30 transition-all cursor-pointer",
                    isDone && "opacity-60"
                )}
            >
                <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", projectColor)} />

                <div className={cn(
                    "w-[18px] h-[18px] rounded-[4px] border flex-shrink-0 flex items-center justify-center transition-all",
                    isDone
                        ? "bg-gradient-to-br from-athena-gold to-athena-gold-dim border-transparent"
                        : "border-athena-border",
                    textColor
                )}>
                    {isDone && <Check size={12} className="text-athena-bg font-bold" />}
                </div>

                {/* Title / Edit Mode */}
                {editingTaskId === task.id ? (
                    <input
                        autoFocus
                        value={editingTaskTitle}
                        onChange={(e) => setEditingTaskTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={async () => {
                            if (!editingTaskTitle.trim()) {
                                setEditingTaskId(null);
                                return;
                            }
                            // Optimistic
                            const updater = (tasks: any[]) => tasks.map(t => t.id === task.id ? { ...t, title: editingTaskTitle } : t);
                            setTodaysTasks(prev => updater(prev));
                            setUpcomingTasks(prev => updater(prev));
                            setEditingTaskId(null);

                            await supabase.from('tasks').update({ name: editingTaskTitle }).eq('id', task.id);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setEditingTaskId(null);
                        }}
                        className="flex-1 bg-athena-bg border border-athena-gold/50 rounded px-2 py-1 text-[13px] text-athena-text-primary focus:outline-none"
                    />
                ) : (
                    <div className="flex flex-col">
                        <span
                            className={cn(
                                "text-[13px] font-medium transition-all cursor-pointer flex items-center gap-2",
                                isDone ? "line-through text-athena-text-muted" : "text-athena-text-primary hover:text-athena-gold"
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditingTaskId(task.id);
                                setEditingTaskTitle(task.name || task.title);
                            }}
                        >
                            {displayTitle || task.name}
                        </span>
                        {isBookTask && activeBook && (
                            <span className="text-[9px] text-athena-text-dim flex items-center gap-1">
                                <BookOpen size={8} /> Page {activeBook.current_page}
                            </span>
                        )}

                    </div>
                )}

                <div className="ml-auto flex items-center gap-2">
                    {isUpcoming && task.due_date && (
                        <span className="text-[9px] text-athena-text-muted">
                            {(() => {
                                const [y, m, d] = task.due_date.split('T')[0].split('-').map(Number);
                                const date = new Date(y, m - 1, d); // Local midnight
                                return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                            })()}
                        </span>
                    )}
                    {(task.name || '').toLowerCase().includes('gym') && isDone && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <button onClick={(e) => e.stopPropagation()} className="text-[9px] uppercase tracking-wider font-bold text-athena-gold bg-athena-gold/10 px-1.5 py-0.5 rounded border border-athena-gold/20 hover:bg-athena-gold/20 transition-colors">
                                    Set Split
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full md:w-40 p-1 bg-athena-panel border border-athena-gold/20 backdrop-blur-xl">
                                <div className="grid grid-cols-1 gap-1">
                                    {['Push', 'Pull', 'Legs', 'Full Body', 'Cardio', 'Other'].map(split => (
                                        <button
                                            key={split}
                                            onClick={(e) => { e.stopPropagation(); }}
                                            className="text-left px-2 py-1.5 text-xs text-athena-text-primary hover:bg-athena-gold/10 hover:text-athena-gold rounded transition-colors"
                                        >
                                            {split}
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}
                </div>
            </div>
        );
    };

    // Memoize day completion stats to avoid recalculating on every render
    const dayStats = useMemo(() => {
        const tasks = dailyTasks || [];
        const total = tasks.length || 1;
        const done = tasks.filter(t => t.status === 'Completed').length;
        const pct = Math.round((done / total) * 100);
        return { total, done, pct };
    }, [dailyTasks]);

    return (
        <div className="min-h-screen bg-athena-bg text-athena-text-primary font-manrope selection:bg-athena-gold-dim/30 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {/* Ambient Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-athena-gold/5 rounded-full blur-[120px]" />
            </div>

            {/* Nav Bar */}
            <AthenaNavBar activeTab="today" />

            {/* ===== MOBILE LAYOUT ===== */}
            <div className="md:hidden relative z-10 px-4 pb-20 font-sans [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {/* 1. Header — date + day score + remaining count */}
                <div className="flex items-center justify-between py-3">
                    <div>
                        <span className="text-base font-serif text-athena-text-warm">
                            {format(today, 'EEEE, MMMM d')}
                        </span>
                        <div className="text-[10px] text-white/30 mt-0.5">
                            {(dailyTasks || []).filter(t => t.status !== 'Completed').length} remaining{todaysTasks.length > 0 ? ` · ${todaysTasks.length} due` : ''}
                        </div>
                    </div>
                    <span className="text-2xl font-serif font-bold text-athena-text-warm tabular-nums">
                        {dayStats.pct}<span className="text-sm text-white/30">%</span>
                    </span>
                </div>

                {/* 2. Vitals — WHOOP rings + inline secondary stats */}
                {whoopEnabled && whoopMetrics && (() => {
                    const rec = whoopMetrics.recovery || 0;
                    const recColor = rec >= 67 ? 'rgb(74,222,128)' : rec >= 34 ? 'rgb(250,204,21)' : 'rgb(239,68,68)';
                    return (
                        <div className="mb-3">
                            {/* Rings */}
                            <div className="flex items-start justify-center gap-5 py-1">
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative" style={{ width: 80, height: 80 }}>
                                        <svg width={80} height={80} className="-rotate-90">
                                            <circle cx={40} cy={40} r={34} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} />
                                            <circle cx={40} cy={40} r={34} fill="none" stroke={recColor} strokeWidth={6} strokeLinecap="round"
                                                strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34 * (1 - Math.min(rec / 100, 1))}
                                                style={{ filter: `drop-shadow(0 0 8px ${recColor}60)` }} className="transition-all duration-1000 ease-out" />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-xl font-serif font-bold text-white tabular-nums leading-none">{Math.round(rec)}<span className="text-[10px] text-white/60">%</span></span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-white/40 uppercase tracking-[0.15em] font-medium">Recovery</span>
                                </div>
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative" style={{ width: 80, height: 80 }}>
                                        <svg width={80} height={80} className="-rotate-90">
                                            <circle cx={40} cy={40} r={34} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} />
                                            <circle cx={40} cy={40} r={34} fill="none" stroke="rgb(217,164,100)" strokeWidth={6} strokeLinecap="round"
                                                strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34 * (1 - Math.min((whoopMetrics.strain || 0) / 21, 1))}
                                                style={{ filter: 'drop-shadow(0 0 8px rgba(217,164,100,0.4))' }} className="transition-all duration-1000 ease-out" />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-xl font-serif font-bold text-white tabular-nums leading-none">{Number(whoopMetrics.strain || 0).toFixed(1)}</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-white/40 uppercase tracking-[0.15em] font-medium">Strain</span>
                                </div>
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative" style={{ width: 80, height: 80 }}>
                                        <svg width={80} height={80} className="-rotate-90">
                                            <circle cx={40} cy={40} r={34} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} />
                                            <circle cx={40} cy={40} r={34} fill="none" stroke="rgb(168,85,247)" strokeWidth={6} strokeLinecap="round"
                                                strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34 * (1 - Math.min((whoopMetrics.sleep_performance || 0) / 100, 1))}
                                                style={{ filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.4))' }} className="transition-all duration-1000 ease-out" />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-xl font-serif font-bold text-white tabular-nums leading-none">{Math.round(whoopMetrics.sleep_performance || 0)}<span className="text-[10px] text-white/60">%</span></span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-white/40 uppercase tracking-[0.15em] font-medium">Sleep</span>
                                </div>
                            </div>
                            {/* Secondary metrics — single inline row */}
                            <p className="text-center text-[11px] text-white/25 mt-1.5 tabular-nums">
                                HRV {whoopMetrics.hrv ? Math.round(whoopMetrics.hrv) : '--'}
                                {' · '}RHR {whoopMetrics.rhr ? Math.round(whoopMetrics.rhr) : '--'}
                                {' · '}{whoopMetrics.hours_slept ? `${formatDecimalToTime(whoopMetrics.hours_slept)}h sleep` : ''}
                                {whoopMetrics.calories ? ` · ${Math.round(whoopMetrics.calories)} cal` : ''}
                            </p>
                        </div>
                    );
                })()}

                {/* 3. Habit Checklist */}
                <div className="mt-1">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em]">Habits</h2>
                        <button
                            onClick={() => setMobileAddTaskOpen(!mobileAddTaskOpen)}
                            className="w-10 h-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-white/[0.06] text-white/30 active:text-athena-gold active:border-athena-gold/30 transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    </div>

                    {/* Mobile Add Task */}
                    <AnimatePresence>
                        {mobileAddTaskOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden mb-3"
                            >
                                <div className="flex gap-2">
                                    <Input
                                        value={newTaskTitle}
                                        onChange={(e) => setNewTaskTitle(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { handleAddTask(); setMobileAddTaskOpen(false); } }}
                                        placeholder="Add a task..."
                                        className="bg-white/[0.03] border-white/[0.06] focus:border-athena-gold/40 text-athena-text-primary h-11 text-sm"
                                        autoFocus
                                    />
                                    <Button onClick={() => { handleAddTask(); setMobileAddTaskOpen(false); }} className="bg-athena-gold text-athena-bg font-bold h-11 px-4 shrink-0">
                                        Add
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Habit List — 2 columns */}
                    <div className="grid grid-cols-2 gap-x-1 gap-y-0">
                        {[...(dailyTasks || [])]
                            .sort((a, b) => {
                                if (a.status === 'Completed' && b.status !== 'Completed') return 1;
                                if (a.status !== 'Completed' && b.status === 'Completed') return -1;
                                return a.order - b.order;
                            })
                            .map(task => {
                                const isDone = task.status === 'Completed';
                                const isBookTask = task.title.toLowerCase().includes('read book') && activeBook;
                                const gymSplitMatch = task.title.match(/^gym\s*\((.+)\)$/i);
                                const displayTitle = isBookTask ? `Read ${activeBook?.name}`
                                    : task.title;
                                const splitLabel = gymSplitMatch ? gymSplitMatch[1].replace(/[()]/g, '') : null;
                                const streakCount = !task.is_one_off && streaks[task.title]?.current > 0 ? streaks[task.title].current : 0;

                                return (
                                    <div
                                        key={task.id}
                                        onClick={() => {
                                            if (isBookTask) handleBookCompletion(task);
                                            else toggleTask(task);
                                        }}
                                        className={cn(
                                            "flex items-center gap-2 min-h-[44px] px-1.5 py-1.5 rounded-lg active:bg-white/[0.04] active:scale-[0.98] transition-all cursor-pointer",
                                            isDone && "opacity-35"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all",
                                            isDone
                                                ? "bg-gradient-to-br from-athena-gold to-athena-gold-dim border-transparent"
                                                : "border-white/[0.15]"
                                        )}>
                                            {isDone && <Check size={10} className="text-athena-bg font-bold" />}
                                        </div>
                                        <span className={cn(
                                            "text-[13px] flex-1 truncate",
                                            isDone ? "line-through text-white/30" : "text-athena-text-warm"
                                        )}>
                                            {displayTitle}
                                            {splitLabel && <span className="text-white/30"> ({splitLabel})</span>}
                                        </span>
                                        {streakCount > 0 && (
                                            <span className="inline-flex items-center gap-0.5 text-white/20 text-[9px] font-semibold shrink-0">
                                                <Flame size={9} />
                                                {streakCount}
                                            </span>
                                        )}
                                        {isDone && task.title.toLowerCase().includes('gym') && (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <button
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-[9px] uppercase tracking-wider font-bold text-athena-text-warm bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.08] shrink-0"
                                                    >
                                                        {splitLabel || 'Split'}
                                                    </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-44 p-1 bg-athena-panel border border-white/[0.08] backdrop-blur-xl">
                                                    <div className="grid grid-cols-1 gap-1">
                                                        {['Push (Chest)', 'Push (Tricep)', 'Pull (Bicep)', 'Pull (Back)', 'Legs', 'Cardio', 'Recovery', 'Other'].map(split => (
                                                            <button
                                                                key={split}
                                                                onClick={(e) => { e.stopPropagation(); setGymSplit(task, split); }}
                                                                className="text-left px-2 py-2 text-sm text-athena-text-warm hover:bg-white/[0.04] rounded transition-colors min-h-[44px] flex items-center"
                                                            >
                                                                {split}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                </div>

                {/* 4. Due Tasks — inline, stacked list */}
                {(todaysTasks.length > 0 || upcomingTasks.length > 0) && (
                    <div className="mt-5">
                        {todaysTasks.length > 0 && (
                            <>
                                <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">Due Today</h2>
                                <div className="space-y-1.5 mb-3">
                                    {todaysTasks.map(task => (
                                        <TaskCard key={task.id} task={task} isUpcoming={false} />
                                    ))}
                                </div>
                            </>
                        )}
                        {upcomingTasks.length > 0 && (
                            <>
                                <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">Upcoming</h2>
                                <div className="space-y-1.5">
                                    {upcomingTasks.map(task => (
                                        <TaskCard key={task.id} task={task} isUpcoming={true} />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Mobile Journal Drawer */}
            <MobileDrawerSheet open={mobileJournalDrawerOpen} onClose={() => setMobileJournalDrawerOpen(false)} title="Journal">
                <div className="space-y-4">
                    {/* Win of the Day */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/25">Win of the Day</label>
                        <Input
                            value={win}
                            onChange={(e) => setWin(e.target.value)}
                            onBlur={() => saveJournal('win', win)}
                            placeholder={isFirstDay ? "Set a daily intention -- what do you want to accomplish today?" : "What was your highlight?"}
                            className="bg-white/[0.03] border-white/[0.06] focus:border-athena-gold/40 text-athena-text-primary text-sm h-11"
                        />
                    </div>
                    {/* Journal Entries */}
                    <div className="space-y-2">
                        {journalPoints.map(point => (
                            <div key={point.id} className="relative overflow-hidden rounded-r-lg">
                                <div className="absolute inset-y-0 right-0 flex items-center px-3 bg-red-500/80 rounded-r-lg">
                                    <span className="text-[10px] text-white font-bold">Delete</span>
                                </div>
                                <motion.div
                                    drag="x"
                                    dragConstraints={{ left: -80, right: 0 }}
                                    dragElastic={0.1}
                                    onDragEnd={(_, info) => {
                                        if (info.offset.x < -60) deleteJournalPoint(point.id);
                                    }}
                                    className="p-3 border-l-2 border-white/[0.08] text-xs text-athena-text-warm leading-relaxed relative z-10 bg-[#0e0c0a]"
                                    onClick={() => startEditingJournal(point)}
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
                                            className="w-full bg-transparent border-none focus:ring-0 p-0 text-xs text-athena-text-primary"
                                        />
                                    ) : (
                                        <span className="whitespace-pre-wrap">{point.content}</span>
                                    )}
                                </motion.div>
                            </div>
                        ))}
                    </div>
                    {/* Add Entry */}
                    <Input
                        value={newJournalEntry}
                        onChange={(e) => setNewJournalEntry(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addJournalPoint()}
                        placeholder={isFirstDay ? "Start your journal -- how are you feeling today?" : "Add an entry..."}
                        className="bg-white/[0.03] border-white/[0.06] focus:border-athena-gold/40 text-athena-text-primary text-sm h-11"
                    />
                </div>
            </MobileDrawerSheet>

            {/* Mobile Morning Brief Drawer */}
            <MobileDrawerSheet open={mobileReportDrawerOpen} onClose={() => setMobileReportDrawerOpen(false)} title=" " fullScreen>
                <DailyReportPanel />
            </MobileDrawerSheet>

            {/* 5. Mobile Fixed Bottom Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
                {/* Progress bar spanning full width */}
                <div className="h-1 bg-white/[0.04]">
                    <div
                        className="h-full bg-gradient-to-r from-athena-gold-dim to-athena-gold transition-all duration-500"
                        style={{ width: `${dayStats.pct}%` }}
                    />
                </div>
                <div className="bg-athena-bg/90 backdrop-blur-xl border-t border-white/[0.04] flex justify-around items-center py-2 px-4">
                    <button
                        onClick={() => setMobileJournalDrawerOpen(true)}
                        className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center"
                    >
                        <BookOpen size={18} className="text-white/25" />
                        <span className="text-[9px] text-white/25">Journal</span>
                    </button>
                    <button
                        onClick={() => setMobileReportDrawerOpen(true)}
                        className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center"
                    >
                        <Zap size={18} className="text-white/25" />
                        <span className="text-[9px] text-white/25">Brief</span>
                    </button>
                    <button
                        onClick={() => setManageOpen(true)}
                        className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center"
                    >
                        <Settings size={18} className="text-white/25" />
                        <span className="text-[9px] text-white/25">Manage</span>
                    </button>
                </div>
            </div>

            <main className="hidden md:block relative z-10 max-w-7xl mx-auto px-2 md:px-8 lg:px-16 py-6 space-y-8 font-sans">
                {/* Header */}
                <motion.header
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-end justify-between pb-4"
                >
                    <div className="w-full">
                        <div className="text-[10px] text-athena-text-muted uppercase tracking-[0.3em] font-semibold mb-2 font-sans">Daily Overview</div>
                        <h1 className="text-2xl md:text-4xl lg:text-5xl font-serif mt-2">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-athena-gold to-athena-gold-pale">{format(today, 'EEEE')}</span>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-athena-gold to-athena-gold-pale"> {format(today, 'MMMM d')}</span>
                        </h1>
                    </div>
                </motion.header>

                {/* Vitals Strip */}
                <motion.section
                    initial="hidden"
                    animate="visible"
                    variants={fadeSlide}
                    custom={1}
                >
                    <div className={cn("grid gap-3", whoopEnabled ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 md:grid-cols-4")}>
                        {(() => {
                            const { total, done, pct } = dayStats;
                            const recovery = whoopMetrics?.recovery || dailySummary?.recovery_score || 0;
                            const strain = typeof whoopMetrics?.strain === 'number' ? whoopMetrics.strain : dailySummary?.strain_score || 0;
                            const sleepPct = whoopMetrics?.sleep_performance || dailySummary?.sleep_score || 0;
                            const hrvVal = Math.round(Number(whoopMetrics?.hrv) || 0) || '--';
                            const rhrVal = whoopMetrics?.rhr || '--';
                            const calVal = whoopMetrics?.calories ? Math.round(whoopMetrics.calories).toLocaleString() : '--';
                            const maxHrVal = whoopMetrics?.max_hr ? Math.round(whoopMetrics.max_hr) : '--';
                            const sleepGot = formatDecimalToTime(whoopMetrics?.hours_slept);
                            const sleepDebt = formatDecimalToTime(whoopMetrics?.sleep_debt);
                            const recoveryBaseline = baselines?.recovery?.avg30 != null ? ` · 30d: ${Math.round(baselines.recovery.avg30)}%` : '';
                            const strainBaseline = baselines?.strain?.avg30 != null ? ` · 30d: ${baselines.strain.avg30.toFixed(1)}` : '';
                            const sleepBaseline = baselines?.sleep_score?.avg30 != null ? ` · 30d: ${Math.round(baselines.sleep_score.avg30)}%` : '';

                            const habitsCard = { label: 'Habits', value: `${pct}%`, icon: Check, color: 'text-athena-gold', sub: `${done}/${total} done · ${total - done} left` };
                            const whoopCards = [
                                { label: 'Recovery', value: `${recovery}%`, icon: Heart, color: 'text-athena-green', sub: `HRV ${hrvVal} · RHR ${rhrVal}${recoveryBaseline}` },
                                { label: 'Strain', value: `${Number(strain).toFixed(1)}`, icon: Zap, color: 'text-athena-strain', sub: `Cal ${calVal} · Max ${maxHrVal}${strainBaseline}` },
                                { label: 'Sleep', value: `${sleepPct}%`, icon: Moon, color: 'text-athena-purple', sub: `${sleepGot}h · Debt ${sleepDebt}h${sleepBaseline}` },
                            ];

                            const cards = whoopEnabled ? [habitsCard, ...whoopCards] : [habitsCard];

                            return cards.map((stat, i) => (
                                <motion.div
                                    key={stat.label}
                                    custom={i}
                                    variants={fadeSlide}
                                    initial="hidden"
                                    animate="visible"
                                    className="px-4 py-3 rounded-xl border border-athena-border bg-white/[0.02] flex items-center gap-3"
                                >
                                    <stat.icon className={cn("w-5 h-5 shrink-0", stat.color)} />
                                    <div className="min-w-0">
                                        <div className="flex items-baseline gap-1.5">
                                            <span className={cn("text-xl md:text-2xl font-serif leading-none", stat.color)}>{stat.value}</span>
                                            <span className="text-[11px] text-athena-text-muted">{stat.label}</span>
                                        </div>
                                        <div className="text-[10px] text-athena-text-muted/70 mt-0.5 truncate">{stat.sub}</div>
                                    </div>
                                </motion.div>
                            ));
                        })()}
                        {!whoopEnabled && (
                            <div className="col-span-1 md:col-span-3 p-4 rounded-xl border border-athena-border/30 bg-white/[0.02] flex items-center justify-center gap-3">
                                <Heart className="w-5 h-5 text-athena-text-muted/40" />
                                <p className="text-[12px] text-athena-text-muted/50">Connect WHOOP to track Recovery, Sleep, and Strain</p>
                            </div>
                        )}
                    </div>
                </motion.section>

                {/* Biomarkers Sparklines */}
                <div className="-mt-5" />
                {whoopEnabled && biomarkerTrend.length > 0 && (() => {
                    const rhrData = biomarkerTrend.filter(d => d.resting_hr != null);
                    const skinData = biomarkerTrend.filter(d => d.skin_temp_celsius != null);
                    const respData = biomarkerTrend.filter(d => d.respiratory_rate != null);

                    const hasAny = rhrData.length > 0 || skinData.length > 0 || respData.length > 0;
                    if (!hasAny) return null;

                    // RHR
                    const latestRhr = rhrData.length > 0 ? rhrData[rhrData.length - 1].resting_hr : null;
                    const prevRhr = rhrData.length > 1 ? rhrData[rhrData.length - 2].resting_hr : null;
                    const rhrTrendDir = (latestRhr != null && prevRhr != null) ? (latestRhr < prevRhr ? '\u2193' : latestRhr > prevRhr ? '\u2191' : '') : '';

                    // Skin temp
                    const latestSkin = skinData.length > 0 ? skinData[skinData.length - 1].skin_temp_celsius : null;
                    const skinAvg = skinData.length > 0
                        ? skinData.reduce((s, d) => s + (d.skin_temp_celsius || 0), 0) / skinData.length
                        : null;
                    const skinDeviation = (latestSkin != null && skinAvg != null) ? Math.abs(latestSkin - skinAvg) : 0;
                    const skinFlagged = skinDeviation > 0.5;

                    // Respiratory rate
                    const latestResp = respData.length > 0 ? respData[respData.length - 1].respiratory_rate : null;
                    const respAvg = respData.length > 0
                        ? respData.reduce((s, d) => s + (d.respiratory_rate || 0), 0) / respData.length
                        : null;
                    const respFlagged = (latestResp != null && respAvg != null) ? latestResp > respAvg + 1 : false;

                    return (
                        <motion.div
                            initial="hidden"
                            animate="visible"
                            variants={fadeSlide}
                            custom={1.5}
                            className="grid grid-cols-1 md:grid-cols-3 gap-2"
                        >
                            {/* RHR Trend */}
                            {rhrData.length > 0 && (
                                <div className="bg-athena-panel border border-athena-border rounded-lg px-3 backdrop-blur-sm flex items-center gap-2 h-10">
                                    <span className="text-[10px] text-athena-text-muted uppercase tracking-[0.15em] font-semibold shrink-0">RHR</span>
                                    {rhrTrendDir && (
                                        <span className={cn("text-xs font-bold shrink-0", rhrTrendDir === '\u2193' ? 'text-green-400' : 'text-rose-400')}>{rhrTrendDir}</span>
                                    )}
                                    <div className="flex-1 h-full min-w-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={rhrData} margin={{ top: 16, right: 2, bottom: 2, left: 2 }}>
                                                <Line type="monotone" dataKey="resting_hr" stroke="#fb7185" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <span className="text-rose-400 font-serif text-sm shrink-0">
                                        {latestRhr} <span className="text-[9px] text-athena-text-muted font-sans">bpm</span>
                                    </span>
                                </div>
                            )}

                            {/* Skin Temp */}
                            {skinData.length > 0 && (() => {
                                const skinDataF = skinData.map(d => ({
                                    ...d,
                                    skin_temp_f: d.skin_temp_celsius != null ? d.skin_temp_celsius * 9 / 5 + 32 : null
                                }));
                                const latestSkinF = latestSkin != null ? (latestSkin * 9 / 5 + 32) : null;
                                return (
                                    <div className={cn(
                                        "bg-athena-panel border rounded-lg px-3 backdrop-blur-sm flex items-center gap-2 h-10",
                                        skinFlagged ? "border-athena-gold/50" : "border-athena-border"
                                    )}>
                                        <span className="text-[10px] text-athena-text-muted uppercase tracking-[0.15em] font-semibold shrink-0">Temp</span>
                                        {skinFlagged && (
                                            <span className="text-[10px] md:text-[8px] text-athena-gold font-semibold uppercase shrink-0">!</span>
                                        )}
                                        <div className="flex-1 h-full min-w-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={skinDataF} margin={{ top: 16, right: 2, bottom: 2, left: 2 }}>
                                                    <Line type="monotone" dataKey="skin_temp_f" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <span className="text-athena-gold font-serif text-sm shrink-0">
                                            {latestSkinF?.toFixed(1)} <span className="text-[9px] text-athena-text-muted font-sans">&deg;F</span>
                                        </span>
                                    </div>
                                );
                            })()}

                            {/* Respiratory Rate */}
                            {respData.length > 0 && (
                                <div className={cn(
                                    "bg-athena-panel border rounded-lg px-3 backdrop-blur-sm flex items-center gap-2 h-10",
                                    respFlagged ? "border-teal-500/50" : "border-athena-border"
                                )}>
                                    <span className="text-[10px] text-athena-text-muted uppercase tracking-[0.15em] font-semibold shrink-0">Resp</span>
                                    {respFlagged && (
                                        <span className="text-[10px] md:text-[8px] text-teal-400 font-semibold uppercase shrink-0">!</span>
                                    )}
                                    <div className="flex-1 h-full min-w-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={respData} margin={{ top: 16, right: 2, bottom: 2, left: 2 }}>
                                                <Line type="monotone" dataKey="respiratory_rate" stroke="#2dd4bf" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <span className="text-teal-400 font-serif text-sm shrink-0">
                                        {latestResp?.toFixed(1)} <span className="text-[9px] text-athena-text-muted font-sans">br/min</span>
                                    </span>
                                </div>
                            )}
                        </motion.div>
                    );
                })()}

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr_1fr] gap-4 md:gap-6 overflow-x-hidden">
                    {/* Left Column: Tasks */}
                    <motion.div data-onboarding="habits-section" variants={fadeSlide} custom={2} initial="hidden" animate="visible" className="space-y-6 md:space-y-8 border-r-0 lg:border-r border-athena-border/20 pr-0 lg:pr-8">

                        {/* Daily Tasks Section */}
                        <div className="space-y-6">
                            {/* Task Header */}
                            <div className="flex items-center justify-between border-b border-athena-border/50 pb-4 h-10">
                                <h2 className="text-lg font-serif text-athena-gold mb-3">Daily Tasks</h2>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setAddTaskOpen(!addTaskOpen)}
                                        className={cn(
                                            "px-3 py-1 text-[11px] border rounded-full transition-all flex items-center gap-1",
                                            addTaskOpen ? "bg-athena-gold/10 border-athena-gold text-athena-gold" : "border-athena-border text-athena-text-muted hover:text-athena-text-primary"
                                        )}
                                    >
                                        <Plus size={12} /> Add Task
                                    </button>
                                    <button
                                        onClick={() => setManageOpen(!manageOpen)}
                                        className="px-3 py-1 text-[11px] border border-athena-border rounded-full text-athena-text-muted hover:text-athena-text-primary transition-all flex items-center gap-1"
                                    >
                                        <Settings size={12} /> Manage
                                    </button>
                                </div>
                            </div>

                            {/* Add Task Panel */}
                            <AnimatePresence>
                                {addTaskOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="flex gap-2 py-4">
                                            <Input
                                                value={newTaskTitle}
                                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                                                placeholder="What needs to get done today?"
                                                className="bg-athena-bg/50 border-athena-gold/30 focus:border-athena-gold text-athena-text-primary h-10"
                                            />
                                            <Button onClick={handleAddTask} className="bg-gradient-to-r from-athena-gold-dim to-athena-gold text-athena-bg font-bold h-10 px-6">
                                                Add
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Task List (Grid Layout) */}
                            {dailyTasks !== null && dailyTasks.length === 0 && (
                                <HabitPresetPicker
                                    supabase={supabase}
                                    dateStr={dateStr}
                                    dayIndex={dayIndex}
                                    onDone={fetchData}
                                    onOpenManage={() => setManageOpen(true)}
                                />
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {(dailyTasks || []).map((task) => {
                                    const isDone = task.status === 'Completed';
                                    const isBookTask = task.title.toLowerCase().includes('read book') && activeBook;
                                    const gymSplitMatch = task.title.match(/^gym\s*\((.+)\)$/i);
                                    const displayTitle = isBookTask ? `Read ${activeBook?.name}`
                                        : gymSplitMatch ? gymSplitMatch[1] // Show just "Push Chest" instead of "Gym (Push Chest)"
                                        : task.title;

                                    return (
                                        <motion.div
                                            key={task.id}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: isDone ? 0.4 : 1 }}
                                            className={cn(
                                                "group flex items-center gap-2 p-3 md:p-2.5 rounded-xl border transition-all duration-300 min-h-[44px]",
                                                isDone ? "bg-transparent border-transparent" : "bg-white/[0.02] border-athena-border/30 hover:border-athena-gold/30"
                                            )}
                                            onClick={(e) => {
                                                // Click empty space to toggle
                                                if (e.target === e.currentTarget) {
                                                    if (isBookTask) {
                                                        handleBookCompletion(task);
                                                    } else {
                                                        toggleTask(task);
                                                    }
                                                }
                                            }}
                                            onContextMenu={async (e) => {
                                                e.preventDefault();
                                                // Right-click to delete from daily_tasks
                                                if (confirm(`Delete "${task.title}" for today?`)) {
                                                    // Optimistic delete
                                                    setDailyTasks(prev => (prev || []).filter(t => t.id !== task.id));

                                                    const { error } = await supabase.from('daily_tasks').delete().eq('id', task.id);
                                                    if (error) {
                                                        toast.error("Failed to delete task");
                                                        fetchData();
                                                    }
                                                }
                                            }}
                                        >
                                            <button
                                                onClick={() => {
                                                    if (isBookTask) handleBookCompletion(task);
                                                    else toggleTask(task);
                                                }}
                                                className={cn(
                                                    "w-6 h-6 md:w-5 md:h-5 rounded-md border flex items-center justify-center transition-all duration-300 touch-manipulation",
                                                    isDone
                                                        ? "bg-gradient-to-br from-athena-gold to-athena-gold-dim border-transparent shadow-[0_0_10px_rgb(var(--athena-gold))]"
                                                        : "border-athena-border/50 group-hover:border-athena-gold/50"
                                                )}
                                            >
                                                {isDone && <Check size={10} className="text-athena-bg font-bold" />}
                                            </button>

                                            {editingTaskId === task.id ? (
                                                <input
                                                    autoFocus
                                                    value={editingTaskTitle}
                                                    onChange={(e) => setEditingTaskTitle(e.target.value)}
                                                    onBlur={async () => {
                                                        if (!editingTaskTitle.trim()) {
                                                            setEditingTaskId(null);
                                                            return;
                                                        }

                                                        // Optimistic update
                                                        setDailyTasks(prev => (prev || []).map(t => t.id === task.id ? { ...t, title: editingTaskTitle } : t));
                                                        setEditingTaskId(null);

                                                        const { error } = await supabase.from('daily_tasks').update({ title: editingTaskTitle }).eq('id', task.id);
                                                        if (error) toast.error("Failed to update title");
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.currentTarget.blur();
                                                        } else if (e.key === 'Escape') {
                                                            setEditingTaskId(null);
                                                        }
                                                    }}
                                                    className="flex-1 bg-athena-bg border border-athena-gold/50 rounded px-1 py-0.5 text-base md:text-xs text-athena-text-primary focus:outline-none"
                                                />
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span
                                                        className={cn(
                                                            "text-xs font-medium transition-all cursor-pointer flex items-center gap-2",
                                                            isDone ? "line-through text-athena-text-muted" : "text-athena-text-primary hover:text-athena-gold"
                                                        )}
                                                        onClick={() => {
                                                            setEditingTaskId(task.id);
                                                            setEditingTaskTitle(task.title);
                                                        }}
                                                    >
                                                        {displayTitle}
                                                        {!task.is_one_off && streaks[task.title]?.current > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 text-athena-gold-dim text-[9px] font-semibold ml-1">
                                                                <Flame size={10} />
                                                                {streaks[task.title].current}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {isBookTask && activeBook && (
                                                        <span className="text-[9px] text-athena-text-dim flex items-center gap-1">
                                                            <BookOpen size={8} /> Page {activeBook.current_page}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <div className="ml-auto flex items-center gap-2">
                                                {!isDone && (
                                                    <>
                                                        {task.title.toLowerCase().includes('leg') && (
                                                            <Badge variant="outline" className="text-[9px] uppercase tracking-wider font-bold text-athena-gold bg-athena-gold/10 px-1.5 py-0.5 rounded border border-athena-gold/20">Legs</Badge>
                                                        )}
                                                    </>
                                                )}

                                                {isDone && task.title.toLowerCase().includes('gym') && (
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <button className="text-[9px] uppercase tracking-wider font-bold text-athena-gold bg-athena-gold/10 px-1.5 py-0.5 rounded border border-athena-gold/20 hover:bg-athena-gold/20 transition-colors">
                                                                {task.title.match(/\((.+)\)/)?.[1]?.replace(/[()]/g, '') || 'Set Split'}
                                                            </button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-full md:w-40 p-1 bg-athena-panel border border-athena-gold/20 backdrop-blur-xl">
                                                            <div className="grid grid-cols-1 gap-1">
                                                                {['Push (Chest)', 'Push (Tricep)', 'Pull (Bicep)', 'Pull (Back)', 'Legs', 'Cardio', 'Recovery', 'Other'].map(split => (
                                                                    <button
                                                                        key={split}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setGymSplit(task, split);
                                                                        }}
                                                                        className="text-left px-2 py-1.5 text-xs text-athena-text-primary hover:bg-athena-gold/10 hover:text-athena-gold rounded transition-colors"
                                                                    >
                                                                        {split}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>
                                                )}

                                                {isAutoTask(task.title) && (
                                                    <span className="text-[9px] uppercase tracking-wider font-bold text-athena-gold bg-athena-gold/10 px-1.5 py-0.5 rounded border border-athena-gold/20">
                                                        Auto
                                                    </span>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>

                    {/* Middle Column: Tasks */}
                    <motion.div variants={fadeSlide} custom={2.5} initial="hidden" animate="visible" className="space-y-8">

                        {/* Due Today */}
                        <div>
                            <div className="flex items-center justify-between border-b border-athena-border/50 pb-4 mb-4 h-10">
                                <h2 className="text-lg font-serif text-athena-gold mb-3">Due Today</h2>
                            </div>

                            <div className="space-y-3">
                                {todaysTasks.length === 0 && (
                                    <div className="text-center py-8 text-athena-text-dim text-xs italic">
                                        No tasks due today.
                                    </div>
                                )}
                                {todaysTasks.map(task => (
                                    <TaskCard key={task.id} task={task} isUpcoming={false} />
                                ))}
                            </div>
                        </div>

                        {/* Due Soon */}
                        <div>
                            <div className="flex items-center justify-between border-b border-athena-border/50 pb-4 mb-4 h-10">
                                <h2 className="text-lg font-serif text-athena-gold mb-3">Due Soon (3 Days)</h2>
                            </div>

                            <div className="space-y-3">
                                {upcomingTasks.length === 0 && (
                                    <div className="text-center py-8 text-athena-text-dim text-xs italic">
                                        No upcoming tasks.
                                    </div>
                                )}
                                {upcomingTasks.map(task => (
                                    <TaskCard key={task.id} task={task} isUpcoming={true} />
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    {/* Right Column: Journal */}
                    <motion.div variants={fadeSlide} custom={3} initial="hidden" animate="visible">
                        <div className="bg-white/[0.02] border border-athena-border rounded-xl p-3 md:p-6 backdrop-blur-sm relative overflow-hidden h-fit sticky top-16 md:top-24">
                            {/* Ambient Glow */}
                            <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-athena-gold/5 blur-[80px] pointer-events-none" />

                            <h2 className="text-lg font-serif text-athena-gold mb-3">Journal</h2>

                            <div className="space-y-6">
                                {/* Win of the Day */}
                                <div data-onboarding="win-section" className="space-y-2">
                                    <label className="text-[11px] md:text-[9px] uppercase tracking-[0.2em] font-bold text-athena-gold-dim">Win of the Day</label>
                                    <Input
                                        value={win}
                                        onChange={(e) => setWin(e.target.value)}
                                        onBlur={() => saveJournal('win', win)}
                                        placeholder={isFirstDay ? "Set a daily intention -- what do you want to accomplish today?" : "What was your highlight?"}
                                        className="bg-athena-bg/40 border-athena-border focus:border-athena-gold/50 text-athena-text-primary text-sm"
                                    />
                                </div>

                                {/* Journal Entries */}
                                <div data-onboarding="journal-section" className="space-y-2">
                                    <label className="text-[11px] md:text-[9px] uppercase tracking-[0.2em] font-bold text-athena-gold-pale">Journal</label>
                                    <div className="space-y-2 mb-3">
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
                                                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-xs text-athena-text-primary"
                                                    />
                                                ) : (
                                                    <span className="whitespace-pre-wrap">{point.content}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <Input
                                        value={newJournalEntry}
                                        onChange={(e) => setNewJournalEntry(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addJournalPoint()}
                                        placeholder={isFirstDay ? "Start your journal -- how are you feeling today?" : "Add an entry..."}
                                        className="bg-athena-bg/40 border-athena-border focus:border-athena-gold/50 text-athena-text-primary text-sm"
                                    />
                                </div>

                            </div>
                        </div>
                    </motion.div>
                </div>

                <DailyReportPanel />

                <ManageHabitsModal
                    isOpen={manageOpen}
                    onClose={() => setManageOpen(false)}
                    currentDateStr={dateStr}
                    dayIndex={dayIndex}
                    onUpdateToday={fetchData}
                />

                {/* Book Log Modal */}
                <Dialog open={!!loggingBookTask} onOpenChange={(open) => !open && setLoggingBookTask(null)}>
                    <DialogContent className="bg-athena-panel border-athena-gold/20 backdrop-blur-xl">
                        <DialogHeader>
                            <DialogTitle className="text-athena-gold">Log Progress: {activeBook?.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label className="text-athena-text-muted">Current Page</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        value={bookPageInput}
                                        onChange={(e) => setBookPageInput(parseInt(e.target.value) || 0)}
                                        className="bg-athena-bg/50 border-athena-gold/30 text-athena-text-primary text-lg font-mono"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && saveBookProgress()}
                                    />
                                    <span className="text-sm text-athena-text-dim">
                                        / {activeBook?.total_pages}
                                    </span>
                                </div>
                                {/* Progress Bar */}
                                {activeBook && (
                                    <div className="h-2 w-full bg-athena-bg rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-athena-gold transition-all duration-500"
                                            style={{ width: `${Math.min(100, (bookPageInput / activeBook.total_pages) * 100)}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <Button variant="ghost" onClick={() => setLoggingBookTask(null)} className="text-athena-text-muted hover:text-athena-text-primary">
                                    Cancel
                                </Button>
                                <Button onClick={saveBookProgress} className="bg-athena-gold text-athena-bg font-bold hover:bg-athena-gold-dim">
                                    Save & Complete
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </main>
        </div>
    );
}
