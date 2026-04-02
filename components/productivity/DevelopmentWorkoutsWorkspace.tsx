'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addMonths, subMonths, subDays, isSameMonth } from 'date-fns';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Dumbbell, Flame, Clock, Zap, TrendingUp, CalendarDays, X, Plus, Trash2, Edit2, Filter, ChevronDown, Flag, Brain, Sparkles, Activity, Target, AlertTriangle, CheckCircle, BarChart3, Moon, GripVertical, Settings } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { WORKOUT_TYPE_COLORS } from '@/lib/colors';
import { SINGLE_USER_ID } from '@/lib/constants';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { DataMaturityProvider, DataGate } from '@/components/productivity/DataGate';
import { MobileDrawerSheet } from '@/components/mobile';

// Re-export as local alias for backward compatibility within this file
const TYPE_COLORS = WORKOUT_TYPE_COLORS;

const DEFAULT_LIFTING_TYPES = ['Push (Chest)', 'Push (Tricep)', 'Pull (Back)', 'Pull (Bicep)', 'Legs'];
const FIXED_CATEGORIES = ['Cardio', 'Recovery', 'Other'];
const DEFAULT_LABEL_OPTIONS = [...DEFAULT_LIFTING_TYPES, ...FIXED_CATEGORIES];

function getStoredLiftingTypes(): string[] {
    if (typeof window === 'undefined') return DEFAULT_LIFTING_TYPES;
    const stored = localStorage.getItem('athena_workout_types');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch { /* ignore */ }
    }
    return DEFAULT_LIFTING_TYPES;
}

// Mutable at module level — updated on component mount from localStorage
let LABEL_OPTIONS = DEFAULT_LABEL_OPTIONS;

const TYPE_ABBREV: Record<string, string> = {
    'Push (Chest)': 'ChP',
    'Push (Tricep)': 'TrP',
    'Pull (Back)': 'BkP',
    'Pull (Bicep)': 'BiP',
    'Legs': 'Leg',
    'Cardio': 'Car',
    'Recovery': 'Rec',
};

const EXERCISE_DB: Record<string, string[]> = {
    Push: [
        'Bench Press', 'Incline Bench Press', 'Decline Bench Press', 'Dumbbell Bench Press', 'Incline Dumbbell Press',
        'Overhead Press', 'Dumbbell Shoulder Press', 'Arnold Press', 'Push Press',
        'Chest Fly', 'Cable Fly', 'Incline Cable Fly', 'Pec Deck',
        'Tricep Pushdown', 'Tricep Dips', 'Skull Crushers', 'Overhead Tricep Extension', 'Close Grip Bench Press',
        'Lateral Raise', 'Front Raise', 'Cable Lateral Raise',
        'Push Ups', 'Decline Push Ups', 'Diamond Push Ups',
        'Landmine Press', 'Machine Chest Press', 'Smith Machine Bench',
    ],
    Pull: [
        'Deadlift', 'Barbell Row', 'Dumbbell Row', 'Pendlay Row', 'T-Bar Row',
        'Pull Ups', 'Chin Ups', 'Lat Pulldown', 'Wide Grip Pulldown', 'Close Grip Pulldown',
        'Seated Cable Row', 'Cable Row', 'Machine Row',
        'Face Pulls', 'Reverse Fly', 'Rear Delt Fly',
        'Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl', 'Concentration Curl', 'Cable Curl', 'EZ Bar Curl',
        'Shrugs', 'Barbell Shrugs', 'Dumbbell Shrugs',
        'Rack Pull', 'Straight Arm Pulldown',
    ],
    Legs: [
        'Squat', 'Back Squat', 'Front Squat', 'Goblet Squat', 'Hack Squat', 'Bulgarian Split Squat',
        'Leg Press', 'Leg Extension', 'Leg Curl', 'Seated Leg Curl', 'Lying Leg Curl',
        'Romanian Deadlift', 'Stiff Leg Deadlift', 'Sumo Deadlift',
        'Hip Thrust', 'Barbell Hip Thrust', 'Glute Bridge',
        'Lunges', 'Walking Lunges', 'Reverse Lunges',
        'Calf Raise', 'Seated Calf Raise', 'Standing Calf Raise',
        'Step Ups', 'Box Squat', 'Smith Machine Squat',
        'Adductor Machine', 'Abductor Machine',
    ],
    Cardio: [
        'Running', 'Treadmill', 'Cycling', 'Stationary Bike', 'Rowing Machine', 'Elliptical',
        'Jump Rope', 'Stair Climber', 'Battle Ropes', 'Sprints', 'Box Jumps',
    ],
    Other: [
        'Plank', 'Ab Crunch', 'Hanging Leg Raise', 'Russian Twist', 'Cable Crunch',
        'Farmer Walk', 'Kettlebell Swing', 'Clean and Press', 'Snatch', 'Turkish Get Up',
    ],
};

const ALL_EXERCISES = Object.values(EXERCISE_DB).flat();

const getWorkoutSplitFromTask = (tasks: any[], date: string) => {
    const workoutTask = tasks.find(t => {
        if (t.date !== date) return false;
        const tl = t.title.toLowerCase();
        return tl.includes('gym') || tl.startsWith('push') || tl.startsWith('pull') || tl === 'legs';
    });
    if (!workoutTask) return null;
    if (workoutTask.title.toLowerCase().startsWith('gym')) {
        const match = workoutTask.title.match(/\((.+)\)\s*$/);
        return match ? match[1] : workoutTask.title;
    }
    return workoutTask.title;
};

function normalizeType(sportName: string, workoutLabel?: string, split?: string | null): string {
    let type = workoutLabel || sportName || 'Other';
    // Map legacy labels to sub-types (first push = chest, first pull = bicep)
    if (type === 'Leg Day' || type === 'Leg') type = 'Legs';
    else if (type === 'Push Day') type = 'Push (Chest)';
    else if (type === 'Pull Day') type = 'Pull (Bicep)';
    else if (type === 'Push') type = 'Push (Chest)';
    else if (type === 'Pull') type = 'Pull (Bicep)';

    // If an explicit workout_label was provided (user manually labeled), respect it
    if (workoutLabel && workoutLabel !== sportName) return type;

    // Only use split from daily tasks if no explicit label was set
    const isLifting = ['Functional Fitness', 'Weightlifting', 'Gym', 'Powerlifting', 'CrossFit', 'Box Fitness'].includes(sportName);
    if (split && isLifting) {
        // Handle sub-type formats: "Push (Chest)", "Pull (Back)", "Push Chest", "Pull Back", etc.
        if (/^push\s*\(chest\)$/i.test(split) || /^push\s+chest$/i.test(split)) type = 'Push (Chest)';
        else if (/^push\s*\(tricep\)$/i.test(split) || /^push\s+tricep$/i.test(split)) type = 'Push (Tricep)';
        else if (/^pull\s*\(back\)$/i.test(split) || /^pull\s+back$/i.test(split)) type = 'Pull (Back)';
        else if (/^pull\s*\(bicep\)$/i.test(split) || /^pull\s+bicep$/i.test(split)) type = 'Pull (Bicep)';
        else if (split === 'Leg Day' || split === 'Legs') type = 'Legs';
        else if (split === 'Push Day' || split === 'Push') type = 'Push (Chest)';
        else if (split === 'Pull Day' || split === 'Pull') type = 'Pull (Bicep)';
        else type = split;
    }

    if (type === 'Activity' || type === 'General Activity' || type === 'Sport -1') type = 'Other';
    if (type === 'Functional Fitness') type = 'Gym';
    // Normalize WHOOP API hyphenated sport names
    const lower = type.toLowerCase();
    if (lower === 'hiking-rucking' || lower === 'hiking' || lower === 'rucking') type = 'Hiking';
    else if (lower === 'walking' || lower === 'walk') type = 'Walk';
    return type;
}

function formatDuration(minutes: number | null | undefined): string {
    if (!minutes || minutes <= 0) return '';
    const rounded = Math.round(minutes);
    if (rounded >= 60) {
        const h = Math.floor(rounded / 60);
        const m = rounded % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${rounded}m`;
}

interface SetEntry {
    sets: number | null;
    reps: number | null;
    weight: number | null;
}

interface Exercise {
    id?: string;
    exercise_name: string;
    set_entries: SetEntry[];
    weight_unit: string;
    notes: string;
}

// ─── Autocomplete input ───
function ExerciseAutocomplete({ value, onChange, workoutType }: { value: string; onChange: (v: string) => void; workoutType?: string }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(value);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Get suggestions: prioritize current workout type, then all
    const suggestions = useMemo(() => {
        // Map displayType to base EXERCISE_DB key
        const baseType = workoutType?.startsWith('Push') ? 'Push'
            : workoutType?.startsWith('Pull') ? 'Pull'
                : workoutType === 'Legs' ? 'Legs'
                    : workoutType === 'Cardio' ? 'Cardio'
                        : workoutType && EXERCISE_DB[workoutType] ? workoutType
                            : 'Other';
        const q = query.toLowerCase().trim();
        if (!q) {
            // Show workout-type-specific exercises first
            const primary = EXERCISE_DB[baseType] || [];
            const rest = ALL_EXERCISES.filter(e => !primary.includes(e));
            return [...primary, ...rest].slice(0, 12);
        }
        const primary = (EXERCISE_DB[baseType] || []).filter(e => e.toLowerCase().includes(q));
        const rest = ALL_EXERCISES.filter(e => e.toLowerCase().includes(q) && !primary.includes(e));
        return [...primary, ...rest].slice(0, 8);
    }, [query, workoutType]);

    useEffect(() => { setQuery(value); }, [value]);

    return (
        <div className="relative flex-1">
            <input
                ref={inputRef}
                type="text"
                placeholder="Exercise name"
                value={query}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => { setTimeout(() => setOpen(false), 150); onChange(query); }}
                onKeyDown={e => { if (e.key === 'Enter') { onChange(query); setOpen(false); inputRef.current?.blur(); } }}
                className="w-full bg-transparent text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-muted/30 focus:outline-none font-medium"
            />
            {open && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-athena-bg border border-athena-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {suggestions.map((s, i) => (
                        <button
                            key={i}
                            onMouseDown={e => { e.preventDefault(); setQuery(s); onChange(s); setOpen(false); }}
                            className={cn(
                                "w-full text-left px-3 py-1.5 text-[12px] hover:bg-athena-gold/10 transition-colors",
                                s.toLowerCase() === query.toLowerCase() ? "text-athena-gold font-semibold" : "text-athena-text-primary"
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function DevelopmentWorkoutsWorkspace() {
    const supabase = createClient();
    const { whoopEnabled } = useWhoopMode();
    const [workouts, setWorkouts] = useState<any[]>([]);
    const [historyWorkouts, setHistoryWorkouts] = useState<any[]>([]);
    const [dailyTasks, setDailyTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // Workout type management
    const [liftingTypes, setLiftingTypes] = useState<string[]>(DEFAULT_LIFTING_TYPES);
    const [manageTypesOpen, setManageTypesOpen] = useState(false);
    const [newTypeInput, setNewTypeInput] = useState('');

    useEffect(() => {
        const stored = getStoredLiftingTypes();
        setLiftingTypes(stored);
        LABEL_OPTIONS = [...stored, ...FIXED_CATEGORIES];
    }, []);

    const updateLiftingTypes = (types: string[]) => {
        setLiftingTypes(types);
        LABEL_OPTIONS = [...types, ...FIXED_CATEGORIES];
        localStorage.setItem('athena_workout_types', JSON.stringify(types));
    };

    // Manual workout entry state (used when WHOOP is disabled, or as secondary entry)
    const [manualWorkoutOpen, setManualWorkoutOpen] = useState(false);
    const [manualWorkoutType, setManualWorkoutType] = useState('Push (Chest)');
    const [manualWorkoutDuration, setManualWorkoutDuration] = useState('');
    const [manualWorkoutNotes, setManualWorkoutNotes] = useState('');
    const [manualWorkoutSaving, setManualWorkoutSaving] = useState(false);

    const handleManualWorkoutSave = async () => {
        if (!manualWorkoutType) return;
        setManualWorkoutSaving(true);
        try {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const { error } = await supabase.from('whoop_workouts').insert({
                user_id: SINGLE_USER_ID,
                whoop_id: `manual-${todayStr}-${Date.now()}`,
                date: todayStr,
                sport_name: 'Weight Training',
                duration_minutes: manualWorkoutDuration ? parseInt(manualWorkoutDuration, 10) : null,
                strain: null,
                calories: null,
                workout_label: manualWorkoutType,
            });
            if (error) throw error;

            // Mark matching gym daily task as completed
            const { data: gymTasks } = await supabase
                .from('daily_tasks')
                .select('id, title')
                .eq('date', todayStr)
                .ilike('title', '%gym%')
                .neq('status', 'Completed');
            if (gymTasks && gymTasks.length > 0) {
                const match = gymTasks.find(t => t.title.toLowerCase().includes(manualWorkoutType.toLowerCase())) || gymTasks[0];
                await supabase.from('daily_tasks').update({ status: 'Completed' }).eq('id', match.id);
            }

            toast.success('Workout logged');
            setManualWorkoutOpen(false);
            setManualWorkoutType('Push (Chest)');
            setManualWorkoutDuration('');
            setManualWorkoutNotes('');
            fetchData();
        } catch (e: any) {
            console.error('Failed to save manual workout:', e);
            toast.error('Failed to save workout');
        } finally {
            setManualWorkoutSaving(false);
        }
    };

    const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
    const [editingExerciseIdx, setEditingExerciseIdx] = useState<number | null>(null);
    const [exerciseSearch, setExerciseSearch] = useState('');
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [previousExercises, setPreviousExercises] = useState<any[]>([]);
    const [exercisesLoading, setExercisesLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [customLabelId, setCustomLabelId] = useState<string | null>(null);
    const [customLabelText, setCustomLabelText] = useState('');
    const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
    const [volumeExercises, setVolumeExercises] = useState<Record<string, any[]>>({});
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [workoutNotes, setWorkoutNotes] = useState('');

    // Golf state
    type GolfHole = { par: number | null; score: number | null };
    type GolfRoundData = { course_name: string; holes: GolfHole[]; notes: string };
    const [golfRound, setGolfRound] = useState<GolfRoundData | null>(null);
    const [golfHistory, setGolfHistory] = useState<any[]>([]);
    const [golfLoading, setGolfLoading] = useState(false);
    const [golfScores, setGolfScores] = useState<Record<string, { score: number; par: number }>>({});

    const emptyHoles = (): GolfHole[] => Array.from({ length: 18 }, () => ({ par: null, score: null }));

    // Week plan state (Supabase-backed)
    const [weekPlan, setWeekPlan] = useState<Record<string, string>>({});
    const [weekPlanNotes, setWeekPlanNotes] = useState<Record<string, string>>({});
    const [weekPlanOpen, setWeekPlanOpen] = useState(false);

    // Filter state
    const [activeFilter, setActiveFilter] = useState<string>('All');

    // Workout templates (localStorage)
    type TemplateExercise = { exercise_name: string };
    const [workoutTemplates, setWorkoutTemplates] = useState<Record<string, TemplateExercise[]>>({});
    const [templateViewType, setTemplateViewType] = useState<string | null>(null);
    const [templateEditing, setTemplateEditing] = useState(false);
    const [templateAddOpen, setTemplateAddOpen] = useState(false);

    // Coach state
    type CoachResult = { notes: string[]; exerciseSuggestions: string[]; weightNotes: Record<string, string>; warmUp: Record<string, string>; exerciseOrder: string[]; nextSessionTargets: Record<string, string>; warnings: string[]; intensity: string; type: string; timestamp: number };
    const [preCoachMap, setPreCoachMap] = useState<Record<string, CoachResult>>({});
    const [postCoachMap, setPostCoachMap] = useState<Record<string, CoachResult>>({});
    const [coachLoading, setCoachLoading] = useState<'pre' | 'post' | null>(null);
    const [weeklyPlanLoading, setWeeklyPlanLoading] = useState(false);
    const [weeklyReasoning, setWeeklyReasoning] = useState<string | null>(null);
    const [weeklyGapAlert, setWeeklyGapAlert] = useState<string | null>(null);
    const [todayRecovery, setTodayRecovery] = useState<number | null>(null);
    const [todayWhoop, setTodayWhoop] = useState<any>(null);
    const [yesterdayWhoop, setYesterdayWhoop] = useState<any>(null);
    const [lastWorkoutExercises, setLastWorkoutExercises] = useState<Record<string, any[]>>({});
    const [whoopTrends, setWhoopTrends] = useState<{
        hrvBaseline: number | null; hrvTrend: 'rising' | 'falling' | 'stable' | null; hrv3Day: number | null;
        recoveryBaseline: number | null; recoveryTrend: 'rising' | 'falling' | 'stable' | null; recovery3Day: number | null;
        restingHrBaseline: number | null; restingHrTrend: 'rising' | 'falling' | 'stable' | null; restingHr3Day: number | null;
    }>({ hrvBaseline: null, hrvTrend: null, hrv3Day: null, recoveryBaseline: null, recoveryTrend: null, recovery3Day: null, restingHrBaseline: null, restingHrTrend: null, restingHr3Day: null });

    // Load week plan from Supabase + templates from localStorage
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/productivity/workouts/weekly-plan');
                if (!res.ok) return;
                const text = await res.text();
                if (!text || text.startsWith('<!')) return;
                const data = JSON.parse(text);
                if (data.plan) {
                    // Convert plan JSONB { "Sun": { type, note }, ... } to flat maps
                    const flat: Record<string, string> = {};
                    const notes: Record<string, string> = {};
                    Object.entries(data.plan).forEach(([day, val]: [string, any]) => {
                        const t = typeof val === 'string' ? val : val?.type;
                        const n = typeof val === 'object' ? val?.note : null;
                        if (t && t !== 'Rest') flat[day] = t;
                        if (n) notes[day] = n;
                    });
                    setWeekPlan(flat);
                    setWeekPlanNotes(notes);
                    // Set template view to today's planned workout
                    const todayLabel = format(new Date(), 'EEE');
                    if (flat[todayLabel]) setTemplateViewType(flat[todayLabel]);
                }
                if (data.reasoning) setWeeklyReasoning(data.reasoning);
                if (data.gapAlert) setWeeklyGapAlert(data.gapAlert);
            } catch (e) { console.error('Failed to load weekly plan:', e); }
        })();
        try {
            const saved = localStorage.getItem('workout-templates');
            if (saved) {
                setWorkoutTemplates(JSON.parse(saved));
            } else {
                // Default templates
                const defaults: Record<string, TemplateExercise[]> = {
                    'Push (Chest)': [
                        { exercise_name: 'Incline Dumbbell Press' },
                        { exercise_name: 'Machine Shoulder Press' },
                        { exercise_name: 'Bench Press' },
                        { exercise_name: 'Lateral Raise' },
                        { exercise_name: 'Pec Deck' },
                        { exercise_name: 'Incline Cable Fly' },
                    ],
                    'Push (Tricep)': [
                        { exercise_name: 'Dumbbell Bench Press' },
                        { exercise_name: 'Incline Bench Press' },
                        { exercise_name: 'Tricep Pushdown' },
                        { exercise_name: 'Overhead Tricep Extension' },
                        { exercise_name: 'Cable Fly' },
                        { exercise_name: 'Front Raise' },
                    ],
                    'Pull (Bicep)': [
                        { exercise_name: 'Cable Curl' },
                        { exercise_name: 'Preacher Curl' },
                        { exercise_name: 'Reverse Barbell Curl' },
                        { exercise_name: 'Cable Row' },
                        { exercise_name: 'Hammer Curl' },
                        { exercise_name: 'Dumbbell Shrugs' },
                    ],
                    'Pull (Back)': [
                        { exercise_name: 'Machine Row' },
                        { exercise_name: 'Seated Cable Row' },
                        { exercise_name: 'Face Pulls' },
                        { exercise_name: 'Lat Pulldown' },
                        { exercise_name: 'Dumbbell Curl' },
                        { exercise_name: 'Barbell Curl' },
                    ],
                    'Legs': [
                        { exercise_name: 'Leg Press' },
                        { exercise_name: 'Leg Extension' },
                        { exercise_name: 'Calf Raise' },
                        { exercise_name: 'Abductor Machine' },
                        { exercise_name: 'Leg Curl' },
                    ],
                };
                setWorkoutTemplates(defaults);
                localStorage.setItem('workout-templates', JSON.stringify(defaults));
            }
        } catch (e) { console.error('Failed to load workout templates:', e); }
    }, []);

    useEffect(() => {
        try {
            const cache = localStorage.getItem('coach-cache');
            if (cache) {
                const parsed = JSON.parse(cache);
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const preMap: Record<string, CoachResult> = {};
                const postMap: Record<string, CoachResult> = {};
                const cleaned: Record<string, any> = {};
                for (const [key, val] of Object.entries(parsed)) {
                    const v = val as CoachResult;
                    if (key.startsWith('pre-') && key.startsWith(`pre-${todayStr}`) && Date.now() - v.timestamp < 24 * 60 * 60 * 1000) {
                        const wType = key.replace(`pre-${todayStr}-`, '');
                        preMap[wType] = v;
                        cleaned[key] = v;
                    } else if (key.startsWith('post-') && Date.now() - v.timestamp < 24 * 60 * 60 * 1000) {
                        const wId = key.replace('post-', '');
                        postMap[wId] = v;
                        cleaned[key] = v;
                    }
                    // Stale entries (wrong day or expired) are dropped
                }
                // Write back only valid entries
                localStorage.setItem('coach-cache', JSON.stringify(cleaned));
                if (Object.keys(preMap).length > 0) setPreCoachMap(preMap);
                if (Object.keys(postMap).length > 0) setPostCoachMap(postMap);
            }
        } catch { }
    }, []);

    // Rehydrate pre-coach notes from DB (covers auto-generated notes from sync pipeline)
    useEffect(() => {
        (async () => {
            try {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const { data: dbPreNotes } = await supabase
                    .from('coach_notes')
                    .select('workout_type, notes, exercise_suggestions, weight_notes, intensity, coach_type, next_session_targets, warm_up, exercise_order, warnings')
                    .eq('coach_type', 'pre')
                    .gte('created_at', todayStr + 'T00:00:00')
                    .lte('created_at', todayStr + 'T23:59:59')
                    .order('created_at', { ascending: false });

                if (dbPreNotes && dbPreNotes.length > 0) {
                    setPreCoachMap(prev => {
                        const updated = { ...prev };
                        for (const n of dbPreNotes) {
                            // Only hydrate if not already in memory (localStorage took priority)
                            if (!updated[n.workout_type]) {
                                updated[n.workout_type] = {
                                    notes: n.notes || [],
                                    exerciseSuggestions: n.exercise_suggestions || [],
                                    weightNotes: n.weight_notes || {},
                                    warmUp: n.warm_up || {},
                                    exerciseOrder: n.exercise_order || [],
                                    nextSessionTargets: n.next_session_targets || {},
                                    warnings: n.warnings || [],
                                    intensity: n.intensity || 'maintain',
                                    type: 'pre',
                                    timestamp: Date.now(),
                                };
                            }
                        }
                        return updated;
                    });
                }
            } catch { }
        })();
    }, []);

    useEffect(() => {
        if (!whoopEnabled) return;
        (async () => {
            try {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const fourteenDaysAgo = new Date();
                fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
                const fourteenDaysAgoStr = format(fourteenDaysAgo, 'yyyy-MM-dd');
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

                const [todayRes, yesterdayRes, historyRes] = await Promise.all([
                    supabase.from('whoop_data').select('*').eq('date', todayStr).single(),
                    supabase.from('whoop_data').select('*').eq('date', yesterdayStr).single(),
                    supabase.from('whoop_data').select('date, recovery_score, hrv, resting_hr, strain')
                        .gte('date', fourteenDaysAgoStr).lte('date', todayStr)
                        .order('date', { ascending: false }),
                ]);

                if (todayRes.data?.recovery_score != null) setTodayRecovery(todayRes.data.recovery_score);
                if (todayRes.data) setTodayWhoop(todayRes.data);
                if (yesterdayRes.data) setYesterdayWhoop(yesterdayRes.data);

                // Compute trends from 14-day history
                const history = historyRes.data || [];
                if (history.length >= 3) {
                    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
                    const trend = (recent: number | null, baseline: number | null): 'rising' | 'falling' | 'stable' | null => {
                        if (recent == null || baseline == null) return null;
                        const pctChange = ((recent - baseline) / baseline) * 100;
                        if (pctChange > 5) return 'rising';
                        if (pctChange < -5) return 'falling';
                        return 'stable';
                    };

                    const hrvValues = history.map(d => d.hrv).filter((v: any): v is number => v != null);
                    const recoveryValues = history.map(d => d.recovery_score).filter((v: any): v is number => v != null);
                    const restingHrValues = history.map(d => d.resting_hr).filter((v: any): v is number => v != null);

                    const hrvBaseline = avg(hrvValues);
                    const hrv3Day = avg(hrvValues.slice(0, 3));
                    const recoveryBaseline = avg(recoveryValues);
                    const recovery3Day = avg(recoveryValues.slice(0, 3));
                    const restingHrBaseline = avg(restingHrValues);
                    const restingHr3Day = avg(restingHrValues.slice(0, 3));

                    setWhoopTrends({
                        hrvBaseline, hrvTrend: trend(hrv3Day, hrvBaseline), hrv3Day,
                        recoveryBaseline, recoveryTrend: trend(recovery3Day, recoveryBaseline), recovery3Day,
                        restingHrBaseline, restingHrTrend: trend(restingHr3Day, restingHrBaseline), restingHr3Day,
                    });
                }
            } catch (e) { console.error('[Coach] Whoop error:', e); toast.error('Failed to load WHOOP data'); }
        })();
    }, [whoopEnabled]);

    const saveTemplates = useCallback((templates: Record<string, TemplateExercise[]>) => {
        setWorkoutTemplates(templates);
        localStorage.setItem('workout-templates', JSON.stringify(templates));
    }, []);

    const updateWeekPlan = useCallback((dayLabel: string, split: string | null) => {
        setWeekPlan(prev => {
            const oldType = prev[dayLabel];
            const next = { ...prev };
            if (split) next[dayLabel] = split;
            else delete next[dayLabel];

            // Clear the AI-generated note for the changed day
            const updatedNotes = { ...weekPlanNotes };
            if (split && split !== oldType) {
                updatedNotes[dayLabel] = 'Manual override';
            } else if (!split) {
                delete updatedNotes[dayLabel];
            }
            setWeekPlanNotes(updatedNotes);

            // Persist to database
            fetch('/api/productivity/workouts/weekly-plan', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: next, notes: updatedNotes }),
            }).catch(err => console.error('Failed to save week plan:', err));

            // If today's workout type changed, clean up stale coach notes and update the daily task
            const todayDayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
            if (dayLabel === todayDayLabel && oldType && split && split !== oldType) {
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                (async () => {
                    try {
                        // Delete stale pre-coach notes for the old type
                        await supabase.from('coach_notes')
                            .delete()
                            .eq('workout_type', oldType)
                            .eq('coach_type', 'pre')
                            .gte('created_at', todayStr + 'T00:00:00')
                            .lt('created_at', todayStr + 'T23:59:59');

                        // Clear cached coach data for the old type
                        setPreCoachMap(prev => {
                            const updated = { ...prev };
                            delete updated[oldType];
                            return updated;
                        });

                        // Update the daily_task title for today
                        const { data: taskData } = await supabase.from('daily_tasks')
                            .select('id')
                            .eq('date', todayStr)
                            .or('title.ilike.%gym%,title.ilike.%push%,title.ilike.%pull%,title.ilike.legs')
                            .limit(1);

                        if (taskData && taskData.length > 0) {
                            await supabase.from('daily_tasks')
                                .update({ title: split })
                                .eq('id', taskData[0].id);
                        }
                    } catch (err) {
                        console.error('Failed to clean up after plan change:', err);
                    }
                })();
            }

            return next;
        });
    }, [weekPlanNotes, supabase]);

    useEffect(() => {
        fetchData();
    }, [currentDate]);

    async function fetchData() {
        setLoading(true);
        const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
        const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');
        // Also fetch last 90 days for comparison data
        const historyStart = format(subMonths(startOfMonth(currentDate), 3), 'yyyy-MM-dd');

        try {
            const [workoutsRes, historyRes, { data: tasksData }] = await Promise.all([
                fetch(`/api/productivity/workouts?start_date=${start}&end_date=${end}`),
                fetch(`/api/productivity/workouts?start_date=${historyStart}&end_date=${format(subDays(startOfMonth(currentDate), 1), 'yyyy-MM-dd')}`),
                supabase.from('daily_tasks').select('*').gte('date', historyStart).lte('date', end).ilike('title', '%gym%')
            ]);

            if (!workoutsRes.ok || !historyRes.ok) {
                throw new Error('Failed to load workouts');
            }
            const workoutsText = await workoutsRes.text();
            const historyText = await historyRes.text();
            if (workoutsText.startsWith('<!') || historyText.startsWith('<!')) {
                throw new Error('Session expired - please refresh');
            }
            const workoutsData = JSON.parse(workoutsText);
            const historyData = JSON.parse(historyText);
            setWorkouts(workoutsData.workouts || []);
            setHistoryWorkouts(historyData.workouts || []);
            setDailyTasks(tasksData || []);


            // Fetch exercise counts for all workouts
            const workoutIds = (workoutsData.workouts || []).map((w: any) => w.id);
            if (workoutIds.length > 0) {
                const { data: exData } = await supabase
                    .from('workout_exercises')
                    .select('workout_id')
                    .in('workout_id', workoutIds);
                const counts: Record<string, number> = {};
                (exData || []).forEach((row: any) => {
                    counts[row.workout_id] = (counts[row.workout_id] || 0) + 1;
                });
                setExerciseCounts(counts);
            }

            // Fetch exercise set_entries for volume calculation
            if (workoutIds.length > 0) {
                const { data: volData } = await supabase
                    .from('workout_exercises')
                    .select('workout_id, exercise_name, set_entries')
                    .in('workout_id', workoutIds);
                const volMap: Record<string, any[]> = {};
                (volData || []).forEach((row: any) => {
                    if (!volMap[row.workout_id]) volMap[row.workout_id] = [];
                    volMap[row.workout_id].push(row);
                });
                setVolumeExercises(volMap);
            }

            // Fetch golf scores via API (bypasses RLS)
            try {
                const golfRes = await fetch('/api/productivity/golf');
                const golfJson = await golfRes.json();
                const scores: Record<string, { score: number; par: number }> = {};
                (golfJson.rounds || []).forEach((row: any) => {
                    const holes = row.holes || [];
                    const totalScore = holes.reduce((s: number, h: any) => s + (h.score || 0), 0);
                    const totalPar = holes.reduce((s: number, h: any) => s + (h.par || 0), 0);
                    if (totalScore > 0) scores[row.workout_id] = { score: totalScore, par: totalPar };
                });
                setGolfScores(scores);
            } catch (e) { console.error('Failed to load golf scores:', e); }

        } catch (err) {
            console.error('Failed to fetch workouts', err);
            toast.error('Failed to load workouts');
        } finally {
            setLoading(false);
        }
    }

    // Process workouts with type normalization (same logic as StrainPanel)
    const GYM_SPORT_NAMES = ['Functional Fitness', 'Weightlifting', 'Weight Training', 'Powerlifting', 'CrossFit', 'Box Fitness', 'Gym'];

    const resolveType = useCallback((w: any) => {
        const split = getWorkoutSplitFromTask(dailyTasks, w.date);
        // Prioritize workout_label; for unlabeled gym sports, show "Gym" instead of raw sport name
        let type = w.workout_label
            || (GYM_SPORT_NAMES.includes(w.sport_name) ? 'Gym' : w.sport_name)
            || 'Other';

        // Normalize legacy labels
        if (type === 'Leg Day' || type === 'Leg') type = 'Legs';
        else if (type === 'Push Day') type = 'Push (Chest)';
        else if (type === 'Pull Day') type = 'Pull (Bicep)';
        else if (type === 'Push') type = 'Push (Chest)';
        else if (type === 'Pull') type = 'Pull (Bicep)';

        // If user explicitly set workout_label, respect it
        if (w.workout_label && w.workout_label !== w.sport_name) {
            return { ...w, displayType: type, color: TYPE_COLORS[type] || '#6b7280' };
        }

        const isLifting = GYM_SPORT_NAMES.includes(w.sport_name);
        if (split && isLifting) {
            if (/^push\s*\(chest\)$/i.test(split) || /^push\s+chest$/i.test(split)) type = 'Push (Chest)';
            else if (/^push\s*\(tricep\)$/i.test(split) || /^push\s+tricep$/i.test(split)) type = 'Push (Tricep)';
            else if (/^pull\s*\(back\)$/i.test(split) || /^pull\s+back$/i.test(split)) type = 'Pull (Back)';
            else if (/^pull\s*\(bicep\)$/i.test(split) || /^pull\s+bicep$/i.test(split)) type = 'Pull (Bicep)';
            else if (split === 'Leg Day' || split === 'Legs') type = 'Legs';
            else if (split === 'Push Day' || split === 'Push') type = 'Push (Chest)';
            else if (split === 'Pull Day' || split === 'Pull') type = 'Pull (Bicep)';
            else type = split;
        }

        if (type === 'Activity' || type === 'General Activity' || type === 'Sport -1') type = 'Other';
        // Normalize WHOOP API hyphenated sport names
        const lower = type.toLowerCase();
        if (lower === 'hiking-rucking' || lower === 'hiking' || lower === 'rucking') type = 'Hiking';
        else if (lower === 'walking' || lower === 'walk') type = 'Walk';
        return { ...w, displayType: type, color: TYPE_COLORS[type] || '#6b7280' };
    }, [dailyTasks]);

    const processed = useMemo(() => {
        return workouts
            .filter(w => w.sport_name !== 'Sport -1' || w.workout_label)
            .map(resolveType)
            .filter(w => !['Steam Room', 'Steam-room', 'Sauna', 'Ice Bath', 'Ice-bath'].includes(w.displayType))
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [workouts, resolveType]);

    // All processed workouts (current + history) for comparison lookups — deduplicated by ID
    const allProcessed = useMemo(() => {
        const seen = new Set<string>();
        const all = [...workouts, ...historyWorkouts].filter(w => {
            if (seen.has(w.id)) return false;
            seen.add(w.id);
            return true;
        });
        return all
            .filter(w => w.sport_name !== 'Sport -1' || w.workout_label)
            .map(resolveType)
            .filter(w => !['Steam Room', 'Steam-room', 'Sauna', 'Ice Bath', 'Ice-bath'].includes(w.displayType))
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [workouts, historyWorkouts, resolveType]);

    // Group by date for feed
    const groupedByDate = useMemo(() => {
        const map: Record<string, typeof processed> = {};
        processed.forEach(w => {
            if (!map[w.date]) map[w.date] = [];
            map[w.date].push(w);
        });
        return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
    }, [processed]);

    // Filtered grouped by date
    const filteredGroupedByDate = useMemo(() => {
        if (activeFilter === 'All') return groupedByDate;
        return groupedByDate
            .map(([date, dayWorkouts]) => [date, dayWorkouts.filter(w => w.displayType === activeFilter)] as [string, typeof processed])
            .filter(([, dayWorkouts]) => dayWorkouts.length > 0);
    }, [groupedByDate, activeFilter]);

    // Unique types for filter pills
    const uniqueTypes = useMemo(() => {
        const types = new Set(processed.map(w => w.displayType));
        return ['All', ...Array.from(types).sort()];
    }, [processed]);

    // Build previous workout lookup for comparison deltas
    const previousByType = useMemo(() => {
        const map: Record<string, any> = {};
        // Use allProcessed (includes history) for cross-month comparison
        const lastSeen: Record<string, any> = {};
        const reversed = [...allProcessed].reverse();
        reversed.forEach(w => {
            if (lastSeen[w.displayType]) {
                map[w.id] = lastSeen[w.displayType];
            }
            lastSeen[w.displayType] = w;
        });
        return map;
    }, [allProcessed]);

    // Coach fetch helper — workoutDate is the date of the workout being analyzed (supports retroactive logging)
    async function fetchCoach(type: 'pre' | 'post', workoutType: string, todayExercises?: any[], currentWorkoutId?: string, workoutDate?: string) {
        setCoachLoading(type);
        try {
            // Use workout date for all time-relative calculations (not today's date)
            const referenceDate = workoutDate ? new Date(workoutDate + 'T12:00:00') : new Date();
            const referenceDateStr = format(referenceDate, 'yyyy-MM-dd');

            // Get recent history: same type, BEFORE the workout date, exclude current workout
            const sameType = allProcessed.filter(w =>
                w.displayType === workoutType && w.id !== currentWorkoutId && w.date < referenceDateStr
            ).slice(0, 3);
            const historyWithExercises = await Promise.all(sameType.map(async w => {
                try {
                    const res = await fetch(`/api/productivity/workouts/exercises?workout_id=${w.id}`);
                    const data = await res.json();
                    return { date: w.date, strain: w.strain, exercises: data.exercises || [] };
                } catch { return { date: w.date, strain: w.strain, exercises: [] }; }
            }));

            const template = workoutTemplates[workoutType] || [];

            // Fetch sibling workout type exercises (e.g., Pull (Back) ↔ Pull (Bicep))
            const SIBLING_MAP: Record<string, string> = {
                'Push (Chest)': 'Push (Tricep)', 'Push (Tricep)': 'Push (Chest)',
                'Pull (Back)': 'Pull (Bicep)', 'Pull (Bicep)': 'Pull (Back)',
            };
            const siblingType = SIBLING_MAP[workoutType];
            let siblingContext: { type: string; exercises: string[] } | null = null;
            if (siblingType) {
                const siblingWorkout = allProcessed.find(w => w.displayType === siblingType && w.date <= referenceDateStr);
                if (siblingWorkout) {
                    try {
                        const res = await fetch(`/api/productivity/workouts/exercises?workout_id=${siblingWorkout.id}`);
                        const data = await res.json();
                        const exerciseNames = (data.exercises || []).map((e: any) => e.exercise_name);
                        if (exerciseNames.length > 0) {
                            siblingContext = { type: siblingType, exercises: exerciseNames };
                        }
                    } catch { }
                }
            }

            // Get strain from last same-type workout BEFORE this workout
            const lastSameType = allProcessed.find(w => w.displayType === workoutType && w.id !== currentWorkoutId && w.date < referenceDateStr);
            const lastTypeStrain = lastSameType?.strain || null;

            // Fetch previous coach notes (before the workout date, not today)
            let previousCoachNotes: any[] = [];
            try {
                const cutoff = referenceDateStr + 'T00:00:00';
                const { data: prevNotes } = await supabase
                    .from('coach_notes')
                    .select('coach_type, notes, exercise_suggestions, weight_notes, intensity, created_at')
                    .eq('workout_type', workoutType)
                    .lt('created_at', cutoff)
                    .order('created_at', { ascending: false })
                    .limit(6);
                if (prevNotes) previousCoachNotes = prevNotes;
            } catch { }

            // Compute progressive overload metrics from exercise history
            const exerciseHistory: Record<string, { weights: number[]; volumes: number[]; dates: string[] }> = {};
            // Include this workout's exercises for post-workout analysis
            const allSessions = [...historyWithExercises];
            if (type === 'post' && todayExercises?.length) {
                allSessions.unshift({ date: referenceDateStr, strain: 0, exercises: todayExercises });
            }
            allSessions.forEach((session: any) => {
                (session.exercises || []).forEach((ex: any) => {
                    const name = ex.exercise_name;
                    if (!exerciseHistory[name]) exerciseHistory[name] = { weights: [], volumes: [], dates: [] };
                    let maxWeight = 0;
                    let sessionVolume = 0;
                    (ex.set_entries || []).forEach((s: any) => {
                        const w = s.weight || 0;
                        const r = s.reps || 0;
                        const sets = s.sets || 1;
                        if (w > maxWeight) maxWeight = w;
                        sessionVolume += sets * r * w;
                    });
                    exerciseHistory[name].weights.push(maxWeight);
                    exerciseHistory[name].volumes.push(sessionVolume);
                    exerciseHistory[name].dates.push(session.date);
                });
            });

            const progressiveOverload: Record<string, any> = {};
            Object.entries(exerciseHistory).forEach(([name, data]) => {
                const prWeight = Math.max(...data.weights);
                const prVolume = Math.max(...data.volumes);
                const currentWeight = data.weights[0]; // most recent
                const currentVolume = data.volumes[0];
                const isPR = data.weights.length > 1 && currentWeight >= prWeight;
                const isVolumePR = data.volumes.length > 1 && currentVolume >= prVolume;
                // Plateau: same max weight for 3+ sessions
                const plateau = data.weights.length >= 3 && data.weights.slice(0, 3).every(w => w === data.weights[0]);
                progressiveOverload[name] = {
                    prWeight,
                    prVolume,
                    currentWeight,
                    currentVolume,
                    isPR,
                    isVolumePR,
                    plateau,
                    sessions: data.weights.length,
                    volumeTrend: data.volumes.length >= 2 ? data.volumes[0] - data.volumes[1] : 0,
                };
            });

            // Find prior day's workout relative to the workout date
            const priorDayStr = format(subDays(referenceDate, 1), 'yyyy-MM-dd');
            const yesterdayWorkouts = allProcessed.filter(w => w.date === priorDayStr);
            const priorDayWorkoutType = yesterdayWorkouts.length > 0 ? yesterdayWorkouts[0].displayType : null;

            // Compute days since last same workout type
            const lastSameTypeDate = lastSameType?.date ? new Date(lastSameType.date + 'T12:00:00') : null;
            const daysSinceLast = lastSameTypeDate ? Math.round((referenceDate.getTime() - lastSameTypeDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

            // Compute weekly accumulated load relative to workout date
            const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 }); // Monday
            const weekWorkouts = allProcessed.filter(w => {
                const wDate = new Date(w.date + 'T12:00:00');
                return wDate >= weekStart && wDate <= referenceDate;
            });
            const weeklyAccumulatedStrain = weekWorkouts.reduce((sum, w) => sum + (w.strain || 0), 0);
            const weeklySessionCount = weekWorkouts.length;

            // For retroactive reviews, let the server-side coach API fetch WHOOP data
            // (it uses service role key which bypasses any client-side access issues)
            const isRetroactive = referenceDateStr !== format(new Date(), 'yyyy-MM-dd');

            const res = await fetch('/api/productivity/workouts/coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    workoutType,
                    recoveryScore: isRetroactive ? null : todayRecovery,
                    lastTypeStrain,
                    template,
                    recentHistory: historyWithExercises,
                    todayExercises: todayExercises || [],
                    previousCoachNotes,
                    progressiveOverload,
                    siblingContext,
                    // For retroactive reviews, pass null — the server will fetch correct data
                    sleepHours: isRetroactive ? null : (todayWhoop?.sleep_hours ?? null),
                    sleepPerformance: isRetroactive ? null : (todayWhoop?.sleep_performance ?? null),
                    hrv: isRetroactive ? null : (todayWhoop?.hrv ?? null),
                    restingHr: isRetroactive ? null : (todayWhoop?.resting_hr ?? null),
                    priorDayStrain: isRetroactive ? null : (yesterdayWhoop?.strain ?? null),
                    priorDayWorkoutType,
                    sleepDebt: isRetroactive ? null : (todayWhoop?.sleep_debt_minutes ?? null),
                    skinTemp: isRetroactive ? null : (todayWhoop?.skin_temp_celsius ?? null),
                    respiratoryRate: isRetroactive ? null : (todayWhoop?.respiratory_rate ?? null),
                    todayStrain: isRetroactive ? null : (todayWhoop?.strain ?? null),
                    // Trend data
                    whoopTrends: isRetroactive ? null : whoopTrends,
                    fetchWhoopForDate: isRetroactive,
                    daysSinceLast,
                    weeklyAccumulatedStrain,
                    weeklySessionCount,
                    // Weekly plan note for workout date
                    weekPlanNote: weekPlanNotes[format(referenceDate, 'EEE')] || null,
                    workoutDate: referenceDateStr,
                    // Athlete's freeform notes about this workout
                    athleteNotes: workoutNotes || null,
                }),
            });
            const data = await res.json();
            if (data.notes) {
                const result: CoachResult = {
                    notes: data.notes || [],
                    exerciseSuggestions: data.exerciseSuggestions || [],
                    weightNotes: data.weightNotes || {},
                    warmUp: data.warmUp || {},
                    exerciseOrder: data.exerciseOrder || [],
                    nextSessionTargets: data.nextSessionTargets || {},
                    warnings: data.warnings || [],
                    intensity: data.intensity,
                    type,
                    timestamp: Date.now()
                };
                if (type === 'pre') {
                    setPreCoachMap(prev => ({ ...prev, [workoutType]: result }));
                } else {
                    const wId = expandedWorkoutId || 'unknown';
                    setPostCoachMap(prev => ({ ...prev, [wId]: result }));
                }
                // Cache independently
                const cacheKey = type === 'pre' ? `pre-${format(new Date(), 'yyyy-MM-dd')}-${workoutType}` : `post-${expandedWorkoutId}`;
                const cache = JSON.parse(localStorage.getItem('coach-cache') || '{}');
                cache[cacheKey] = result;
                localStorage.setItem('coach-cache', JSON.stringify(cache));

                // Save to Supabase for memory (overwrite if already exists today)
                try {
                    const todayStr = format(new Date(), 'yyyy-MM-dd');
                    // Delete existing entry for today's workout_type + coach_type
                    await supabase.from('coach_notes')
                        .delete()
                        .eq('workout_type', workoutType)
                        .eq('coach_type', type)
                        .gte('created_at', todayStr + 'T00:00:00')
                        .lt('created_at', todayStr + 'T23:59:59');
                    // Insert fresh
                    await supabase.from('coach_notes').insert({
                        workout_type: workoutType,
                        coach_type: type,
                        notes: data.notes || [],
                        exercise_suggestions: data.exerciseSuggestions || [],
                        weight_notes: data.weightNotes || {},
                        next_session_targets: data.nextSessionTargets || {},
                        intensity: data.intensity || 'maintain',
                        warm_up: data.warmUp || {},
                        exercise_order: data.exerciseOrder || [],
                        warnings: data.warnings || [],
                    });
                } catch { }
            }
        } catch (err) {
            console.error('Coach fetch error:', err);
            toast.error('Coach analysis failed');
        } finally {
            setCoachLoading(null);
        }
    }

    // ─── AI Weekly Planner ───
    const fetchWeeklyPlan = useCallback(async () => {
        setWeeklyPlanLoading(true);
        try {
            const res = await fetch('/api/productivity/workouts/weekly-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            const data = await res.json();
            if (data.plan) {
                const newPlan: Record<string, string> = {};
                const notes: Record<string, string> = {};
                Object.entries(data.plan).forEach(([day, val]: [string, any]) => {
                    const t = typeof val === 'string' ? val : val?.type;
                    const n = typeof val === 'object' ? val?.note : null;
                    if (t && t !== 'Rest') newPlan[day] = t;
                    if (n) notes[day] = n;
                });
                setWeekPlan(newPlan);
                setWeekPlanNotes(notes);
                // Update template view to today's workout
                const todayLabel = format(new Date(), 'EEE');
                if (newPlan[todayLabel]) setTemplateViewType(newPlan[todayLabel]);
            }
            setWeeklyReasoning(data.reasoning || null);
            setWeeklyGapAlert(data.gapAlert || null);
        } catch (err) {
            console.error('Weekly planner error:', err);
            toast.error('Failed to generate weekly plan');
        } finally {
            setWeeklyPlanLoading(false);
        }
    }, []);

    // This week schedule
    const weekSchedule = useMemo(() => {
        if (!mounted) return [];
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 0 });
        const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
        return days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayWorkouts = processed.filter(w => w.date === dateStr);
            return {
                day,
                label: format(day, 'EEE'),
                dateStr,
                isToday: isSameDay(day, now),
                workouts: dayWorkouts
            };
        });
    }, [processed, mounted]);

    // Detect deviations between actual workouts and weekly plan
    const hasDeviation = useMemo(() => {
        if (Object.keys(weekPlan).length === 0 || weekSchedule.length === 0) return false;
        const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayIdx = new Date().getDay(); // 0=Sun
        for (const d of weekSchedule) {
            const dayIdx = DAY_ORDER.indexOf(d.label);
            // Only check past days and today
            if (dayIdx > todayIdx) continue;
            const planned = weekPlan[d.label]; // undefined means Rest
            const hasWorkout = d.workouts.length > 0;
            const actualType = hasWorkout ? d.workouts[0]?.displayType : null;

            if (hasWorkout && planned && actualType !== planned) {
                // Actual workout doesn't match planned type
                return true;
            }
            if (hasWorkout && !planned) {
                // Workout on a planned rest day
                return true;
            }
        }
        return false;
    }, [weekSchedule, weekPlan]);

    // Re-optimize remaining days based on actual workouts
    const reOptimize = useCallback(async () => {
        setWeeklyPlanLoading(true);
        try {
            const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const todayIdx = new Date().getDay();
            const locked: Record<string, string> = {};
            for (const d of weekSchedule) {
                const dayIdx = DAY_ORDER.indexOf(d.label);
                if (dayIdx > todayIdx) continue;
                const hasWorkout = d.workouts.length > 0;
                locked[d.label] = hasWorkout ? d.workouts[0].displayType : 'Rest';
            }

            const res = await fetch('/api/productivity/workouts/weekly-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lockedDays: locked }),
            });

            const data = await res.json();
            if (data.plan) {
                const newPlan: Record<string, string> = {};
                const notes: Record<string, string> = {};
                Object.entries(data.plan).forEach(([day, val]: [string, any]) => {
                    const t = typeof val === 'string' ? val : val?.type;
                    const n = typeof val === 'object' ? val?.note : null;
                    if (t && t !== 'Rest') newPlan[day] = t;
                    if (n) notes[day] = n;
                });
                setWeekPlan(newPlan);
                setWeekPlanNotes(notes);
                const todayLabel = format(new Date(), 'EEE');
                if (newPlan[todayLabel]) setTemplateViewType(newPlan[todayLabel]);
            }
            setWeeklyReasoning(data.reasoning || null);
            setWeeklyGapAlert(data.gapAlert || null);
            toast.success('Week re-optimized based on actual workouts');
        } catch (err) {
            console.error('Re-optimize error:', err);
            toast.error('Failed to re-optimize weekly plan');
        } finally {
            setWeeklyPlanLoading(false);
        }
    }, [weekSchedule]);

    // Stats
    const stats = useMemo(() => {
        const totalSessions = processed.length;
        const totalDuration = processed.reduce((a, w) => a + (w.duration_minutes || 0), 0);
        const totalStrain = processed.reduce((a, w) => a + (w.strain || 0), 0);
        const avgDuration = totalSessions > 0 ? (totalDuration / totalSessions / 60).toFixed(1) : '0';
        const avgStrain = totalSessions > 0 ? (totalStrain / totalSessions).toFixed(1) : '0';
        const totalHours = (totalDuration / 60).toFixed(1);
        return { totalSessions, avgDuration, avgStrain, totalStrain: totalStrain.toFixed(1), totalHours };
    }, [processed]);

    // Volume trend: fetch last 12 workouts globally (not just current month) for the active filter
    const [volumeTrendData, setVolumeTrendData] = useState<{ date: string; volume: number; type: string }[]>([]);
    useEffect(() => {
        const fetchVolumeTrend = async () => {
            // Get last 30 workouts (enough to find 12 of any type)
            const { data: recentWorkouts } = await supabase
                .from('whoop_workouts')
                .select('id, date, workout_label')
                .eq('user_id', SINGLE_USER_ID)
                .order('date', { ascending: false })
                .limit(30);
            if (!recentWorkouts || recentWorkouts.length === 0) return;

            // Get exercises for these workouts
            const ids = recentWorkouts.map(w => w.id);
            const { data: exData } = await supabase
                .from('workout_exercises')
                .select('workout_id, exercise_name, set_entries')
                .in('workout_id', ids);

            // Build exercise map
            const exMap: Record<string, any[]> = {};
            (exData || []).forEach((row: any) => {
                if (!exMap[row.workout_id]) exMap[row.workout_id] = [];
                exMap[row.workout_id].push(row);
            });

            // Process workouts with volume and normalize type labels
            const withVolume = recentWorkouts.map(w => {
                const label = (w.workout_label || '').trim();
                let displayType = label;
                if (label.toLowerCase().includes('push') && label.toLowerCase().includes('chest')) displayType = 'Push (Chest)';
                else if (label.toLowerCase().includes('push') && label.toLowerCase().includes('tricep')) displayType = 'Push (Tricep)';
                else if (label.toLowerCase().includes('pull') && label.toLowerCase().includes('bicep')) displayType = 'Pull (Bicep)';
                else if (label.toLowerCase().includes('pull') && label.toLowerCase().includes('back')) displayType = 'Pull (Back)';
                else if (label.toLowerCase().includes('leg')) displayType = 'Legs';
                else if (label.toLowerCase().includes('cardio') || label.toLowerCase().includes('running')) displayType = 'Cardio';
                else if (label.toLowerCase().includes('recovery')) displayType = 'Recovery';

                const exs = exMap[w.id] || [];
                let totalVolume = 0;
                exs.forEach((ex: any) => {
                    const entries: SetEntry[] = ex.set_entries || [];
                    entries.forEach(entry => {
                        totalVolume += (entry.weight || 0) * (entry.reps || 0) * (entry.sets || 1);
                    });
                });
                return { date: w.date, volume: totalVolume, type: displayType, id: w.id };
            });

            // Filter to active type, take last 12 with volume > 0
            const filtered = activeFilter === 'All' ? withVolume : withVolume.filter(w => w.type === activeFilter);
            const withVol = filtered.filter(w => w.volume > 0).slice(0, 12).reverse();
            setVolumeTrendData(withVol.map(w => ({
                date: format(new Date(w.date + 'T12:00:00'), 'M/d'),
                volume: w.volume,
                type: w.type,
            })));
        };
        fetchVolumeTrend();
    }, [activeFilter, currentDate]);

    const handlePrev = () => setCurrentDate(subMonths(currentDate, 1));
    const handleNext = () => setCurrentDate(addMonths(currentDate, 1));

    // Set default template view type based on today's planned workout
    useEffect(() => {
        if (!templateViewType) {
            const todayLabel = format(new Date(), 'EEE');
            const plannedSplit = weekPlan[todayLabel];
            if (plannedSplit) setTemplateViewType(plannedSplit);
        }
    }, [weekPlan, templateViewType]);

    // Fetch last workout exercises when template type changes
    useEffect(() => {
        if (!templateViewType || lastWorkoutExercises[templateViewType]) return;
        (async () => {
            const lastWorkout = allProcessed.find(w => w.displayType === templateViewType);
            if (!lastWorkout) return;
            try {
                const res = await fetch(`/api/productivity/workouts/exercises?workout_id=${lastWorkout.id}`);
                const data = await res.json();
                if (data.exercises?.length > 0) {
                    setLastWorkoutExercises(prev => ({ ...prev, [templateViewType]: data.exercises }));
                }
            } catch { }
        })();
    }, [templateViewType, allProcessed]);

    // ─── Inline dropdown handlers ───
    async function toggleWorkoutExpand(workout: any) {
        if (expandedWorkoutId === workout.id) {
            setExpandedWorkoutId(null);
            setEditingExerciseIdx(null);
            setWorkoutNotes('');
            notesRef.current = '';
            return;
        }
        setExpandedWorkoutId(workout.id);
        setEditingExerciseIdx(null);
        setWorkoutNotes(workout.notes || '');
        notesRef.current = workout.notes || '';
        setExercisesLoading(true);
        setPreviousExercises([]);

        const isGolf = normalizeType(workout.sport_name, workout.workout_label, getWorkoutSplitFromTask(dailyTasks, workout.date)) === 'Golf';

        if (isGolf) {
            // Golf-specific fetch
            setGolfLoading(true);
            try {
                const [roundRes, historyRes] = await Promise.all([
                    fetch(`/api/productivity/golf?workout_id=${workout.id}`),
                    fetch('/api/productivity/golf')
                ]);
                const roundData = await roundRes.json();
                const historyData = await historyRes.json();
                const r = roundData.round;
                setGolfRound(r ? { course_name: r.course_name || '', holes: r.holes?.length ? r.holes : emptyHoles(), notes: r.notes || '' } : { course_name: '', holes: emptyHoles(), notes: '' });
                setGolfHistory(historyData.rounds || []);
            } catch {
                setGolfRound({ course_name: '', holes: emptyHoles(), notes: '' });
                setGolfHistory([]);
            } finally {
                setGolfLoading(false);
                setExercisesLoading(false);
            }
            return;
        }

        try {
            const res = await fetch(`/api/productivity/workouts/exercises?workout_id=${workout.id}`);
            const data = await res.json();
            const loaded = (data.exercises || []).map((ex: any) => ({
                ...ex,
                set_entries: ex.set_entries?.length > 0 ? ex.set_entries : [{ sets: null, reps: null, weight: null }],
            }));
            // If no saved exercises, auto-populate from template
            let finalExercises: Exercise[];
            if (loaded.length > 0) {
                finalExercises = loaded;
            } else {
                const template = workoutTemplates[workout.displayType];
                if (template && template.length > 0) {
                    const preCoach = preCoachMap[workout.displayType];
                    const suggestions = preCoach?.exerciseSuggestions || [];
                    const aiOrder = preCoach?.exerciseOrder || [];

                    // Build swap map: "Old Exercise" -> "New Exercise"
                    const swapMap = new Map<string, string>();
                    suggestions.forEach(s => {
                        const m = s.match(/^(.+?)\s*\(swap\s+for\s+(.+?)\)$/i);
                        if (m) swapMap.set(m[2].trim().toLowerCase(), m[1].trim());
                    });

                    // Apply swaps to template exercises
                    let populatedExercises = template.map(t => {
                        const swapTo = swapMap.get(t.exercise_name.toLowerCase());
                        return { exercise_name: swapTo || t.exercise_name };
                    });

                    // Apply AI exercise order if available
                    if (aiOrder.length > 0) {
                        populatedExercises = [...populatedExercises].sort((a, b) => {
                            const aIdx = aiOrder.findIndex(o => o.toLowerCase() === a.exercise_name.toLowerCase());
                            const bIdx = aiOrder.findIndex(o => o.toLowerCase() === b.exercise_name.toLowerCase());
                            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                        });
                    }

                    const targets = preCoach?.weightNotes || {};
                    finalExercises = populatedExercises.map(t => {
                        const target = targets[t.exercise_name];
                        const parsedSets: SetEntry[] = [];

                        // Parse working sets only (warm-ups stay as sidebar text)
                        // Format: "2x10 @ 135, 1x8 @ 145 lbs"
                        if (target) {
                            const parts = target.replace(/\s*lbs\s*/gi, '').split(',').map((s: string) => s.trim());
                            parts.forEach((part: string) => {
                                const m = part.match(/^\s*(\d+)\s*[x×]\s*(\d+)\s*@\s*(\d+)/i);
                                if (m) {
                                    const s = parseInt(m[1]), r = parseInt(m[2]), wt = parseInt(m[3]);
                                    if (s <= 10 && r <= 50 && wt <= 1000) parsedSets.push({ sets: s, reps: r, weight: wt });
                                }
                            });
                        }

                        return {
                            exercise_name: t.exercise_name,
                            set_entries: parsedSets.length > 0 ? parsedSets : [{ sets: null, reps: null, weight: null }],
                            weight_unit: 'lbs',
                            notes: '',
                        };
                    });
                } else {
                    finalExercises = [emptyExercise()];
                }
            }
            setExercises(finalExercises);
            exercisesJsonRef.current = JSON.stringify(finalExercises);

            // Rehydrate post-workout coach notes from DB if not in memory
            if (!postCoachMap[workout.id]) {
                try {
                    // Find the most recent post-coach note for this workout type
                    // created on or after the workout date
                    const { data: dbNotes } = await supabase
                        .from('coach_notes')
                        .select('notes, exercise_suggestions, weight_notes, intensity, coach_type')
                        .eq('workout_type', workout.displayType)
                        .eq('coach_type', 'post')
                        .gte('created_at', workout.date + 'T00:00:00')
                        .order('created_at', { ascending: false })
                        .limit(1);
                    if (dbNotes && dbNotes.length > 0) {
                        const n = dbNotes[0];
                        setPostCoachMap(prev => ({
                            ...prev, [workout.id]: {
                                notes: n.notes || [],
                                exerciseSuggestions: n.exercise_suggestions || [],
                                weightNotes: n.weight_notes || {},
                                warmUp: {},
                                exerciseOrder: [],
                                intensity: n.intensity || 'maintain',
                                type: 'post',
                                timestamp: Date.now(),
                                nextSessionTargets: {},
                                warnings: [],
                            }
                        }));
                    }
                } catch { }
            }

            // Fetch previous workout exercises for comparison
            const prev = previousByType[workout.id];
            if (prev) {
                const prevRes = await fetch(`/api/productivity/workouts/exercises?workout_id=${prev.id}`);
                const prevData = await prevRes.json();
                setPreviousExercises(prevData.exercises || []);
            }
        } catch {
            setExercises([emptyExercise()]);
        } finally {
            setExercisesLoading(false);
        }
    }

    function emptyExercise(): Exercise {
        return { exercise_name: '', set_entries: [{ sets: null, reps: null, weight: null }], weight_unit: 'lbs', notes: '' };
    }

    async function handleRelabel(workout: any, label: string) {
        setSaving(true);
        try {
            await fetch('/api/productivity/workouts/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workout_id: workout.id, workout_label: label })
            });
            setWorkouts(prev => prev.map(w =>
                w.id === workout.id ? { ...w, workout_label: label } : w
            ));
        } catch (err) {
            console.error('Failed to update label', err);
            toast.error('Failed to update label');
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveExercises(workoutId: string) {
        const validExercises = exercises.filter(e => e.exercise_name.trim());

        setSaving(true);
        try {
            await fetch('/api/productivity/workouts/exercises', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workout_id: workoutId, exercises: validExercises })
            });
            setExerciseCounts(prev => ({ ...prev, [workoutId]: validExercises.length }));
        } catch (err) {
            console.error('Failed to save exercises', err);
            toast.error('Failed to save exercises');
        } finally {
            setSaving(false);
        }
    }

    // Auto-save exercises with debounce
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const exercisesJsonRef = useRef<string>('');
    useEffect(() => {
        if (!expandedWorkoutId || exercisesLoading) return;
        const json = JSON.stringify(exercises);
        // Skip if exercises haven't actually changed (avoids save on initial load)
        if (json === exercisesJsonRef.current) return;
        exercisesJsonRef.current = json;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            handleSaveExercises(expandedWorkoutId);
        }, 1500);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [exercises, expandedWorkoutId, exercisesLoading]);

    // Auto-save golf data with debounce
    const golfSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const golfJsonRef = useRef<string>('');
    useEffect(() => {
        if (!expandedWorkoutId || golfLoading || !golfRound) return;
        const json = JSON.stringify(golfRound);
        if (json === golfJsonRef.current) return;
        golfJsonRef.current = json;
        if (golfSaveTimerRef.current) clearTimeout(golfSaveTimerRef.current);
        golfSaveTimerRef.current = setTimeout(async () => {
            try {
                await fetch('/api/productivity/golf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workout_id: expandedWorkoutId, ...golfRound })
                });
            } catch (err) {
                console.error('Failed to save golf round', err);
                toast.error('Failed to save golf round');
            }
        }, 1500);
        return () => { if (golfSaveTimerRef.current) clearTimeout(golfSaveTimerRef.current); };
    }, [golfRound, expandedWorkoutId, golfLoading]);

    // Auto-save workout notes with debounce
    const notesSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const notesRef = useRef<string>('');
    const latestNotesRef = useRef<string>('');
    latestNotesRef.current = workoutNotes;
    useEffect(() => {
        if (!expandedWorkoutId) return;
        if (workoutNotes === notesRef.current) return;
        notesRef.current = workoutNotes;
        if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
        notesSaveTimerRef.current = setTimeout(async () => {
            try {
                const currentNotes = latestNotesRef.current;
                const res = await fetch('/api/productivity/workouts/update', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workout_id: expandedWorkoutId, notes: currentNotes })
                });
                if (res.ok) {
                    // Update the workout object in state so notes persist across collapse/expand
                    setWorkouts(prev => prev.map(w => w.id === expandedWorkoutId ? { ...w, notes: currentNotes } : w));
                } else {
                    console.error('Failed to save notes, status:', res.status);
                }
            } catch (err) {
                console.error('Failed to save workout notes', err);
            }
        }, 1500);
        return () => { if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current); };
    }, [workoutNotes, expandedWorkoutId]);

    // Helper: get top set for an exercise (highest weight)
    function getTopSet(sets: SetEntry[]): SetEntry | null {
        return sets.reduce((best, s) => (!best || (s.weight || 0) > (best.weight || 0) ? s : best), null as SetEntry | null);
    }

    // Helper: find previous exercise match by name
    function getPrevExercise(name: string) {
        return previousExercises.find((ex: any) => ex.exercise_name.toLowerCase() === name.toLowerCase());
    }

    // Helper: compute total volume for a set of exercises
    function computeVolume(exs: any[]): number {
        return exs.reduce((total, ex) => {
            return total + (ex.set_entries || []).reduce((sum: number, s: any) => {
                return sum + ((s.sets || 1) * (s.reps || 0) * (s.weight || 0));
            }, 0);
        }, 0);
    }

    function updateExercise(idx: number, field: keyof Exercise, value: any) {
        setExercises(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
    }

    function updateSet(exIdx: number, setIdx: number, field: keyof SetEntry, value: any) {
        setExercises(prev => prev.map((e, i) => {
            if (i !== exIdx) return e;
            const newSets = [...e.set_entries];
            newSets[setIdx] = { ...newSets[setIdx], [field]: value };
            return { ...e, set_entries: newSets };
        }));
    }

    function addSet(exIdx: number) {
        setExercises(prev => prev.map((e, i) => {
            if (i !== exIdx) return e;
            return { ...e, set_entries: [...e.set_entries, { sets: null, reps: null, weight: null }] };
        }));
    }

    function removeSet(exIdx: number, setIdx: number) {
        setExercises(prev => prev.map((e, i) => {
            if (i !== exIdx) return e;
            if (e.set_entries.length <= 1) return e;
            return { ...e, set_entries: e.set_entries.filter((_, si) => si !== setIdx) };
        }));
    }

    function addExercise() {
        setExercises(prev => {
            const next = [...prev, emptyExercise()];
            setEditingExerciseIdx(next.length - 1);
            return next;
        });
    }

    function removeExercise(idx: number) {
        setExercises(prev => prev.filter((_, i) => i !== idx));
    }

    function handleDragStart(idx: number) {
        setDragIdx(idx);
    }
    function handleDragOver(e: React.DragEvent, idx: number) {
        e.preventDefault();
    }
    function handleDrop(idx: number) {
        if (dragIdx === null || dragIdx === idx) return;
        setExercises(prev => {
            const next = [...prev];
            const [moved] = next.splice(dragIdx, 1);
            next.splice(idx, 0, moved);
            return next;
        });
        setDragIdx(null);
    }
    function handleDragEnd() {
        setDragIdx(null);
    }

    // ─── Mobile accordion state for coach notes ───
    const [mobileCoachOpen, setMobileCoachOpen] = useState(false);
    const [mobileTodayOpen, setMobileTodayOpen] = useState(false);
    const [coachDrawerOpen, setCoachDrawerOpen] = useState(false);
    const [weekPlanDrawerOpen, setWeekPlanDrawerOpen] = useState(false);

    // ─── Mobile swipe navigation ───
    const mobileSwipeRef = useRef<{ startX: number; startY: number; startTime: number } | null>(null);
    const handleMobileSwipeStart = useCallback((clientX: number, clientY: number) => {
        mobileSwipeRef.current = { startX: clientX, startY: clientY, startTime: Date.now() };
    }, []);
    const handleMobileSwipeEnd = useCallback((clientX: number, clientY: number) => {
        if (!mobileSwipeRef.current) return;
        const dx = clientX - mobileSwipeRef.current.startX;
        const dy = clientY - mobileSwipeRef.current.startY;
        const dt = Date.now() - mobileSwipeRef.current.startTime;
        mobileSwipeRef.current = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 400) {
            if (dx < 0) handleNext();
            else handlePrev();
        }
    }, []);

    // ─── Mobile quick-log drawer ───
    const [mobileQuickLogOpen, setMobileQuickLogOpen] = useState(false);

    return (
        <DataMaturityProvider>
        <>
        {/* ==================== MOBILE LAYOUT ==================== */}
        <div className="md:hidden px-3 py-2 space-y-3 pb-24"
            onTouchStart={(e) => handleMobileSwipeStart(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchEnd={(e) => handleMobileSwipeEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
        >
            {/* Mobile Header */}
            <div className="flex items-center justify-between">
                <button onClick={handlePrev} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-athena-border active:bg-white/5 transition-colors">
                    <ChevronLeft className="w-5 h-5 text-athena-gold" />
                </button>
                <div className="text-center">
                    <h1 className="text-lg font-serif text-transparent bg-clip-text bg-gradient-to-r from-athena-gold to-athena-gold-pale">
                        {format(currentDate, 'MMMM yyyy')}
                    </h1>
                    {!isSameMonth(currentDate, new Date()) && (
                        <button
                            onClick={() => setCurrentDate(new Date())}
                            className="text-[10px] text-athena-gold/60 font-semibold active:text-athena-gold"
                        >
                            Back to today
                        </button>
                    )}
                </div>
                <button onClick={handleNext} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-athena-border active:bg-white/5 transition-colors">
                    <ChevronRight className="w-5 h-5 text-athena-gold" />
                </button>
            </div>

            {/* Stats hidden on mobile -- This Week + workout log are more important */}

            {/* Mobile This Week Strip */}
            {isSameMonth(currentDate, new Date()) && (
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <CalendarDays size={14} className="text-athena-text-muted" />
                        <span className="text-xs text-athena-text-muted uppercase tracking-[0.15em] font-bold">This Week</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {weekSchedule.map((d, i) => {
                            const planned = weekPlan[d.label];
                            const hasWorkout = d.workouts.length > 0;
                            const displayType = hasWorkout ? d.workouts[0]?.displayType : planned;
                            return (
                                <div key={i} className={cn(
                                    "flex flex-col items-center rounded-lg border py-2 px-0.5 min-w-0",
                                    d.isToday ? 'bg-athena-gold/10 border-athena-gold/30' : 'bg-athena-panel/40 border-athena-border/20'
                                )}>
                                    <span className={cn("text-[10px] font-bold uppercase", d.isToday ? 'text-athena-gold' : 'text-athena-text-muted/50')}>{d.label.slice(0, 3)}</span>
                                    {displayType ? (
                                        <span className="text-[10px] font-semibold truncate w-full text-center mt-0.5" style={{ color: TYPE_COLORS[displayType] || undefined }}>{TYPE_ABBREV[displayType] || displayType.slice(0, 4)}</span>
                                    ) : (
                                        <span className="text-[10px] text-athena-text-muted/20 mt-0.5">Rest</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {hasDeviation && (
                        <button onClick={reOptimize} disabled={weeklyPlanLoading} className="mt-2 w-full text-[11px] text-athena-gold hover:text-athena-gold-bright py-2 border border-athena-gold/20 rounded-lg bg-athena-gold/5 font-semibold transition-colors disabled:opacity-50">
                            {weeklyPlanLoading ? 'Optimizing...' : 'Re-optimize week'}
                        </button>
                    )}
                </div>
            )}

            {/* Mobile Filter Pills */}
            <div className="overflow-x-auto -mx-3 px-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="flex gap-1.5 min-w-max">
                    {uniqueTypes.map(type => {
                        const color = type === 'All' ? 'rgb(var(--athena-gold))' : (TYPE_COLORS[type] || '#6b7280');
                        return (
                            <button key={type} onClick={() => setActiveFilter(type)}
                                className={cn("px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all border min-h-[36px]",
                                    activeFilter === type ? "border-white/10 shadow-sm" : "border-transparent text-athena-text-muted"
                                )}
                                style={activeFilter === type ? { color, borderColor: color + '40', background: color + '18' } : undefined}>
                                {type}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Mobile Workout Feed */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-6 h-6 border-2 border-athena-text-muted/20 border-t-athena-gold/60 rounded-full animate-spin" />
                </div>
            ) : filteredGroupedByDate.length === 0 ? (
                <div className="text-center py-12 text-sm text-athena-text-muted">No workouts this month</div>
            ) : (
                <div className="space-y-1.5">
                    {filteredGroupedByDate.flatMap(([date, dayWorkouts]) => {
                        const d = new Date(date + 'T12:00:00');
                        const isToday = mounted && isSameDay(d, currentDate);
                        const dateLabel = isToday ? 'Today' : format(d, 'EEE, MMM d');
                        return dayWorkouts.map((w, i) => {
                            const isExpanded = expandedWorkoutId === w.id;
                            return (
                                <div key={`m-${date}-${i}`}>
                                    <div onClick={() => toggleWorkoutExpand(w)}
                                        className={cn("flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.02] rounded-xl border transition-all min-h-[56px] active:scale-[0.98]",
                                            isExpanded ? "border-athena-gold/30 bg-athena-gold/[0.03]" : "border-athena-border/30"
                                        )}>
                                        <div className="w-1.5 h-8 rounded-full shrink-0" style={{ background: w.color }} />
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-semibold text-athena-text-primary truncate block">{w.displayType}</span>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-athena-text-muted/50">{dateLabel}</span>
                                                {w.duration_minutes > 0 && <span className="text-[10px] text-athena-text-muted">{formatDuration(w.duration_minutes)}</span>}
                                                {w.strain > 0 && <span className="text-[10px] text-athena-gold font-semibold">{w.strain.toFixed(1)} strain</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {exerciseCounts[w.id] > 0 && (
                                                <span className="text-[10px] text-athena-text-muted/40 flex items-center gap-1">
                                                    <Dumbbell size={10} /> {exerciseCounts[w.id]}
                                                </span>
                                            )}
                                            <ChevronDown size={14} className={cn("text-athena-text-muted/40 transition-transform", isExpanded && "rotate-180")} />
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ overflow: 'visible' }}>
                                            <div className="mt-1 p-2.5 bg-athena-bg/80 border border-athena-border/40 rounded-xl space-y-2">
                                                {exercisesLoading || golfLoading ? (
                                                    <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-athena-text-muted/20 border-t-athena-gold/60 rounded-full animate-spin" /></div>
                                                ) : w.displayType === 'Golf' && golfRound ? (
                                                    <div className="space-y-2">
                                                        <input type="text" placeholder="Course name" value={golfRound.course_name || ''}
                                                            onChange={e => setGolfRound(prev => prev ? { ...prev, course_name: e.target.value } : prev)}
                                                            className="w-full bg-athena-bg/50 border border-athena-border/30 rounded-lg px-3 py-2 text-base md:text-[12px] text-athena-text-primary focus:outline-none" />
                                                        {[0, 9].map(offset => {
                                                            const nineHoles = golfRound.holes.slice(offset, offset + 9);
                                                            const label = offset === 0 ? 'OUT' : 'IN';
                                                            const totalPar = nineHoles.reduce((s, h) => s + (h.par || 0), 0);
                                                            const totalScore = nineHoles.reduce((s, h) => s + (h.score || 0), 0);
                                                            return (
                                                                <div key={offset} className="overflow-x-auto -mx-2 px-2">
                                                                    <table className="w-full text-[10px] border-collapse">
                                                                        <thead><tr>
                                                                            <th className="text-left text-athena-text-muted/40 font-bold px-1 py-0.5 w-8">Hole</th>
                                                                            {nineHoles.map((_, i) => (<th key={i} className="text-center text-athena-text-muted/50 font-medium px-0.5 py-0.5 w-6">{offset + i + 1}</th>))}
                                                                            <th className="text-center text-athena-text-muted/50 font-bold px-1 py-0.5 w-7 border-l border-athena-border/20">{label}</th>
                                                                        </tr></thead>
                                                                        <tbody>
                                                                            <tr className="border-t border-athena-border/10">
                                                                                <td className="text-athena-text-muted/40 font-bold px-1 py-1">Par</td>
                                                                                {nineHoles.map((h, i) => (<td key={i} className="px-0.5 py-0.5"><input type="number" value={h.par ?? ''} placeholder="."
                                                                                    onChange={e => { const val = e.target.value ? Number(e.target.value) : null; setGolfRound(prev => { if (!prev) return prev; const holes = [...prev.holes]; holes[offset + i] = { ...holes[offset + i], par: val }; return { ...prev, holes }; }); }}
                                                                                    className="w-full bg-transparent text-center text-athena-text-muted font-medium focus:outline-none focus:bg-athena-gold/5 rounded" /></td>))}
                                                                                <td className="text-center font-bold text-athena-text-muted border-l border-athena-border/20">{totalPar || ''}</td>
                                                                            </tr>
                                                                            <tr className="border-t border-athena-border/10">
                                                                                <td className="text-athena-text-muted/40 font-bold px-1 py-1">Score</td>
                                                                                {nineHoles.map((h, i) => {
                                                                                    const diff = h.par && h.score ? h.score - h.par : null;
                                                                                    const cellColor = diff === null ? '' : diff <= 0 ? 'text-blue-400 font-bold' : diff === 1 ? 'text-athena-green font-bold' : 'text-athena-text-primary';
                                                                                    return (<td key={i} className="px-0.5 py-0.5"><input type="number" value={h.score ?? ''} placeholder="."
                                                                                        onChange={e => { const val = e.target.value ? Number(e.target.value) : null; setGolfRound(prev => { if (!prev) return prev; const holes = [...prev.holes]; holes[offset + i] = { ...holes[offset + i], score: val }; return { ...prev, holes }; }); }}
                                                                                        className={cn('w-full bg-transparent text-center focus:outline-none focus:bg-athena-gold/5 rounded', cellColor)} /></td>);
                                                                                })}
                                                                                <td className="text-center font-bold border-l border-athena-border/20">{totalScore || ''}</td>
                                                                            </tr>
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* Mobile Type Selector - scrollable */}
                                                        <div className="overflow-x-auto -mx-2.5 px-2.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                                            <div className="flex gap-1.5 min-w-max pb-1">
                                                                {LABEL_OPTIONS.map(label => (
                                                                    <button key={label} onClick={() => { if (label === 'Other') { setCustomLabelId(customLabelId === w.id ? null : w.id); setCustomLabelText(''); } else { setCustomLabelId(null); handleRelabel(w, label); } }} disabled={saving}
                                                                        className={cn("px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all border whitespace-nowrap min-h-[36px]",
                                                                            w.displayType === label ? "text-white border-white/20" : "text-athena-text-muted border-athena-border/30"
                                                                        )}
                                                                        style={w.displayType === label ? { background: TYPE_COLORS[label] || '#6b7280' } : undefined}>{label}</button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        {customLabelId === w.id && (
                                                            <form onSubmit={(e) => { e.preventDefault(); if (customLabelText.trim()) { handleRelabel(w, customLabelText.trim()); setCustomLabelId(null); setCustomLabelText(''); } }} className="flex gap-2 mt-1">
                                                                <input type="text" value={customLabelText} onChange={(e) => setCustomLabelText(e.target.value)} placeholder="e.g. Washing Car" autoFocus
                                                                    className="flex-1 bg-white/[0.04] border border-athena-border/30 rounded-lg px-3 py-2 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-muted/30 outline-none focus:border-athena-gold/50 min-h-[44px]" />
                                                                <button type="submit" disabled={!customLabelText.trim() || saving}
                                                                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-athena-gold text-black min-h-[44px] disabled:opacity-30 active:scale-95 transition-transform">Save</button>
                                                            </form>
                                                        )}

                                                        {/* Mobile Exercise List */}
                                                        <div className="space-y-3">
                                                            {exercises.map((ex, idx) => (
                                                                <div key={idx} className="bg-white/[0.02] border border-athena-border/20 rounded-lg p-3">
                                                                    {/* Exercise name header */}
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <button onClick={() => { setEditingExerciseIdx(editingExerciseIdx === idx ? null : idx); setExerciseSearch(''); }}
                                                                            className={cn("text-sm font-semibold flex-1 text-left min-h-[36px] flex items-center", ex.exercise_name ? "text-athena-text-primary" : "text-athena-text-muted/40 italic")}>
                                                                            {ex.exercise_name || 'Tap to select exercise'}
                                                                        </button>
                                                                        <button onClick={() => removeExercise(idx)} className="p-2 text-athena-text-muted/30 active:text-red-400 min-h-[36px] min-w-[36px] flex items-center justify-center"><Trash2 size={14} /></button>
                                                                    </div>

                                                                    {/* Exercise search — larger overlay for mobile */}
                                                                    {editingExerciseIdx === idx && (
                                                                        <div className="mb-3 border border-athena-border/30 rounded-xl overflow-hidden bg-athena-bg shadow-xl">
                                                                            <input autoFocus placeholder="Search exercises..." value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)}
                                                                                onKeyDown={e => { if (e.key === 'Enter' && exerciseSearch.trim()) { updateExercise(idx, 'exercise_name', exerciseSearch.trim()); setEditingExerciseIdx(null); setExerciseSearch(''); } }}
                                                                                className="w-full px-4 py-3 bg-transparent text-sm border-b border-athena-border/30 focus:outline-none sticky top-0 z-10 min-h-[48px]" />
                                                                            <div className="max-h-[240px] overflow-y-auto">
                                                                                {(exerciseSearch ? (EXERCISE_DB[w.displayType?.startsWith('Push') ? 'Push' : w.displayType?.startsWith('Pull') ? 'Pull' : w.displayType || 'Other'] || ALL_EXERCISES).filter(n => n.toLowerCase().includes(exerciseSearch.toLowerCase())) : (EXERCISE_DB[w.displayType?.startsWith('Push') ? 'Push' : w.displayType?.startsWith('Pull') ? 'Pull' : w.displayType || 'Other'] || ALL_EXERCISES)).slice(0, 12).map(name => (
                                                                                    <button key={name} onClick={() => { updateExercise(idx, 'exercise_name', name); setEditingExerciseIdx(null); setExerciseSearch(''); }}
                                                                                        className="w-full text-left px-4 py-3 text-sm active:bg-athena-gold/10 min-h-[48px] flex items-center border-b border-athena-border/10 last:border-b-0">{name}</button>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Set entries - table-like layout */}
                                                                    <div className="space-y-1.5">
                                                                        {/* Header row */}
                                                                        <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2 px-1">
                                                                            <span className="text-[10px] text-athena-text-muted/40 uppercase text-center">Sets</span>
                                                                            <span className="text-[10px] text-athena-text-muted/40 uppercase text-center">Reps</span>
                                                                            <span className="text-[10px] text-athena-text-muted/40 uppercase text-center">Weight</span>
                                                                        </div>
                                                                        {ex.set_entries.map((s, si) => (
                                                                            <div key={si} className="flex items-center gap-1.5">
                                                                                <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2 flex-1">
                                                                                    <input type="number" inputMode="numeric" placeholder="-" value={s.sets ?? ''} onChange={e => updateSet(idx, si, 'sets', e.target.value ? Number(e.target.value) : null)}
                                                                                        className="w-full bg-white/[0.04] border border-athena-border/20 rounded-lg px-2 py-2.5 text-sm text-center focus:outline-none focus:border-athena-gold/30 min-h-[44px]" />
                                                                                    <input type="number" inputMode="numeric" placeholder="-" value={s.reps ?? ''} onChange={e => updateSet(idx, si, 'reps', e.target.value ? Number(e.target.value) : null)}
                                                                                        className="w-full bg-white/[0.04] border border-athena-border/20 rounded-lg px-2 py-2.5 text-sm text-center focus:outline-none focus:border-athena-gold/30 min-h-[44px]" />
                                                                                    <input type="number" inputMode="numeric" placeholder="-" value={s.weight ?? ''} onChange={e => updateSet(idx, si, 'weight', e.target.value ? Number(e.target.value) : null)}
                                                                                        className="w-full bg-white/[0.04] border border-athena-border/20 rounded-lg px-2 py-2.5 text-sm text-center font-semibold focus:outline-none focus:border-athena-gold/30 min-h-[44px]" style={{ color: w.color }} />
                                                                                </div>
                                                                                {ex.set_entries.length > 1 && (
                                                                                    <button onClick={() => removeSet(idx, si)} className="p-2 text-athena-text-muted/20 active:text-red-400 min-w-[32px] flex items-center justify-center"><X size={14} /></button>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                        <button onClick={() => addSet(idx)} className="text-xs text-athena-text-muted/50 active:text-athena-gold py-2 w-full text-center min-h-[36px]">+ Add Set</button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Add Exercise */}
                                                        <button onClick={addExercise} className="w-full py-3 border border-dashed border-athena-border/30 rounded-xl text-xs text-athena-text-muted active:text-athena-gold active:border-athena-gold/30 flex items-center justify-center gap-1.5 min-h-[48px]">
                                                            <Plus size={14} /> Add Exercise
                                                        </button>

                                                        {/* Notes */}
                                                        <textarea placeholder="How did it feel? Notes for your AI coach..." value={workoutNotes} onChange={e => setWorkoutNotes(e.target.value)}
                                                            className="w-full bg-white/[0.03] border border-athena-border/30 rounded-xl px-4 py-3 text-sm text-athena-text-primary placeholder:text-athena-text-muted/30 focus:outline-none focus:border-athena-gold/30 resize-none min-h-[60px]" rows={2} />

                                                        {/* Post-Workout Coach */}
                                                        {postCoachMap[w.id] ? (
                                                            <div className="border border-athena-border/20 rounded-xl overflow-hidden">
                                                                <button onClick={() => setMobileCoachOpen(!mobileCoachOpen)} className="flex items-center gap-2 w-full px-4 py-3 bg-white/[0.02] min-h-[48px] active:bg-white/[0.04]">
                                                                    <Brain size={14} className="text-athena-gold/60" />
                                                                    <span className="text-xs text-athena-text-muted uppercase tracking-wider font-bold flex-1 text-left">Coach Review</span>
                                                                    <ChevronDown size={14} className={cn("text-athena-text-muted/40 transition-transform", mobileCoachOpen && "rotate-180")} />
                                                                </button>
                                                                {mobileCoachOpen && (
                                                                    <div className="px-4 pb-3 space-y-2">
                                                                        {(postCoachMap[w.id].notes || []).map((n: string, ni: number) => (
                                                                            <p key={ni} className="text-xs text-athena-text-muted/70 leading-relaxed">· {n}</p>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <button onClick={() => fetchCoach('post', w.displayType, exercises, w.id, w.date)} disabled={coachLoading === 'post'}
                                                                className="w-full py-3 rounded-xl bg-athena-gold/10 text-athena-gold text-xs font-semibold border border-athena-gold/20 min-h-[48px] disabled:opacity-50 active:bg-athena-gold/20">
                                                                {coachLoading === 'post' ? 'Analyzing...' : 'Get Post-Workout Analysis'}
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            );
                        });
                    })}
                </div>
            )}

            {/* Mobile Today's Workout (accordion) */}
            {isSameMonth(currentDate, new Date()) && templateViewType && (
                <div className="border border-athena-border/30 rounded-xl overflow-hidden">
                    <button onClick={() => setMobileTodayOpen(!mobileTodayOpen)}
                        className="w-full flex items-center gap-2 px-3 py-3 bg-athena-panel/60 min-h-[48px]">
                        <Target size={14} className="text-athena-gold" />
                        <span className="text-[11px] text-athena-gold uppercase tracking-[0.15em] font-bold flex-1 text-left">
                            Today&apos;s Workout — {templateViewType}
                        </span>
                        <ChevronDown size={14} className={cn("text-athena-text-muted/40 transition-transform", mobileTodayOpen && "rotate-180")} />
                    </button>
                    {mobileTodayOpen && (() => {
                        const tmpl = workoutTemplates[templateViewType] || [];
                        const preCoachData = preCoachMap[templateViewType];
                        return (
                            <div className="px-3 py-3 space-y-2 bg-athena-panel/30">
                                {/* Template exercises */}
                                {tmpl.map((t, i) => {
                                    const target = preCoachData?.weightNotes?.[t.exercise_name] || preCoachData?.nextSessionTargets?.[t.exercise_name] || null;
                                    return (
                                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-athena-border/10 last:border-b-0">
                                            <span className="text-[12px] font-medium text-athena-text-primary">{t.exercise_name}</span>
                                            {target && <span className="text-[10px] text-athena-gold/70 font-mono">{target}</span>}
                                        </div>
                                    );
                                })}
                                {tmpl.length === 0 && <div className="text-[11px] text-athena-text-muted/40 text-center py-2">No template set</div>}
                                {/* AI-suggested exercise swaps (mobile) */}
                                {preCoachData && (preCoachData.exerciseSuggestions || []).filter(s => !tmpl.some(t => t.exercise_name === s)).map((name, i) => {
                                    const swapMatch = name.match(/^(.+?)\s*\(swap\s+for\s+(.+?)\)$/i);
                                    const displayName = swapMatch ? swapMatch[1].trim() : name;
                                    const sugTarget = preCoachData?.weightNotes?.[displayName] || preCoachData?.nextSessionTargets?.[displayName] || null;
                                    return (
                                        <div key={`msug-${i}`} className="flex items-center justify-between py-1.5 px-2 bg-athena-gold/5 border border-athena-gold/20 rounded-lg">
                                            <div className="flex items-center gap-1.5">
                                                <Sparkles size={10} className="text-athena-gold shrink-0" />
                                                <span className="text-[12px] font-medium text-athena-gold">{displayName}</span>
                                                <span className="text-[10px] text-athena-gold/50 uppercase font-bold">{swapMatch ? 'swap' : 'add'}</span>
                                            </div>
                                            {sugTarget
                                                ? <span className="text-[10px] text-athena-gold/70 font-mono">{sugTarget}</span>
                                                : <span className="text-[10px] text-athena-text-muted/30">No target</span>
                                            }
                                        </div>
                                    );
                                })}
                                {/* Coach button */}
                                <DataGate feature="coachNotes" compact>
                                <button onClick={() => fetchCoach('pre', templateViewType)} disabled={coachLoading === 'pre'}
                                    className="w-full py-2 rounded-lg bg-athena-gold/10 text-athena-gold text-[11px] font-semibold border border-athena-gold/20 min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
                                    {coachLoading === 'pre' ? <><Sparkles size={12} className="animate-pulse" /> Generating...</> : <><Brain size={12} /> Pre-Workout Coach</>}
                                </button>
                                </DataGate>
                                {preCoachData && preCoachData.notes?.length > 0 && (
                                    <div className="space-y-1.5 pt-2 border-t border-athena-border/20">
                                        {preCoachData.notes.map((n: string, ni: number) => (
                                            <p key={ni} className="text-[11px] text-athena-text-muted/70 leading-relaxed">· {n}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Mobile Log Workout (non-WHOOP) — inline fallback when FAB quick-log is closed */}
            {isSameMonth(currentDate, new Date()) && !whoopEnabled && manualWorkoutOpen && (
                <div className="space-y-2.5 p-3 bg-athena-panel/60 border border-athena-border/30 rounded-xl">
                    <select value={manualWorkoutType} onChange={e => setManualWorkoutType(e.target.value)}
                        className="w-full bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-xs text-athena-text-primary focus:outline-none min-h-[44px]">
                        {LABEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <input type="number" placeholder="Duration (minutes)" value={manualWorkoutDuration} onChange={e => setManualWorkoutDuration(e.target.value)}
                        className="w-full bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-xs focus:outline-none min-h-[44px]" />
                    <div className="flex gap-2">
                        <button onClick={handleManualWorkoutSave} disabled={manualWorkoutSaving}
                            className="flex-1 px-3 py-2.5 rounded-lg bg-athena-gold/20 text-athena-gold text-xs font-semibold border border-athena-gold/30 min-h-[44px] disabled:opacity-50">
                            {manualWorkoutSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => setManualWorkoutOpen(false)} className="px-3 py-2.5 rounded-lg bg-white/5 text-athena-text-muted text-xs min-h-[44px]">Cancel</button>
                    </div>
                </div>
            )}

            {/* Mobile Volume Trends */}
            {volumeTrendData.length >= 2 && (
                <Card className="bg-athena-panel/60 border-athena-border/50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="text-athena-gold" size={14} />
                        <span className="text-[10px] text-athena-gold uppercase tracking-[0.2em] font-bold">Volume Trends</span>
                    </div>
                    <div className="w-full h-[160px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={volumeTrendData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} width={30} />
                                <Line type="monotone" dataKey="volume" stroke="rgb(var(--athena-gold))" strokeWidth={2} dot={{ fill: 'rgb(var(--athena-gold))', r: 2, strokeWidth: 0 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}

            {/* Mobile Quick-Log FAB */}
            {!whoopEnabled && isSameMonth(currentDate, new Date()) && !expandedWorkoutId && (
                <button
                    onClick={() => setMobileQuickLogOpen(!mobileQuickLogOpen)}
                    className="fixed bottom-8 right-4 z-50 w-14 h-14 rounded-full bg-athena-gold text-athena-bg flex items-center justify-center shadow-lg shadow-athena-gold/30 active:scale-90 transition-transform"
                    style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                    {mobileQuickLogOpen ? <X size={24} strokeWidth={2.5} /> : <Dumbbell size={24} strokeWidth={2.5} />}
                </button>
            )}

            {/* Mobile Quick-Log Bottom Sheet (inline, not a drawer — keeps it simple) */}
            {mobileQuickLogOpen && !whoopEnabled && (
                <div className="fixed bottom-24 right-4 left-4 z-40 bg-[#0a0a0a] border border-athena-gold/20 rounded-2xl shadow-2xl p-4 space-y-3"
                    style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-athena-gold uppercase tracking-wider font-bold">Quick Log</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                        {LABEL_OPTIONS.filter(l => !['Other'].includes(l)).map(label => (
                            <button
                                key={label}
                                onClick={() => setManualWorkoutType(label)}
                                className={cn(
                                    "py-2.5 rounded-lg text-[10px] font-semibold transition-all border text-center min-h-[44px]",
                                    manualWorkoutType === label ? "text-white border-white/20" : "text-athena-text-muted border-athena-border/30"
                                )}
                                style={manualWorkoutType === label ? { background: TYPE_COLORS[label] || '#6b7280' } : undefined}
                            >
                                {label.replace(' (Chest)', '').replace(' (Tricep)', '').replace(' (Back)', '').replace(' (Bicep)', '')}
                            </button>
                        ))}
                    </div>
                    <input
                        type="number"
                        inputMode="numeric"
                        placeholder="Duration (min)"
                        value={manualWorkoutDuration}
                        onChange={e => setManualWorkoutDuration(e.target.value)}
                        className="w-full bg-white/[0.04] border border-athena-border/20 rounded-xl px-4 py-3 text-sm text-athena-text-primary focus:outline-none focus:border-athena-gold/30 min-h-[48px]"
                    />
                    <button
                        onClick={() => { handleManualWorkoutSave(); setMobileQuickLogOpen(false); }}
                        disabled={manualWorkoutSaving}
                        className="w-full py-3.5 rounded-xl bg-athena-gold text-athena-bg font-semibold text-sm min-h-[48px] disabled:opacity-50 active:scale-[0.97] transition-transform"
                    >
                        {manualWorkoutSaving ? 'Saving...' : 'Log Workout'}
                    </button>
                </div>
            )}
        </div>

        {/* ==================== DESKTOP LAYOUT ==================== */}
        <div data-onboarding="workouts-workspace" className="hidden md:block space-y-4">

            {/* ─── THIS WEEK (full-width, per-day cards) ─── */}
            {isSameMonth(currentDate, new Date()) && (
                <motion.div data-onboarding="workouts-this-week" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }} style={{ overflow: 'visible', position: 'relative', zIndex: 10 }}>
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-3">
                            <button onClick={() => setWeekPlanOpen(!weekPlanOpen)} className="hover:bg-white/5 p-1 rounded transition-colors">
                                <CalendarDays size={14} className={cn("transition-colors", weekPlanOpen ? "text-athena-gold" : "text-athena-text-muted")} />
                            </button>
                            <span className="text-xs text-athena-text-muted uppercase tracking-[0.15em] font-bold">This Week</span>
                            {weekPlanOpen && (
                                <div className="absolute top-8 left-0 mt-1 z-50 bg-athena-bg border border-athena-border rounded-xl shadow-2xl p-4 min-w-0 w-full md:min-w-[280px] md:w-auto">
                                    <div className="text-[10px] text-athena-text-muted uppercase tracking-wider font-bold mb-3">Set Weekly Plan</div>
                                    <div className="space-y-2">
                                        {weekSchedule.map((d, i) => {
                                            const planned = weekPlan[d.label];
                                            return (
                                                <div key={i} className="flex items-center gap-2">
                                                    <span className="text-[11px] text-athena-text-muted w-9 font-bold">{d.label}</span>
                                                    <div className="flex gap-1.5 flex-1">
                                                        {LABEL_OPTIONS.filter(l => !['Cardio', 'Recovery', 'Other'].includes(l)).map(label => (
                                                            <button key={label} onClick={() => updateWeekPlan(d.label, planned === label ? null : label)}
                                                                className={cn("w-5 h-5 rounded-sm transition-all border", planned === label ? "border-white/30 scale-110" : "border-transparent opacity-50 hover:opacity-100")}
                                                                style={{ background: planned === label ? (TYPE_COLORS[label] || '#6b7280') : (TYPE_COLORS[label] || '#6b7280') + '40' }}
                                                                title={label} />
                                                        ))}
                                                    </div>
                                                    {planned && <span className="text-[10px] text-athena-text-muted/60">{planned}</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <button onClick={() => setWeekPlanOpen(false)} className="mt-3 w-full text-[11px] text-athena-text-muted hover:text-athena-gold text-center py-1 transition-colors">Done</button>
                                </div>
                            )}
                        </div>

                        {/* Per-day cards */}
                        <div className="flex overflow-x-auto snap-x gap-2 pb-2 hide-scrollbar md:grid md:grid-cols-7 md:gap-2 md:overflow-visible md:snap-none md:pb-0">
                            {weekSchedule.map((d, i) => {
                                const planned = weekPlan[d.label];
                                const plannedColor = planned ? (TYPE_COLORS[planned] || '#6b7280') : null;
                                const hasWorkout = d.workouts.length > 0;
                                const displayType = hasWorkout ? d.workouts[0]?.displayType : planned;
                                const dayNote = weekPlanNotes[d.label];
                                const isRest = !planned && !hasWorkout;

                                return (
                                    <div key={i} className={cn(
                                        "flex flex-col rounded-xl border p-1.5 md:p-3 transition-all min-w-[100px] snap-start md:min-w-0 md:snap-align-none min-h-0 md:min-h-[90px]",
                                        d.isToday
                                            ? 'bg-athena-gold/10 border-athena-gold/30 shadow-[0_0_12px_rgb(var(--athena-gold)/0.15)]'
                                            : 'bg-athena-panel/40 border-athena-border/30'
                                    )}>
                                        {/* Day header row */}
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={cn("text-[11px] font-bold uppercase tracking-wider", d.isToday ? 'text-athena-gold' : 'text-athena-text-muted/60')}>{d.label}</span>
                                            {hasWorkout ? (
                                                <div className="flex gap-0.5">
                                                    {d.workouts.slice(0, 2).map((w, wi) => (
                                                        <div key={wi} className="w-3.5 h-3.5 rounded-sm" style={{ background: w.color }} title={w.displayType} />
                                                    ))}
                                                </div>
                                            ) : planned ? (
                                                <div className="w-3.5 h-3.5 rounded-sm border-2" style={{ borderColor: plannedColor || undefined }} />
                                            ) : null}
                                        </div>

                                        {/* Type label */}
                                        {displayType ? (
                                            <span className="text-[11px] font-semibold text-athena-text-primary mb-1 truncate max-w-[120px] md:max-w-none" style={{ color: TYPE_COLORS[displayType] || undefined }}>
                                                {displayType}
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-athena-text-muted/30 italic mb-1">Rest</span>
                                        )}

                                        {/* Per-day note */}
                                        {dayNote && (
                                            <p className="text-[10px] text-athena-text-muted/60 leading-snug mt-auto">{dayNote}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Deviation banner */}
                        {hasDeviation && (
                            <div className="mt-3 px-4 py-3 rounded-xl border border-athena-gold/20 bg-athena-gold/5">
                                <p className="text-[12px] text-athena-text-muted">
                                    Looks like you went off-script.{' '}
                                    <button
                                        onClick={reOptimize}
                                        disabled={weeklyPlanLoading}
                                        className="text-athena-gold hover:text-athena-gold-bright font-semibold transition-colors disabled:opacity-50"
                                    >
                                        {weeklyPlanLoading ? 'Optimizing...' : 'Re-optimize your week'}
                                    </button>
                                </p>
                            </div>
                        )}

                    </div>
                </motion.div>
            )}

            {/* Main Layout — 2 columns */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

                {/* LEFT: Workout Feed */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Card data-section="workout-log" className="bg-athena-panel/60 border-athena-border/50 backdrop-blur-sm p-2 md:p-5">
                        <div className="flex items-center gap-2 mb-2">
                            <Dumbbell className="text-athena-gold" size={14} />
                            <span className="text-[10px] text-athena-gold uppercase tracking-[0.2em] font-bold truncate">{format(currentDate, 'MMMM')} Workout Log</span>
                            <div className="flex items-center gap-1 ml-auto shrink-0">
                                <button onClick={handlePrev} className="p-0.5 hover:bg-white/5 rounded transition-colors text-athena-text-muted hover:text-athena-gold">
                                    <ChevronLeft size={12} />
                                </button>
                                <button onClick={handleNext} className="p-0.5 hover:bg-white/5 rounded transition-colors text-athena-text-muted hover:text-athena-gold">
                                    <ChevronRight size={12} />
                                </button>
                            </div>
                        </div>

                        {/* Filter Pills */}
                        <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
                            {uniqueTypes.map(type => {
                                const color = type === 'All' ? 'rgb(var(--athena-gold))' : (TYPE_COLORS[type] || '#6b7280');
                                return (
                                    <button
                                        key={type}
                                        onClick={() => setActiveFilter(type)}
                                        className={cn(
                                            "px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border",
                                            activeFilter === type
                                                ? "border-white/10 shadow-sm"
                                                : "border-transparent hover:border-white/10 text-athena-text-muted"
                                        )}
                                        style={activeFilter === type
                                            ? { color: color, borderColor: color + '40', background: color + '18' }
                                            : undefined}
                                    >
                                        {type}
                                    </button>
                                );
                            })}
                        </div>
                        {/* Per-type / All avg stats */}
                        {(() => {
                            const typeWorkouts = activeFilter === 'All' ? processed : processed.filter(w => w.displayType === activeFilter);
                            if (typeWorkouts.length === 0) return null;
                            const avgDur = Math.round(typeWorkouts.reduce((a, w) => a + (w.duration_minutes || 0), 0) / typeWorkouts.length);
                            const avgStrain = (typeWorkouts.reduce((a, w) => a + (w.strain || 0), 0) / typeWorkouts.length).toFixed(1);
                            const hrsWithHr = typeWorkouts.filter(w => w.max_hr > 0);
                            const avgHr = hrsWithHr.length > 0 ? Math.round(hrsWithHr.reduce((a, w) => a + w.max_hr, 0) / hrsWithHr.length) : null;
                            const color = activeFilter === 'All' ? 'rgb(var(--athena-gold))' : (TYPE_COLORS[activeFilter] || '#6b7280');
                            return (
                                <div className="flex items-center justify-center gap-4 mb-3 text-[10px]">
                                    <span className="text-athena-text-muted flex items-center gap-1"><Clock size={9} className="opacity-40" />{formatDuration(avgDur)} avg</span>
                                    <span className="flex items-center gap-1" style={{ color }}><Flame size={9} className="opacity-60" />{avgStrain} avg</span>
                                    {avgHr && <span className="text-athena-text-muted flex items-center gap-1"><Zap size={9} className="text-red-400/60" />{avgHr} avg</span>}
                                    {activeFilter === 'All' && <span className="text-athena-text-muted flex items-center gap-1">{stats.totalSessions} sessions · {stats.totalHours}h</span>}
                                </div>
                            );
                        })()}

                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="w-6 h-6 border-2 border-athena-text-muted/20 border-t-athena-gold/60 rounded-full animate-spin" />
                            </div>
                        ) : filteredGroupedByDate.length === 0 ? (
                            <div className="text-center py-16 flex flex-col items-center justify-center space-y-4 text-athena-text-muted bg-athena-panel/30 border border-athena-border/50 rounded-xl">
                                <Dumbbell className="w-12 h-12 opacity-20 text-athena-gold" />
                                <div className="space-y-1.5">
                                    <h3 className="text-base font-semibold text-athena-gold">Your Workout Coach</h3>
                                    <p className="text-sm text-athena-text-muted max-w-xs mx-auto">
                                        Athena builds weekly workout splits and gives AI-powered exercise prescriptions with sets, reps, and weights.
                                    </p>
                                </div>
                                {dailyTasks.some(t => /gym/i.test(t.title)) ? (
                                    <button
                                        onClick={() => {
                                            const todayLabel = format(new Date(), 'EEE');
                                            setTemplateViewType(weekPlan?.[todayLabel] || 'Push (Chest)');
                                        }}
                                        className="px-5 py-2.5 min-h-[44px] bg-athena-gold hover:bg-athena-gold-bright text-black font-serif font-bold rounded-lg shadow-[0_0_15px_rgb(var(--athena-gold)/0.3)] transition-colors text-sm"
                                    >
                                        Set Up Your First Week
                                    </button>
                                ) : (
                                    <p className="text-xs text-athena-text-dim italic">Add a gym habit on the Today page to unlock workout planning.</p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {filteredGroupedByDate.flatMap(([date, dayWorkouts]) => {
                                    const d = new Date(date + 'T12:00:00');
                                    const isToday = mounted && isSameDay(d, currentDate);
                                    const dateLabel = isToday ? 'Today' : format(d, 'EEEE, MMM d');

                                    return dayWorkouts.map((w, i) => {
                                        const prev = previousByType[w.id];
                                        const strainDelta = prev && w.strain > 0 && prev.strain > 0 ? w.strain - prev.strain : null;
                                        const durDelta = prev && w.duration_minutes > 0 && prev.duration_minutes > 0 ? w.duration_minutes - prev.duration_minutes : null;
                                        const isExpanded = expandedWorkoutId === w.id;

                                        return (
                                            <div key={`${date}-${i}`}>
                                                {/* Card header */}
                                                <div
                                                    onClick={() => toggleWorkoutExpand(w)}
                                                    className={cn("flex items-center gap-2.5 px-2.5 py-1.5 bg-white/[0.02] rounded-xl border transition-all group cursor-pointer", isExpanded ? "border-athena-gold/30 bg-athena-gold/[0.03]" : "border-athena-border/30 hover:border-athena-gold/20")}
                                                >
                                                    <div className="w-1 h-7 rounded-full shrink-0" style={{ background: w.color }} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[13px] font-semibold text-athena-text-primary truncate group-hover:text-athena-gold transition-colors">{w.displayType}</span>
                                                            <span className="text-[10px] text-athena-text-muted/50">—</span>
                                                            <span className={cn("text-[10px] shrink-0", isToday ? "text-athena-gold/70" : "text-athena-text-muted/50")}>{dateLabel}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 md:gap-3 shrink-0 flex-wrap">
                                                        {w.duration_minutes > 0 && <span className="text-[10px] text-athena-text-muted flex items-center gap-1"><Clock size={9} className="opacity-40" />{formatDuration(w.duration_minutes)}</span>}
                                                        {prev && durDelta !== null && <span className="text-[10px] font-medium text-athena-text-muted hidden md:inline"><Clock size={8} className="inline mr-0.5" />{durDelta > 0 ? '+' : ''}{Math.round(durDelta)}m</span>}
                                                        {w.strain > 0 && <span className="text-[10px] text-athena-gold font-semibold flex items-center gap-1"><Flame size={9} className="opacity-60" />{w.strain.toFixed(1)}</span>}
                                                        {prev && strainDelta !== null && <span className={cn("text-[10px] font-medium hidden md:inline", strainDelta > 0 ? "text-athena-green" : strainDelta < 0 ? "text-red-400" : "text-athena-text-muted/40")}><Flame size={8} className="inline mr-0.5" />{strainDelta > 0 ? '↑' : strainDelta < 0 ? '↓' : '='}{Math.abs(strainDelta).toFixed(1)}</span>}
                                                        {w.max_hr > 0 && <span className="text-[10px] text-athena-text-muted hidden md:flex items-center gap-1"><Zap size={9} className="text-red-400/60" />{w.max_hr}</span>}
                                                        {exerciseCounts[w.id] > 0 && <span className="text-[10px] text-athena-text-muted/50 flex items-center gap-0.5 shrink-0"><Dumbbell size={8} /> {exerciseCounts[w.id]}</span>}
                                                        {golfScores[w.id] && (() => { const gs = golfScores[w.id]; const d = gs.par > 0 ? gs.score - gs.par : 0; const c = d <= 18 ? 'text-athena-green' : d <= 27 ? 'text-athena-gold' : 'text-red-400'; return <span className={cn('text-[10px] font-semibold flex items-center gap-0.5 shrink-0', c)}><Flag size={9} className="opacity-60" /> {gs.score}</span>; })()}
                                                        <ChevronDown size={12} className={cn("text-athena-text-muted/40 transition-transform", isExpanded && "rotate-180")} />
                                                    </div>
                                                </div>

                                                {/* Inline dropdown */}
                                                {isExpanded && (
                                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ overflow: 'visible' }}>
                                                        <div className="mt-1 p-3 bg-athena-bg/80 border border-athena-border/40 rounded-xl space-y-2">
                                                            {exercisesLoading || golfLoading ? (
                                                                <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-athena-text-muted/20 border-t-athena-gold/60 rounded-full animate-spin" /></div>
                                                            ) : w.displayType === 'Golf' && golfRound ? (
                                                                /* ─── Golf Scorecard UI ─── */
                                                                <div className="space-y-3">
                                                                    <div className="space-y-1">
                                                                        <label className="text-[8px] text-athena-text-muted/50 uppercase tracking-wider font-bold">Course</label>
                                                                        <input type="text" placeholder="Course name" value={golfRound.course_name || ''}
                                                                            onChange={e => setGolfRound(prev => prev ? { ...prev, course_name: e.target.value } : prev)}
                                                                            className="w-full bg-athena-bg/50 border border-athena-border/30 rounded-lg px-3 py-1.5 text-base md:text-[12px] text-athena-text-primary focus:outline-none focus:border-athena-gold/50" />
                                                                    </div>

                                                                    {/* Scorecard — Front 9 */}
                                                                    {[0, 9].map(offset => {
                                                                        const nineHoles = golfRound.holes.slice(offset, offset + 9);
                                                                        const label = offset === 0 ? 'OUT' : 'IN';
                                                                        const totalPar = nineHoles.reduce((s, h) => s + (h.par || 0), 0);
                                                                        const totalScore = nineHoles.reduce((s, h) => s + (h.score || 0), 0);
                                                                        return (
                                                                            <div key={offset} className="overflow-x-auto -mx-2 px-2">
                                                                                <table className="w-full text-[10px] border-collapse">
                                                                                    <thead>
                                                                                        <tr>
                                                                                            <th className="text-left text-athena-text-muted/40 font-bold px-1 py-0.5 w-10">Hole</th>
                                                                                            {nineHoles.map((_, i) => (
                                                                                                <th key={i} className="text-center text-athena-text-muted/50 font-medium px-0.5 py-0.5 w-7">{offset + i + 1}</th>
                                                                                            ))}
                                                                                            <th className="text-center text-athena-text-muted/50 font-bold px-1 py-0.5 w-8 border-l border-athena-border/20">{label}</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody>
                                                                                        <tr className="border-t border-athena-border/10">
                                                                                            <td className="text-athena-text-muted/40 font-bold px-1 py-1">Par</td>
                                                                                            {nineHoles.map((h, i) => (
                                                                                                <td key={i} className="px-0.5 py-0.5">
                                                                                                    <input type="number" value={h.par ?? ''} placeholder="•"
                                                                                                        onChange={e => {
                                                                                                            const val = e.target.value ? Number(e.target.value) : null;
                                                                                                            setGolfRound(prev => {
                                                                                                                if (!prev) return prev;
                                                                                                                const holes = [...prev.holes];
                                                                                                                holes[offset + i] = { ...holes[offset + i], par: val };
                                                                                                                return { ...prev, holes };
                                                                                                            });
                                                                                                        }}
                                                                                                        className="w-full bg-transparent text-center text-athena-text-muted font-medium focus:outline-none focus:bg-athena-gold/5 rounded" />
                                                                                                </td>
                                                                                            ))}
                                                                                            <td className="text-center font-bold text-athena-text-muted border-l border-athena-border/20">{totalPar || ''}</td>
                                                                                        </tr>
                                                                                        <tr className="border-t border-athena-border/10">
                                                                                            <td className="text-athena-text-muted/40 font-bold px-1 py-1">Score</td>
                                                                                            {nineHoles.map((h, i) => {
                                                                                                const diff = h.par && h.score ? h.score - h.par : null;
                                                                                                const cellColor = diff === null ? '' : diff <= 0 ? 'text-blue-400 font-bold' : diff === 1 ? 'text-athena-green font-bold' : diff === 2 ? 'text-athena-text-primary' : diff === 3 ? 'text-red-400 font-bold' : 'text-red-500 font-bold';
                                                                                                const cellBg = diff === null ? '' : diff <= 0 ? 'bg-blue-500/10' : diff === 1 ? 'bg-athena-green/10' : diff === 2 ? '' : diff === 3 ? 'bg-red-500/5' : 'bg-red-500/10';
                                                                                                return (
                                                                                                    <td key={i} className={cn('px-0.5 py-0.5 rounded', cellBg)}>
                                                                                                        <input type="number" value={h.score ?? ''} placeholder="•"
                                                                                                            onChange={e => {
                                                                                                                const val = e.target.value ? Number(e.target.value) : null;
                                                                                                                setGolfRound(prev => {
                                                                                                                    if (!prev) return prev;
                                                                                                                    const holes = [...prev.holes];
                                                                                                                    holes[offset + i] = { ...holes[offset + i], score: val };
                                                                                                                    return { ...prev, holes };
                                                                                                                });
                                                                                                            }}
                                                                                                            className={cn('w-full bg-transparent text-center focus:outline-none focus:bg-athena-gold/5 rounded', cellColor)} />
                                                                                                    </td>
                                                                                                );
                                                                                            })}
                                                                                            <td className={cn('text-center font-bold border-l border-athena-border/20', totalScore && totalPar ? (totalScore <= totalPar + 9 ? 'text-athena-green' : totalScore <= totalPar + 18 ? 'text-athena-gold' : 'text-red-400') : 'text-athena-text-primary')}>{totalScore || ''}</td>
                                                                                        </tr>
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        );
                                                                    })}

                                                                    {/* Total summary row */}
                                                                    {(() => {
                                                                        const totalPar = golfRound.holes.reduce((s, h) => s + (h.par || 0), 0);
                                                                        const totalScore = golfRound.holes.reduce((s, h) => s + (h.score || 0), 0);
                                                                        const diff = totalPar && totalScore ? totalScore - totalPar : null;
                                                                        return totalPar > 0 || totalScore > 0 ? (
                                                                            <div className="flex items-center justify-between px-2 py-1.5 bg-white/[0.02] rounded-lg border border-athena-border/20">
                                                                                <span className="text-[10px] text-athena-text-muted font-medium">Total</span>
                                                                                <div className="flex items-center gap-4">
                                                                                    <span className="text-[10px] text-athena-text-muted">Par: <span className="font-bold text-athena-text-primary">{totalPar}</span></span>
                                                                                    <span className="text-[10px] text-athena-text-muted">Score: <span className="font-bold text-athena-text-primary">{totalScore}</span></span>
                                                                                    {diff !== null && (
                                                                                        <span className={cn('text-[12px] font-bold px-2 py-0.5 rounded', diff <= 18 ? 'text-athena-green bg-athena-green/10' : diff <= 27 ? 'text-athena-gold bg-athena-gold/10' : 'text-red-400 bg-red-500/10')}>
                                                                                            {diff === 0 ? 'E' : `${diff > 0 ? '+' : ''}${diff}`}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ) : null;
                                                                    })()}

                                                                    <input type="text" placeholder="Round notes..." value={golfRound.notes || ''}
                                                                        onChange={e => setGolfRound(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                                                                        className="w-full bg-athena-bg/50 border border-athena-border/30 rounded-lg px-3 py-1.5 text-base md:text-[10px] text-athena-text-muted focus:outline-none focus:border-athena-gold/50" />


                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {/* Workout Type — at top */}
                                                                    <div className="flex flex-wrap gap-1.5 justify-center">
                                                                        {LABEL_OPTIONS.map(label => (
                                                                            <button key={label} onClick={() => { if (label === 'Other') { setCustomLabelId(customLabelId === w.id ? null : w.id); setCustomLabelText(''); } else { setCustomLabelId(null); handleRelabel(w, label); } }} disabled={saving}
                                                                                className={cn("px-2 py-1 rounded-lg text-[10px] font-semibold transition-all border", w.displayType === label ? "text-white border-white/20" : "text-athena-text-muted border-athena-border/30 hover:bg-white/5")}
                                                                                style={w.displayType === label ? { background: TYPE_COLORS[label] || '#6b7280' } : undefined}>{label}</button>
                                                                        ))}
                                                                    </div>
                                                                    {customLabelId === w.id && (
                                                                        <form onSubmit={(e) => { e.preventDefault(); if (customLabelText.trim()) { handleRelabel(w, customLabelText.trim()); setCustomLabelId(null); setCustomLabelText(''); } }} className="flex gap-2 justify-center mt-1">
                                                                            <input type="text" value={customLabelText} onChange={(e) => setCustomLabelText(e.target.value)} placeholder="e.g. Washing Car" autoFocus
                                                                                className="bg-white/[0.04] border border-athena-border/30 rounded-lg px-3 py-1.5 text-base md:text-xs text-athena-text-primary placeholder:text-athena-text-muted/30 outline-none focus:border-athena-gold/50 w-48" />
                                                                            <button type="submit" disabled={!customLabelText.trim() || saving}
                                                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-athena-gold text-black disabled:opacity-30 hover:bg-athena-gold/90 transition-colors">Save</button>
                                                                        </form>
                                                                    )}

                                                                    {/* Unified editable exercise table */}
                                                                    <div>
                                                                        <div className="hidden md:grid md:grid-cols-[16px_1fr_50px_50px_60px_30px] gap-x-2 text-[8px] text-athena-text-muted/50 uppercase tracking-wider font-bold px-1 mb-1.5">
                                                                            <span></span><span>Exercise</span><span className="text-center">Sets</span><span className="text-center">Reps</span><span className="text-center">Weight</span><span></span>
                                                                        </div>
                                                                        {exercises.map((ex, idx) => {
                                                                            const prevEx = getPrevExercise(ex.exercise_name);
                                                                            const topSet = getTopSet(ex.set_entries);
                                                                            const prevTop = prevEx ? getTopSet(prevEx.set_entries || []) : null;
                                                                            const weightDelta = topSet && prevTop ? (topSet.weight || 0) - (prevTop.weight || 0) : null;
                                                                            const isPickingName = editingExerciseIdx === idx;
                                                                            const baseType = w.displayType?.startsWith('Push') ? 'Push' : w.displayType?.startsWith('Pull') ? 'Pull' : w.displayType === 'Legs' ? 'Legs' : w.displayType === 'Cardio' ? 'Cardio' : (w.displayType && EXERCISE_DB[w.displayType]) ? w.displayType : 'Other';
                                                                            const exerciseList = EXERCISE_DB[baseType] || ALL_EXERCISES;
                                                                            return (
                                                                                <div key={idx} className={cn("border-t border-athena-border/20 group", dragIdx === idx && "opacity-50")}
                                                                                    draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => handleDragOver(e, idx)} onDrop={() => handleDrop(idx)} onDragEnd={handleDragEnd}>
                                                                                    <div className="flex flex-col gap-1 px-1 py-1 md:grid md:grid-cols-[16px_1fr_50px_50px_60px_30px] md:gap-x-2 md:items-center">
                                                                                        {/* Drag handle */}
                                                                                        <div className="hidden md:flex cursor-grab opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center">
                                                                                            <GripVertical size={12} className="text-athena-text-muted/60 hover:text-athena-text-muted" />
                                                                                        </div>
                                                                                        {/* Exercise Name — click to pick */}
                                                                                        <div className="relative flex items-center w-full md:w-auto">
                                                                                            <button onClick={() => { setEditingExerciseIdx(isPickingName ? null : idx); setExerciseSearch(''); }}
                                                                                                className={cn("text-[11px] font-semibold truncate text-left transition-colors", ex.exercise_name ? "text-athena-text-primary hover:text-athena-gold" : "text-athena-text-muted/40 italic hover:text-athena-gold")}>
                                                                                                {ex.exercise_name || 'Select exercise'}
                                                                                            </button>
                                                                                            <button onClick={() => addSet(idx)} className="opacity-0 group-hover:opacity-100 transition-opacity p-0 ml-1" title="Add dropset">
                                                                                                <Plus size={9} className="text-athena-text-muted/30 hover:text-athena-gold" />
                                                                                            </button>
                                                                                            {isPickingName && (() => {
                                                                                                const filtered = exerciseSearch ? exerciseList.filter(n => n.toLowerCase().includes(exerciseSearch.toLowerCase())) : exerciseList;
                                                                                                const isCustom = exerciseSearch.trim() && !exerciseList.some(n => n.toLowerCase() === exerciseSearch.trim().toLowerCase());
                                                                                                return (
                                                                                                    <div className="absolute top-full left-0 z-50 mt-1 w-64 max-h-48 overflow-y-auto bg-athena-bg border border-athena-border/50 rounded-lg shadow-xl">
                                                                                                        <input autoFocus placeholder="Search or type custom..." value={exerciseSearch}
                                                                                                            onChange={e => setExerciseSearch(e.target.value)}
                                                                                                            onKeyDown={e => { if (e.key === 'Enter' && exerciseSearch.trim()) { updateExercise(idx, 'exercise_name', exerciseSearch.trim()); setEditingExerciseIdx(null); setExerciseSearch(''); } }}
                                                                                                            className="w-full px-2 py-1.5 bg-transparent text-base md:text-[10px] text-athena-text-primary border-b border-athena-border/30 focus:outline-none placeholder:text-athena-text-muted/30 sticky top-0 bg-athena-bg z-10" />
                                                                                                        <div>
                                                                                                            {isCustom && (
                                                                                                                <button onClick={() => { updateExercise(idx, 'exercise_name', exerciseSearch.trim()); setEditingExerciseIdx(null); setExerciseSearch(''); }}
                                                                                                                    className="w-full text-left px-2 py-1.5 text-[10px] text-athena-gold font-semibold hover:bg-athena-gold/10 border-b border-athena-border/20 flex items-center gap-1">
                                                                                                                    <Plus size={10} /> Add &quot;{exerciseSearch.trim()}&quot;
                                                                                                                </button>
                                                                                                            )}
                                                                                                            {filtered.map(name => (
                                                                                                                <button key={name} onClick={() => { updateExercise(idx, 'exercise_name', name); setEditingExerciseIdx(null); setExerciseSearch(''); }}
                                                                                                                    className={cn("w-full text-left px-2 py-1 text-[10px] hover:bg-athena-gold/10 transition-colors", ex.exercise_name === name ? "text-athena-gold font-semibold" : "text-athena-text-primary")}>
                                                                                                                    {name}
                                                                                                                </button>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                );
                                                                                            })()}
                                                                                        </div>
                                                                                        {/* Sets/Reps/Weight row — stacks below name on mobile, inline on desktop */}
                                                                                        <div className="flex gap-2 overflow-x-auto md:contents">
                                                                                            {/* Sets — inline editable (first set) */}
                                                                                            <input type="number" value={ex.set_entries[0]?.sets ?? ''} onChange={e => updateSet(idx, 0, 'sets', e.target.value ? Number(e.target.value) : null)}
                                                                                                placeholder="Sets"
                                                                                                className="w-20 md:w-full bg-transparent border border-athena-border/30 md:border-transparent hover:border-athena-border/30 focus:border-athena-gold/50 rounded px-1 py-0.5 text-sm md:text-[11px] text-athena-text-primary text-center focus:outline-none transition-colors font-medium" />
                                                                                            {/* Reps */}
                                                                                            <input type="number" value={ex.set_entries[0]?.reps ?? ''} onChange={e => updateSet(idx, 0, 'reps', e.target.value ? Number(e.target.value) : null)}
                                                                                                placeholder="Reps"
                                                                                                className="w-20 md:w-full bg-transparent border border-athena-border/30 md:border-transparent hover:border-athena-border/30 focus:border-athena-gold/50 rounded px-1 py-0.5 text-sm md:text-[11px] text-athena-text-primary text-center focus:outline-none transition-colors font-medium" />
                                                                                            {/* Weight */}
                                                                                            <input type="number" value={ex.set_entries[0]?.weight ?? ''} onChange={e => updateSet(idx, 0, 'weight', e.target.value ? Number(e.target.value) : null)}
                                                                                                placeholder="Wt"
                                                                                                className="w-20 md:w-full bg-transparent border border-athena-border/30 md:border-transparent hover:border-athena-border/30 focus:border-athena-gold/50 rounded px-1 py-0.5 text-sm md:text-[11px] font-bold text-center focus:outline-none transition-colors" style={{ color: w.color }} />
                                                                                            {/* Delete */}
                                                                                            <button onClick={() => removeExercise(idx)} className="p-0.5 hover:bg-red-500/10 rounded md:opacity-0 md:group-hover:opacity-100 transition-opacity justify-self-center">
                                                                                                <Trash2 size={10} className="text-athena-text-muted/30 hover:text-red-400" />
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                    {/* Dropset rows — additional set entries inline */}
                                                                                    {ex.set_entries.slice(1).map((s, si) => (
                                                                                        <div key={si + 1} className="flex gap-2 items-center px-1 py-0.5 md:grid md:grid-cols-[16px_1fr_50px_50px_60px_30px] md:gap-x-2">
                                                                                            <span className="hidden md:block"></span>
                                                                                            <span className="text-[10px] text-athena-text-muted pl-2 shrink-0">↳ set {si + 2}</span>
                                                                                            <input type="number" value={s.sets ?? ''} onChange={e => updateSet(idx, si + 1, 'sets', e.target.value ? Number(e.target.value) : null)}
                                                                                                className="w-20 md:w-full bg-transparent border border-athena-border/30 md:border-transparent hover:border-athena-border/30 focus:border-athena-gold/50 rounded px-1 py-0.5 text-sm md:text-[10px] text-athena-text-primary text-center focus:outline-none transition-colors" />
                                                                                            <input type="number" value={s.reps ?? ''} onChange={e => updateSet(idx, si + 1, 'reps', e.target.value ? Number(e.target.value) : null)}
                                                                                                className="w-20 md:w-full bg-transparent border border-transparent hover:border-athena-border/30 focus:border-athena-gold/50 rounded px-1 py-0.5 text-sm md:text-[10px] text-athena-text-primary text-center focus:outline-none transition-colors" />
                                                                                            <input type="number" value={s.weight ?? ''} onChange={e => updateSet(idx, si + 1, 'weight', e.target.value ? Number(e.target.value) : null)}
                                                                                                className="w-20 md:w-full bg-transparent border border-transparent hover:border-athena-border/30 focus:border-athena-gold/50 rounded px-1 py-0.5 text-sm md:text-[10px] font-bold text-center focus:outline-none transition-colors" style={{ color: w.color }} />
                                                                                            <button onClick={() => removeSet(idx, si + 1)} className="p-0.5 hover:bg-red-500/10 rounded md:opacity-0 md:group-hover:opacity-100 transition-opacity justify-self-center">
                                                                                                <X size={9} className="text-athena-text-muted/30 hover:text-red-400" />
                                                                                            </button>
                                                                                        </div>
                                                                                    ))}
                                                                                    {/* VS Last indicator */}
                                                                                    {weightDelta !== null && weightDelta !== 0 && (
                                                                                        <div className="px-1 pb-0.5"><span className={cn("text-[8px] font-medium", weightDelta > 0 ? "text-athena-green" : "text-red-400")}>vs last: {weightDelta > 0 ? '+' : ''}{weightDelta} lbs</span></div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                        {/* Total Volume */}
                                                                        {(() => {
                                                                            const vol = computeVolume(exercises); const prevVol = previousExercises.length > 0 ? computeVolume(previousExercises) : 0; const vDelta = prevVol > 0 ? vol - prevVol : null; return vol > 0 ? (
                                                                                <div className="flex items-center justify-between pt-2 mt-1 border-t border-athena-border/20 px-1">
                                                                                    <span className="text-[10px] text-athena-text-muted/50">Total Volume</span>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="text-[13px] font-bold text-athena-text-primary">{vol.toLocaleString()} lbs</span>
                                                                                        {vDelta !== null && vDelta !== 0 && <span className={cn("text-[10px] font-medium", vDelta > 0 ? "text-athena-green" : "text-red-400")}>{vDelta > 0 ? '+' : ''}{vDelta.toLocaleString()}</span>}
                                                                                    </div>
                                                                                </div>
                                                                            ) : null;
                                                                        })()}
                                                                    </div>

                                                                    {/* + Exercise & Save */}
                                                                    <button onClick={addExercise} className="w-full py-1.5 border border-dashed border-athena-border/40 hover:border-athena-gold/40 rounded-lg text-[10px] text-athena-text-muted hover:text-athena-gold flex items-center justify-center gap-1 transition-all"><Plus size={11} /> Add Exercise</button>
                                                                    {/* Workout Notes */}
                                                                    <textarea
                                                                        placeholder="How did it feel? Any notes for your AI coach..."
                                                                        value={workoutNotes}
                                                                        onChange={e => setWorkoutNotes(e.target.value)}
                                                                        className="w-full mt-2 bg-white/[0.04] border border-athena-border/40 rounded-lg px-3 py-2.5 text-base md:text-xs text-athena-text-primary placeholder:text-athena-text-muted/50 focus:outline-none focus:border-athena-gold/50 resize-none min-h-[56px]"
                                                                        rows={2}
                                                                    />
                                                                    {/* AI Coach Button */}
                                                                    <button onClick={() => fetchCoach('post', w.displayType, exercises, w.id, w.date)} disabled={coachLoading === 'post'}
                                                                        className="w-full py-1.5 mt-1 border border-athena-gold/20 hover:border-athena-gold/50 bg-athena-gold/5 hover:bg-athena-gold/10 rounded-lg text-[10px] text-athena-gold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50">
                                                                        {coachLoading === 'post' ? <><Sparkles size={10} className="animate-pulse" /> Analyzing...</> : <><Brain size={10} /> AI Coach</>}
                                                                    </button>
                                                                    {postCoachMap[w.id] && (
                                                                        <div className="mt-2 p-3 bg-athena-gold/5 border border-athena-gold/20 rounded-lg space-y-2">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <Brain size={10} className="text-athena-gold" />
                                                                                <span className="text-[10px] text-athena-gold font-bold uppercase">Post-Workout Review</span>
                                                                            </div>
                                                                            {(() => {
                                                                                const labels = [
                                                                                    { icon: <Flame size={8} />, label: 'Performance', color: 'text-athena-text-primary/90' },
                                                                                    { icon: <Activity size={8} />, label: 'Fatigue', color: 'text-orange-300/90' },
                                                                                    { icon: <CheckCircle size={8} />, label: 'Compliance', color: 'text-emerald-300/90' },
                                                                                    { icon: <BarChart3 size={8} />, label: 'Progress', color: 'text-blue-300/90' },
                                                                                    { icon: <Moon size={8} />, label: 'Recovery', color: 'text-purple-300/90' },
                                                                                ];
                                                                                return (postCoachMap[w.id].notes || []).map((n, i) => (
                                                                                    <div key={i}>
                                                                                        {labels[i] && <span className={`text-[8px] font-bold uppercase tracking-wider flex items-center gap-1 ${labels[i].color}`}>{labels[i].icon} {labels[i].label}</span>}
                                                                                        <p className="text-[10px] text-athena-text-primary/80 leading-relaxed">{n}</p>
                                                                                    </div>
                                                                                ));
                                                                            })()}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </div>
                                        );
                                    });
                                })}
                            </div>
                        )}
                    </Card>
                </motion.div>

                {/* RIGHT: Today's Workout Sidebar */}
                <div className="space-y-4">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                        <Card className="bg-athena-panel/60 border-athena-border/50 backdrop-blur-sm p-5">

                            {/* ─── TODAY'S WORKOUT ─── */}
                            <div>
                                <div className="flex items-center gap-1.5 mb-4">
                                    <Dumbbell size={14} className="text-athena-text-muted shrink-0" />
                                    <span className="text-[13px] text-athena-text-muted uppercase tracking-[0.08em] font-bold whitespace-nowrap">
                                        Today{(() => { const t = weekPlan[format(new Date(), 'EEE')]; return t ? `: ${t}` : ''; })()}
                                    </span>
                                    {(() => {
                                        const coachIntensity = templateViewType ? preCoachMap[templateViewType]?.intensity : null;
                                        if (!coachIntensity) return null;
                                        return (
                                            <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0",
                                                coachIntensity === 'push' ? "text-green-400 bg-green-400/10" :
                                                    coachIntensity === 'deload' ? "text-red-400 bg-red-400/10" :
                                                        "text-athena-gold bg-athena-gold/10"
                                            )}>
                                                {coachIntensity === 'push' ? '↑' : coachIntensity === 'deload' ? '↓' : '→'}
                                            </span>
                                        );
                                    })()}
                                    <div className="flex items-center gap-2 ml-auto shrink-0">
                                        {whoopEnabled && todayRecovery !== null && (
                                            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded", todayRecovery >= 67 ? "text-green-400 bg-green-400/10" : todayRecovery >= 34 ? "text-athena-gold bg-athena-gold/10" : "text-red-400 bg-red-400/10")}>
                                                {todayRecovery}%
                                            </span>
                                        )}
                                        <button onClick={() => setTemplateEditing(!templateEditing)} className={cn("text-[10px] transition-colors", templateEditing ? "text-athena-gold" : "text-athena-text-muted/40 hover:text-athena-gold")}>
                                            {templateEditing ? 'Done' : 'Edit'}
                                        </button>
                                    </div>
                                </div>
                                {/* Type selector */}
                                <div className="flex gap-1 mb-4 justify-center items-center">
                                    {liftingTypes.map(type => {
                                        const color = TYPE_COLORS[type] || '#6b7280';
                                        const isActive = templateViewType === type;
                                        return (
                                            <button key={type} onClick={() => setTemplateViewType(type)}
                                                className={cn("px-2 py-1 rounded text-[11px] font-semibold transition-all border", isActive ? "border-white/10" : "border-transparent text-athena-text-muted")}
                                                style={isActive ? { color, borderColor: color + '40', background: color + '18' } : undefined}>
                                                {type.match(/\((.+)\)/) ? type.match(/\((.+)\)/)![1] : type}
                                            </button>
                                        );
                                    })}
                                    <button onClick={() => setManageTypesOpen(true)} className="px-1.5 py-1 text-[10px] text-athena-text-dim/40 hover:text-athena-text-muted transition-colors" title="Manage workout types">
                                        <Settings size={12} />
                                    </button>
                                </div>
                                {/* Template exercises + AI suggestions */}
                                {templateViewType && (() => {
                                    const tmpl = workoutTemplates[templateViewType] || [];
                                    const typeColor = TYPE_COLORS[templateViewType] || '#9ca3af';
                                    const preCoachData = templateViewType ? preCoachMap[templateViewType] || null : null;
                                    const weightNotes = preCoachData ? (preCoachData.weightNotes || {}) : {};
                                    const suggestions = preCoachData ? (preCoachData.exerciseSuggestions || []) : [];
                                    return (
                                        <div className="space-y-1.5">
                                            {/* Template exercises */}
                                            {(() => {
                                                const swappedOut = new Set<string>();
                                                suggestions.forEach(s => {
                                                    const m = s.match(/\(swap\s+for\s+(.+?)\)$/i);
                                                    if (m) swappedOut.add(m[1].trim());
                                                });
                                                const aiOrder = preCoachData?.exerciseOrder || [];
                                                const orderedTmpl = aiOrder.length > 0
                                                    ? [...tmpl].sort((a, b) => {
                                                        const aIdx = aiOrder.findIndex(o => o.toLowerCase() === a.exercise_name.toLowerCase());
                                                        const bIdx = aiOrder.findIndex(o => o.toLowerCase() === b.exercise_name.toLowerCase());
                                                        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                                                    })
                                                    : tmpl;
                                                return orderedTmpl.length > 0 ? orderedTmpl.map((ex, i) => {
                                                    const note = weightNotes[ex.exercise_name];
                                                    const isKeep = note && /^keep\b/i.test(note.trim());
                                                    const isSwappedOut = swappedOut.has(ex.exercise_name);
                                                    const lastExs = lastWorkoutExercises[templateViewType] || [];
                                                    const lastEx = lastExs.find((e: any) => e.exercise_name?.toLowerCase() === ex.exercise_name.toLowerCase());
                                                    const lastSets = lastEx?.set_entries || [];
                                                    const lastSummary = lastSets.length > 0
                                                        ? lastSets.map((s: any) => `${s.sets && s.sets > 1 ? s.sets + '×' : ''}${s.reps || '?'}@${s.weight || '?'}`).join(', ')
                                                        : null;
                                                    const nextTarget = preCoachData?.nextSessionTargets?.[ex.exercise_name] || null;
                                                    return (
                                                        <div key={i} className={cn("px-2.5 py-2 rounded-lg border", isSwappedOut ? "bg-white/[0.01] border-athena-border/10 opacity-50" : "bg-white/[0.02] border-athena-border/20")}>
                                                            <div className="flex items-center gap-2">
                                                                <span className={cn("text-[13px] font-semibold min-w-0", isSwappedOut && "line-through")} style={{ color: isSwappedOut ? undefined : typeColor, ...(isSwappedOut ? { color: 'rgb(156 163 175 / 0.5)' } : {}) }}>{ex.exercise_name}</span>
                                                                {templateEditing && (
                                                                    <button onClick={() => {
                                                                        const next = { ...workoutTemplates, [templateViewType]: tmpl.filter((_, j) => j !== i) };
                                                                        saveTemplates(next);
                                                                    }} className="p-0.5 hover:bg-red-500/10 rounded"><X size={11} className="text-athena-text-muted/30 hover:text-red-400" /></button>
                                                                )}
                                                            </div>
                                                            {!isSwappedOut && !templateEditing && (() => {
                                                                const warmUpNote = preCoachData?.warmUp?.[ex.exercise_name];
                                                                return (note || warmUpNote || lastSummary) ? (
                                                                    <div className="mt-1 space-y-0.5">
                                                                        {warmUpNote && <div className="text-[11px] text-athena-text-muted/60 font-mono">Warm-up: {warmUpNote}</div>}
                                                                        {note && !isKeep && <div className="text-[12px] text-athena-gold/90 font-mono font-semibold">{note}</div>}
                                                                        {lastSummary && <div className="text-[11px] text-athena-text-muted/40 font-mono tracking-tight">Last: {lastSummary} lbs</div>}
                                                                    </div>
                                                                ) : null;
                                                            })()}
                                                        </div>
                                                    );
                                                }) : (
                                                    <div className="text-center py-4 text-[11px] text-athena-text-muted/40">No template set</div>
                                                );
                                            })()}
                                            {/* AI-suggested exercise swaps */}
                                            {suggestions.filter(s => !tmpl.some(t => t.exercise_name === s)).map((name, i) => {
                                                const swapMatch = name.match(/^(.+?)\s*\(swap\s+for\s+(.+?)\)$/i);
                                                const displayName = swapMatch ? swapMatch[1].trim() : name;
                                                const sugTarget = preCoachData?.weightNotes?.[displayName] || preCoachData?.nextSessionTargets?.[displayName] || null;
                                                return (
                                                    <div key={`sug-${i}`} className="px-2.5 py-2 bg-athena-gold/5 rounded-lg border border-athena-gold/20">
                                                        <div className="flex items-center gap-2">
                                                            <Sparkles size={11} className="text-athena-gold shrink-0" />
                                                            <span className="text-[13px] font-semibold flex-1 min-w-0" style={{ color: typeColor }}>{displayName}</span>
                                                            <span className="text-[10px] text-athena-gold uppercase font-bold shrink-0">{swapMatch ? 'swap' : 'add'}</span>
                                                        </div>
                                                        {sugTarget
                                                            ? <div className="text-[11px] text-athena-gold/80 font-mono mt-0.5 pl-6">{sugTarget}</div>
                                                            : <div className="text-[10px] text-athena-text-muted/30 mt-0.5 pl-6">No weight target provided</div>
                                                        }
                                                    </div>
                                                );
                                            })}
                                            {/* Add exercise (edit mode) */}
                                            {templateEditing && (() => {
                                                const baseType = templateViewType.startsWith('Push') ? 'Push' : templateViewType.startsWith('Pull') ? 'Pull' : templateViewType;
                                                const available = (EXERCISE_DB[baseType] || ALL_EXERCISES).filter(e => !tmpl.some(t => t.exercise_name === e));
                                                return templateAddOpen ? (
                                                    <div className="mt-2 border border-athena-border/30 rounded-lg overflow-hidden">
                                                        <input autoFocus placeholder="Search exercises..." value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter' && exerciseSearch.trim()) {
                                                                    const filtered = available.filter(n => n.toLowerCase().includes(exerciseSearch.toLowerCase()));
                                                                    const name = filtered.length > 0 ? filtered[0] : exerciseSearch.trim();
                                                                    const next = { ...workoutTemplates, [templateViewType]: [...tmpl, { exercise_name: name }] };
                                                                    saveTemplates(next);
                                                                    setExerciseSearch('');
                                                                    setTemplateAddOpen(false);
                                                                }
                                                            }}
                                                            className="w-full px-3 py-2 bg-transparent text-base md:text-[12px] text-athena-text-primary border-b border-athena-border/30 focus:outline-none placeholder:text-athena-text-muted/30" />
                                                        <div className="max-h-36 overflow-y-auto">
                                                            {available.filter(n => !exerciseSearch || n.toLowerCase().includes(exerciseSearch.toLowerCase())).map(name => (
                                                                <button key={name} onClick={() => {
                                                                    const next = { ...workoutTemplates, [templateViewType]: [...tmpl, { exercise_name: name }] };
                                                                    saveTemplates(next);
                                                                    setExerciseSearch('');
                                                                    setTemplateAddOpen(false);
                                                                }} className="w-full text-left px-3 py-1.5 text-[12px] text-athena-text-primary hover:bg-athena-gold/10 transition-colors">
                                                                    {name}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setTemplateAddOpen(true)} className="w-full mt-2 py-2 border border-dashed border-athena-border/30 hover:border-athena-gold/40 rounded-lg text-[11px] text-athena-text-muted hover:text-athena-gold flex items-center justify-center gap-1.5 transition-all">
                                                        <Plus size={11} /> Add exercise
                                                    </button>
                                                );
                                            })()}
                                            {!templateEditing && tmpl.length > 0 && !preCoachData && (
                                                <div className="mt-3 space-y-2">
                                                    <DataGate feature="coachNotes" compact>
                                                    <button
                                                        onClick={() => fetchCoach('pre', templateViewType)}
                                                        disabled={coachLoading === 'pre'}
                                                        className="w-full py-2.5 rounded-lg bg-athena-gold/10 text-athena-gold text-[11px] font-semibold border border-athena-gold/20 hover:bg-athena-gold/15 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                                                    >
                                                        {coachLoading === 'pre' ? <><Sparkles size={12} className="animate-pulse" /> Generating...</> : <><Brain size={12} /> Pre-Workout Coach</>}
                                                    </button>
                                                    <div className="text-[10px] text-athena-text-muted/30 text-center">{tmpl.length} exercises · auto-fills new workouts</div>
                                                    </DataGate>
                                                </div>
                                            )}
                                            {/* Coach reasoning notes (below exercises) */}
                                            {preCoachData && (preCoachData.notes?.length > 0 || (preCoachData.warnings?.length > 0 && preCoachData.warnings[0])) && (
                                                <div className="mt-2 bg-athena-panel border border-athena-border rounded-xl p-4 space-y-3">
                                                    <button
                                                        onClick={() => fetchCoach('pre', templateViewType)}
                                                        disabled={coachLoading === 'pre'}
                                                        className="flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                                                    >
                                                        {coachLoading === 'pre' ? <Sparkles size={14} className="text-athena-gold animate-pulse" /> : <Brain size={14} className="text-athena-gold/60" />}
                                                        <span className="text-[9px] text-athena-text-muted uppercase tracking-[0.25em] font-bold">Coach Notes</span>
                                                    </button>
                                                    {(preCoachData.notes || []).map((n: string, i: number) => {
                                                        // First note is recovery assessment — render differently
                                                        if (i === 0) {
                                                            return (
                                                                <div key={i} className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-athena-border/30">
                                                                    <p className="text-sm text-athena-text-primary/80 leading-relaxed">{n}</p>
                                                                </div>
                                                            );
                                                        }
                                                        // Strategy notes — highlight exercise name
                                                        const colonIdx = n.indexOf(':');
                                                        if (colonIdx > 0 && colonIdx < 40) {
                                                            const exerciseName = n.slice(0, colonIdx);
                                                            const detail = n.slice(colonIdx + 1).trim();
                                                            return (
                                                                <div key={i} className="flex items-start gap-2">
                                                                    <span className="text-athena-gold mt-0.5 text-[10px]">--</span>
                                                                    <div>
                                                                        <span className="text-sm text-athena-text-primary font-semibold">{exerciseName}</span>
                                                                        <p className="text-sm text-athena-text-muted/60 leading-relaxed">{detail}</p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return <p key={i} className="text-sm text-athena-text-muted/70 leading-relaxed flex items-start gap-2"><span className="text-athena-gold mt-0.5 text-[10px]">--</span><span>{n}</span></p>;
                                                    })}
                                                    {preCoachData.warnings && preCoachData.warnings.length > 0 && preCoachData.warnings[0] && (
                                                        <p className="text-sm text-red-400/70 leading-relaxed flex items-start gap-1.5"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {preCoachData.warnings[0]}</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                                {!templateViewType && (
                                    <div className="text-center py-4 text-[11px] text-athena-text-muted/40">Select a type above</div>
                                )}
                            </div>

                            {/* ─── SECTION 3: LOG WORKOUT (non-WHOOP only) ─── */}
                            {isSameMonth(currentDate, new Date()) && !whoopEnabled && (
                                <div className="border-t border-athena-border/20 mt-4 pt-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Plus size={14} className="text-athena-text-muted" />
                                        <span className="text-xs text-athena-text-muted uppercase tracking-[0.15em] font-bold">Log Workout</span>
                                    </div>
                                    {!manualWorkoutOpen ? (
                                        <button onClick={() => setManualWorkoutOpen(true)}
                                            className="w-full px-3 py-2.5 rounded-lg bg-athena-gold/10 text-athena-gold text-xs font-semibold hover:bg-athena-gold/20 border border-athena-gold/20 transition-all">
                                            Add Workout
                                        </button>
                                    ) : (
                                        <div className="space-y-2.5">
                                            <select value={manualWorkoutType} onChange={e => setManualWorkoutType(e.target.value)}
                                                className="w-full bg-athena-bg border border-athena-border rounded-lg px-3 py-2 text-base md:text-xs text-athena-text-primary focus:outline-none focus:border-athena-gold/40">
                                                {LABEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                            <input type="number" placeholder="Duration (minutes)" value={manualWorkoutDuration}
                                                onChange={e => setManualWorkoutDuration(e.target.value)}
                                                className="w-full bg-athena-bg border border-athena-border rounded-lg px-3 py-2 text-base md:text-xs text-athena-text-primary placeholder:text-athena-text-muted/40 focus:outline-none focus:border-athena-gold/40" />
                                            <textarea placeholder="Notes (optional)" value={manualWorkoutNotes}
                                                onChange={e => setManualWorkoutNotes(e.target.value)}
                                                className="w-full bg-athena-bg border border-athena-border rounded-lg px-3 py-2 text-base md:text-xs text-athena-text-primary placeholder:text-athena-text-muted/40 focus:outline-none focus:border-athena-gold/40 resize-none h-16" />
                                            <div className="flex gap-2">
                                                <button onClick={handleManualWorkoutSave} disabled={manualWorkoutSaving}
                                                    className="flex-1 px-3 py-2 rounded-lg bg-athena-gold/20 text-athena-gold text-xs font-semibold hover:bg-athena-gold/30 border border-athena-gold/30 transition-all disabled:opacity-50">
                                                    {manualWorkoutSaving ? 'Saving...' : 'Save'}
                                                </button>
                                                <button onClick={() => setManualWorkoutOpen(false)}
                                                    className="px-3 py-2 rounded-lg bg-white/5 text-athena-text-muted text-xs hover:bg-white/10 transition-all">
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                        </Card>
                    </motion.div>
                </div>
            </div >

            {/* Volume Trends Chart */}
            {volumeTrendData.length >= 2 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <Card className="bg-athena-panel/60 border-athena-border/50 backdrop-blur-sm p-2 md:p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <BarChart3 className="text-athena-gold" size={14} />
                            <span className="text-[10px] text-athena-gold uppercase tracking-[0.2em] font-bold">
                                Volume Trends{activeFilter !== 'All' ? ` — ${activeFilter}` : ''}
                            </span>
                            <span className="text-[10px] text-athena-text-muted ml-auto">
                                {volumeTrendData.length} sessions · {Math.round(volumeTrendData.reduce((a, d) => a + d.volume, 0)).toLocaleString()} lbs total
                            </span>
                        </div>
                        <div className="w-full h-[200px] md:h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={volumeTrendData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                                        axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                                        axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                        tickLine={false}
                                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                                        width={36}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: 'rgba(20,20,25,0.95)',
                                            border: '1px solid rgb(var(--athena-gold-dim))',
                                            borderRadius: '8px',
                                            fontSize: '11px',
                                            color: '#e5e5e5',
                                        }}
                                        formatter={(value: any) => [`${Number(value).toLocaleString()} lbs`, 'Volume']}
                                        labelStyle={{ color: 'rgb(var(--athena-gold))', fontWeight: 600, marginBottom: 2 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="volume"
                                        stroke="rgb(var(--athena-gold))"
                                        strokeWidth={2}
                                        dot={{ fill: 'rgb(var(--athena-gold))', r: 3, strokeWidth: 0 }}
                                        activeDot={{ fill: 'rgb(var(--athena-gold))', r: 5, strokeWidth: 2, stroke: 'rgb(var(--athena-gold-dim))' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </motion.div>
            )}

        </div >

        {/* Manage Workout Types Dialog */}
        {manageTypesOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-athena-bg border border-athena-border rounded-2xl p-6 max-w-sm w-[90vw]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-serif text-athena-gold">Workout Types</h3>
                        <button onClick={() => setManageTypesOpen(false)} className="p-2 text-athena-text-dim hover:text-athena-text-muted min-w-[44px] min-h-[44px] flex items-center justify-center"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="space-y-2 mb-4">
                        {liftingTypes.map((type, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-athena-border/50 bg-white/[0.02]">
                                <span className="text-sm text-athena-text-primary">{type}</span>
                                <button onClick={() => updateLiftingTypes(liftingTypes.filter((_, j) => j !== i))}
                                    className="p-1.5 text-athena-text-dim hover:text-red-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        <div className="flex gap-2">
                            <input value={newTypeInput} onChange={(e) => setNewTypeInput(e.target.value)} placeholder="Add type"
                                className="flex-1 bg-athena-bg border border-athena-border rounded-lg px-3 py-2 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50"
                                onKeyDown={(e) => { if (e.key === 'Enter' && newTypeInput.trim()) { updateLiftingTypes([...liftingTypes, newTypeInput.trim()]); setNewTypeInput(''); } }} />
                            <button onClick={() => { if (newTypeInput.trim()) { updateLiftingTypes([...liftingTypes, newTypeInput.trim()]); setNewTypeInput(''); } }}
                                disabled={!newTypeInput.trim()}
                                className="px-4 py-2 rounded-lg bg-athena-gold text-athena-bg text-sm font-bold disabled:opacity-40 hover:brightness-110 transition-all min-h-[44px]">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <button onClick={() => setManageTypesOpen(false)}
                        className="w-full py-2.5 rounded-xl bg-athena-gold/20 text-athena-gold text-sm font-semibold border border-athena-gold/30 hover:bg-athena-gold/30 transition-all min-h-[44px]">
                        Done
                    </button>
                </div>
            </div>
        )}

        {/* Mobile Coach Notes Drawer */}
        <MobileDrawerSheet open={coachDrawerOpen} onClose={() => setCoachDrawerOpen(false)} title="Pre-Workout Coach">
            {(() => {
                const todayType = templateViewType || '';
                const notes = preCoachMap[todayType];
                if (!notes) return <p className="text-sm text-athena-text-muted">No coach notes yet. Tap Coach to generate.</p>;
                return (
                    <div className="space-y-4">
                        {notes.intensity && (
                            <div className="text-xs text-athena-gold uppercase tracking-wider font-bold">
                                {notes.intensity === 'push' ? 'Push intensity' : notes.intensity === 'deload' ? 'Deload' : 'Maintain intensity'}
                            </div>
                        )}
                        {notes.notes?.length > 0 && (
                            <div className="space-y-2">
                                {notes.notes.map((n, i) => <p key={i} className="text-sm text-athena-text-primary">{n}</p>)}
                            </div>
                        )}
                        {notes.exerciseOrder?.length > 0 && (
                            <div className="space-y-1.5">
                                <div className="text-xs text-athena-text-muted uppercase tracking-wider font-bold">Exercises</div>
                                {notes.exerciseOrder.map((ex, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                        <span className="text-athena-text-primary">{ex}</span>
                                        {notes.weightNotes?.[ex] && <span className="text-athena-text-muted">{notes.weightNotes[ex]}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {notes.warmUp && Object.keys(notes.warmUp).length > 0 && (
                            <div className="space-y-1">
                                <div className="text-xs text-athena-text-muted uppercase tracking-wider font-bold">Warm-up</div>
                                {Object.entries(notes.warmUp).map(([ex, sets]) => (
                                    <div key={ex} className="flex justify-between text-sm">
                                        <span className="text-athena-text-primary">{ex}</span>
                                        <span className="text-athena-text-muted">{sets}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {notes.warnings?.length > 0 && notes.warnings[0] && (
                            <div className="text-sm text-amber-400">{notes.warnings[0]}</div>
                        )}
                    </div>
                );
            })()}
        </MobileDrawerSheet>

        {/* Mobile Week Plan Drawer (editable) */}
        <MobileDrawerSheet open={weekPlanDrawerOpen} onClose={() => setWeekPlanDrawerOpen(false)} title="This Week's Plan">
            <div className="space-y-3">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => {
                    const type = weekPlan[day] || '';
                    const note = weekPlanNotes[day];
                    return (
                        <div key={day} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                            <span className="text-xs text-athena-text-muted font-bold uppercase w-8 shrink-0">{day}</span>
                            <select
                                value={type}
                                onChange={e => updateWeekPlan(day, e.target.value || null)}
                                className="flex-1 bg-athena-bg border border-athena-border rounded-lg px-2 py-2 text-xs text-athena-text-primary focus:outline-none min-h-[44px]"
                                style={{ color: type ? TYPE_COLORS[type] : undefined }}
                            >
                                <option value="">Rest</option>
                                {LABEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                    );
                })}
                {weeklyReasoning && <p className="text-xs text-athena-text-muted italic pt-2">{weeklyReasoning}</p>}
                <button
                    onClick={() => { fetchWeeklyPlan(); }}
                    disabled={weeklyPlanLoading}
                    className="w-full mt-2 px-4 py-2.5 rounded-lg border border-athena-gold/30 bg-athena-gold/10 text-athena-gold text-xs font-semibold min-h-[44px] disabled:opacity-50"
                >
                    {weeklyPlanLoading ? 'Generating...' : 'Generate AI Plan'}
                </button>
            </div>
        </MobileDrawerSheet>

        {/* Mobile Log Workout Drawer */}
        <MobileDrawerSheet open={manualWorkoutOpen} onClose={() => setManualWorkoutOpen(false)} title="Log Workout">
            <div className="space-y-3">
                <div>
                    <label className="text-xs text-white/50 mb-1 block">Workout Type</label>
                    <select value={manualWorkoutType} onChange={e => setManualWorkoutType(e.target.value)}
                        className="w-full bg-[#0e0c0a] border border-white/10 rounded-xl px-3 py-3 text-sm text-athena-text-primary focus:outline-none focus:border-athena-gold/40 min-h-[44px]">
                        {LABEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-white/50 mb-1 block">Duration (minutes)</label>
                    <input type="number" placeholder="Optional" value={manualWorkoutDuration} onChange={e => setManualWorkoutDuration(e.target.value)}
                        className="w-full bg-[#0e0c0a] border border-white/10 rounded-xl px-3 py-3 text-sm text-athena-text-primary focus:outline-none focus:border-athena-gold/40 min-h-[44px]" />
                </div>
                <div>
                    <label className="text-xs text-white/50 mb-1 block">Notes</label>
                    <textarea placeholder="Optional" value={manualWorkoutNotes} onChange={e => setManualWorkoutNotes(e.target.value)}
                        className="w-full bg-[#0e0c0a] border border-white/10 rounded-xl px-3 py-3 text-sm text-athena-text-primary focus:outline-none focus:border-athena-gold/40 min-h-[80px] resize-none" />
                </div>
                <div className="flex gap-2 pt-1">
                    <button onClick={() => { handleManualWorkoutSave(); }} disabled={manualWorkoutSaving}
                        className="flex-1 px-4 py-3 rounded-xl bg-athena-gold text-[#020204] font-semibold text-sm min-h-[44px] active:scale-[0.97] transition-transform disabled:opacity-50">
                        {manualWorkoutSaving ? 'Saving...' : 'Log Workout'}
                    </button>
                    <button onClick={() => setManualWorkoutOpen(false)}
                        className="px-4 py-3 rounded-xl bg-white/5 text-white/50 text-sm min-h-[44px]">
                        Cancel
                    </button>
                </div>
            </div>
        </MobileDrawerSheet>

        {/* Mobile contextual action bar */}
        <div className="fixed bottom-0 left-0 right-0 md:hidden bg-athena-bg/90 backdrop-blur-sm border-t border-athena-border z-40 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-around h-14">
                <button onClick={() => setManualWorkoutOpen(true)} className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center">
                    <Plus size={18} className="text-white/25" />
                    <span className="text-[10px] text-white/25 uppercase tracking-widest">Log</span>
                </button>
                <button
                    onClick={() => {
                        const todayType = templateViewType || '';
                        if (preCoachMap[todayType]) {
                            setCoachDrawerOpen(true);
                        } else {
                            toast('No coach notes for today');
                        }
                    }}
                    className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center"
                >
                    <Brain size={18} className="text-white/25" />
                    <span className="text-[10px] text-white/25 uppercase tracking-widest">Coach</span>
                </button>
                <button
                    onClick={() => setWeekPlanDrawerOpen(true)}
                    disabled={weeklyPlanLoading}
                    className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center disabled:opacity-50"
                >
                    <CalendarDays size={18} className={weeklyPlanLoading ? 'text-athena-gold animate-pulse' : 'text-white/25'} />
                    <span className="text-[10px] text-white/25 uppercase tracking-widest">Plan Week</span>
                </button>
            </div>
        </div>

        </>
        </DataMaturityProvider>
    );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="px-3 py-2.5 bg-white/[0.02] rounded-lg border border-athena-border/20">
            <div className="text-[8px] text-athena-text-muted uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-lg font-serif font-bold ${color}`}>{value}</div>
        </div>
    );
}
