'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Plus, Rocket, BookOpen, Clock, Activity, Target,
    Layers, GripVertical, MoreHorizontal, Brain,
    Zap, TrendingUp, Calendar as CalendarIcon,
    FileText, Video, ArrowRight, Check, Star,
    ChevronLeft, ChevronRight, Flame, Sparkles, Library,
    BarChart3, Eye, BookMarked, Construction,
    Play, ExternalLink, MessageSquare, Lightbulb, CheckCircle2, List,
    Loader2, Search, X, Folder
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    Bar, ComposedChart, Line, CartesianGrid
} from 'recharts';

import { createClient } from '@/utils/supabase/client';
import { Project, Task, Section, Milestone } from '@/types/productivity';

import { toast } from 'sonner';
import { differenceInDays, parseISO } from 'date-fns';
import { BrainDumpModal } from './projects-v2/BrainDumpModal';
import { AthenaPlanner } from './AthenaPlanner';
import { BurndownPrediction } from './projects-v2/charts/BurndownPrediction';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts';
import { MobileTaskEditor } from './calendar/MobileTaskEditor';

export function processTaskDate(dateString: string | null | undefined) {
    if (!dateString) return null;
    const datePart = dateString.split('T')[0];
    if (!datePart) return null;
    const localDueDate = new Date(`${datePart}T12:00:00`);
    localDueDate.setHours(0, 0, 0, 0);
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const diffTime = localDueDate.getTime() - todayMidnight.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    return {
        formatted: localDueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        isOverdue: diffDays < 0,
        isToday: diffDays === 0,
        daysUntilDue: diffDays,
        rawTimestamp: localDueDate.getTime()
    };
}

function GlowRing({ pct, size = 44, strokeWidth = 3, color = 'text-athena-gold', children }: {
    pct: number; size?: number; strokeWidth?: number; color?: string; children?: React.ReactNode;
}) {
    const r = (size - strokeWidth) / 2;
    const circ = 2 * Math.PI * r;
    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg className="w-full h-full transform -rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-white/5" />
                <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent"
                    strokeDasharray={circ} strokeDashoffset={circ - circ * pct} strokeLinecap="round" className={color} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">{children}</div>
        </div>
    );
}

const TT = { background: '#0e0c0a', border: '1px solid rgba(50,44,34,0.5)', borderRadius: 10, fontSize: 11, color: '#ede8df' };

const ICON_MAP: Record<string, any> = {
    brain: Brain, rocket: Rocket, target: Target, zap: Zap,
    cpu: Activity, code: FileText, briefcase: Layers, folder: BookOpen,
};

const COLOR_MAP: Record<string, { text: string; accent: string }> = {
    blue: { text: "text-blue-400", accent: "#60a5fa" },
    purple: { text: "text-purple-400", accent: "#a78bfa" },
    green: { text: "text-green-400", accent: "#4ade80" },
    orange: { text: "text-orange-400", accent: "#fb923c" },
    red: { text: "text-red-400", accent: "#f87171" },
    gold: { text: "text-athena-gold", accent: "#d4a843" },
    teal: { text: "text-teal-400", accent: "#2dd4bf" },
    slate: { text: "text-zinc-400", accent: "#a1a1aa" },
};

function getProjectStyles(name: string, emoji?: string, color?: string) {
    // Prefer DB-stored values, fall back to name-based guessing
    const resolvedIcon = emoji && ICON_MAP[emoji] ? ICON_MAP[emoji] : null;
    const resolvedColor = color && COLOR_MAP[color] ? COLOR_MAP[color] : null;

    if (resolvedIcon && resolvedColor) {
        return { icon: resolvedIcon, color: resolvedColor.text, accent: resolvedColor.accent };
    }

    // Name-based fallback
    const l = name.toLowerCase();
    const fallbackIcon = resolvedIcon || (l.includes('athena') ? Rocket : l.includes('personal') ? Zap : Layers);
    const fallbackColor = resolvedColor || (l.includes('athena') ? COLOR_MAP.gold : l.includes('personal') ? COLOR_MAP.teal : COLOR_MAP.slate);

    return { icon: fallbackIcon, color: fallbackColor.text, accent: fallbackColor.accent };
}

function ManualProjectForm({ onCreate, onCancel }: {
    onCreate: (name: string, description: string) => Promise<void>;
    onCancel: () => void;
}) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSubmitting(true);
        await onCreate(name.trim(), description.trim());
        setSubmitting(false);
    };

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
            <input
                type="text"
                placeholder="Project name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                required
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-athena-border text-athena-text-primary text-base md:text-sm placeholder:text-athena-text-muted/40 focus:outline-none focus:border-athena-gold/40"
            />
            <input
                type="text"
                placeholder="Description (optional)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-athena-border text-athena-text-primary text-base md:text-sm placeholder:text-athena-text-muted/40 focus:outline-none focus:border-athena-gold/40"
            />
            <div className="flex gap-3 justify-center">
                <Button
                    type="submit"
                    disabled={!name.trim() || submitting}
                    className="bg-athena-gold hover:bg-athena-gold-bright text-black font-serif font-bold border-0 tracking-wide min-h-[44px] disabled:opacity-50"
                >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Create Project
                </Button>
                <Button
                    type="button"
                    onClick={onCancel}
                    variant="outline"
                    className="border-athena-border text-athena-text-primary hover:bg-white/5 font-serif tracking-wide min-h-[44px]"
                >
                    Cancel
                </Button>
            </div>
        </form>
    );
}

export function DevelopmentProjectsWorkspace() {
    const supabase = createClient();
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [sections, setSections] = useState<Section[]>([]);
    const [linkedResources, setLinkedResources] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const searchInputRef = React.useRef<HTMLInputElement>(null);

    // View States
    const [isBrainDumpOpen, setIsBrainDumpOpen] = useState(false);
    const [isPlannerOpen, setIsPlannerOpen] = useState(false);
    const [showManualCreate, setShowManualCreate] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const [sectionPage, setSectionPage] = useState(0);
    const [showAllProjects, setShowAllProjects] = useState(false);
    const [showCompleted, setShowCompleted] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState("");
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

    // Editing States
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [descValue, setDescValue] = useState("");
    const [isEditingProjName, setIsEditingProjName] = useState(false);
    const [projNameValue, setProjNameValue] = useState("");
    const [isAddingSection, setIsAddingSection] = useState(false);
    const [newSectionName, setNewSectionName] = useState("");

    // Task Creation Modal States
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [mobileTaskDraft, setMobileTaskDraft] = useState<Task | null>(null);
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [newTaskName, setNewTaskName] = useState("");
    const [newStartDate, setNewStartDate] = useState<Date | undefined>(new Date());
    const [newTaskDate, setNewTaskDate] = useState<Date | undefined>(new Date());
    const [startCalendarOpen, setStartCalendarOpen] = useState(false);
    const [endCalendarOpen, setEndCalendarOpen] = useState(false);
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editingSectionName, setEditingSectionName] = useState("");

    const fetchData = async (showLoader = true) => {
        if (showLoader) setLoading(true);
        const [projRes, taskRes, secRes, resRes] = await Promise.all([
            supabase.from('projects').select('*').order('created_at', { ascending: false }),
            supabase.from('tasks').select('*'),
            supabase.from('sections').select('*'),
            supabase.from('resources').select('*').not('project_id', 'is', null)
        ]);
        if (projRes.error) { console.error('Projects Error', projRes.error); toast.error('Failed to load projects'); }

        const allProjects = (projRes.data as Project[]) || [];
        setProjects(allProjects);
        setTasks((taskRes.data as Task[]) || []);
        setSections((secRes.data as Section[]) || []);
        setLinkedResources((resRes.data as any[]) || []);
        if (showLoader) setLoading(false);

        if (allProjects.length > 0 && activeIdx >= allProjects.length) {
            setActiveIdx(0);
        }
    };

    // eslint-disable-next-line
    useEffect(() => { fetchData(); }, []);

    const filteredProjects = useMemo(() => {
        return (showAllProjects ? projects : projects.filter(p => p.status !== 'Completed'))
            .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
    }, [projects, showAllProjects]);

    const safeActiveIdx = Math.min(activeIdx, Math.max(0, filteredProjects.length - 1));
    const proj = filteredProjects[safeActiveIdx];

    const handleReorder = useCallback(async (fromIdx: number, toIdx: number) => {
        if (fromIdx === toIdx) return;
        const reordered = [...filteredProjects];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);

        // Track which project is currently active so we can follow it
        const activeProject = filteredProjects[safeActiveIdx];

        // Optimistic update
        const updatedProjects = projects.map(p => {
            const newIdx = reordered.findIndex(r => r.id === p.id);
            if (newIdx !== -1) return { ...p, display_order: newIdx };
            return p;
        });
        setProjects(updatedProjects);

        if (activeProject) {
            const newActiveIdx = reordered.findIndex(r => r.id === activeProject.id);
            if (newActiveIdx !== -1) setActiveIdx(newActiveIdx);
        }

        // Persist to DB
        const updates = reordered.map((p, i) => ({ id: p.id, display_order: i }));
        for (const u of updates) {
            await supabase.from('projects').update({ display_order: u.display_order }).eq('id', u.id);
        }
    }, [filteredProjects, projects, safeActiveIdx, supabase]);

    // Keyboard shortcuts: arrow keys to navigate projects, 'n' to open new task modal
    useKeyboardShortcuts(useMemo(() => ({
        'arrowleft': () => setActiveIdx(prev => Math.max(0, prev - 1)),
        'arrowright': () => setActiveIdx(prev => Math.min(filteredProjects.length - 1, prev + 1)),
        'n': () => {
            if (proj) {
                setIsTaskModalOpen(true);
            }
        },
    }), [filteredProjects.length, proj]));

    const handleToggleTask = async (taskId: string, currentStatus: string) => {
        if (!proj) return;
        const newStatus = currentStatus === 'Done' ? 'To Do' : 'Done';
        const completedAt = newStatus === 'Done' ? new Date().toISOString() : null;

        // Optimistic
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as "To Do" | "Done", completed_at: completedAt } : t));

        const { error } = await supabase
            .from('tasks')
            .update({ status: newStatus, completed_at: completedAt })
            .eq('id', taskId);

        if (error) {
            toast.error('Failed to update task');
            fetchData(false);
        }
    };

    const handleDeleteTask = async (e: React.MouseEvent, taskId: string) => {
        if (!proj) return;
        e.preventDefault();
        e.stopPropagation();

        // Optimistic removal
        setTasks(prev => prev.filter(t => t.id !== taskId));

        const { error } = await supabase.from('tasks').delete().eq('id', taskId);
        if (error) {
            toast.error('Failed to delete task');
            fetchData(false); // Rollback on error
        } else {
            toast.success('Task deleted');
        }
    };

    const handleToggleProjectStatus = async () => {
        if (!proj) return;
        const newStatus = proj.status === 'Completed' ? 'In Progress' : 'Completed';

        setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, status: newStatus as "In Progress" | "Completed" | "Planning" } : p));

        const { error } = await supabase.from('projects').update({ status: newStatus }).eq('id', proj.id);
        if (error) {
            toast.error('Failed to update project status');
            fetchData(false);
        } else {
            toast.success(`Project marked as ${newStatus}`);
        }
    };

    const handleDeleteSection = async (e: React.MouseEvent, sectionId: string) => {
        if (!proj) return;
        e.preventDefault();
        if (sectionId === 'unsectioned') return; // Can't delete the fallback

        // Optimistic
        setSections(prev => prev.filter(s => s.id !== sectionId));

        const { error } = await supabase.from('sections').delete().eq('id', sectionId);
        if (error) {
            toast.error('Failed to delete section');
            fetchData(false);
        } else {
            toast.success('Section deleted');
        }
    };

    const handleAddSection = async () => {
        if (!newSectionName.trim()) {
            setIsAddingSection(false);
            return;
        }

        if (!proj) return;
        const nameValue = newSectionName.trim();
        setIsAddingSection(false);
        setNewSectionName("");

        const projSecs = sections.filter(s => s.project_id === proj.id);
        const maxOrder = projSecs.length > 0 ? Math.max(...projSecs.map(s => s.order || 0)) : 0;
        const newOrder = maxOrder + 1;

        // Optimistic Section
        const tempId = `temp-sec-${Date.now()}`;
        setSections(prev => [...prev, { id: tempId, project_id: proj.id, name: nameValue, order: newOrder, created_at: new Date().toISOString() }]);

        const { error } = await supabase.from('sections').insert({
            project_id: proj.id,
            name: nameValue,
            order: newOrder
        });

        if (error) {
            toast.error('Failed to add section');
            fetchData(false);
        } else {
            toast.success('Section created');
            fetchData(false);
        }
    };

    const handleAddTask = async () => {
        if (!newTaskName.trim() || !activeSectionId) {
            setIsTaskModalOpen(false);
            return;
        }

        const nameValue = newTaskName.trim();
        const sectionContext = activeSectionId;
        const startDateValue = newStartDate ? newStartDate.toISOString() : new Date().toISOString();
        const dueDateValue = newTaskDate ? newTaskDate.toISOString() : new Date().toISOString();

        setIsTaskModalOpen(false);
        setNewTaskName("");
        setNewStartDate(new Date());
        setNewTaskDate(new Date());

        if (!proj) return;

        // Optimistic Task
        const tempTaskId = `temp-task-${Date.now()}`;
        const optimisticTask: Task = {
            id: tempTaskId,
            name: nameValue,
            description: '',
            priority: 'Medium',
            project_id: proj.id,
            section_id: sectionContext === 'unsectioned' ? null : sectionContext,
            status: 'To Do',
            start_date: startDateValue,
            due_date: dueDateValue,
            created_at: new Date().toISOString()
        };

        setTasks(prev => [...prev, optimisticTask]);

        const { error } = await supabase.from('tasks').insert({
            name: nameValue,
            description: '',
            priority: 'Medium',
            project_id: proj.id,
            section_id: sectionContext === 'unsectioned' ? null : sectionContext,
            status: 'To Do',
            start_date: startDateValue,
            due_date: dueDateValue
        });

        if (error) {
            toast.error('Failed to add task');
            fetchData(false); // Refetch silently to correct state
        } else {
            toast.success('Task created');
            fetchData(false); // Refetch silently to get real DB IDs
        }
    };

    const projId = proj?.id;
    const projTasks = useMemo(() => tasks.filter(t => t.project_id === projId), [tasks, projId]);
    const projSections = useMemo(() => sections.filter(s => s.project_id === projId).sort((a, b) => a.order - b.order), [sections, projId]);

    const totalAll = projTasks.length;
    const totalDone = projTasks.filter(t => t.status === 'Done').length;
    const pct = totalAll > 0 ? totalDone / totalAll : 0;

    // --- Chart Computations (memoized) ---
    const burnupData = useMemo(() => {
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        // Find earliest task creation date
        let earliestDate = new Date(now);
        earliestDate.setDate(earliestDate.getDate() - 13); // Default at least 14 days ago

        if (projTasks.length > 0) {
            const firstTaskDate = new Date(
                Math.min(...projTasks.map(t => new Date(t.created_at).getTime()))
            );
            firstTaskDate.setHours(0, 0, 0, 0);
            if (firstTaskDate < earliestDate) {
                earliestDate = firstTaskDate;
            }
        }

        // Calculate total days between earliest and now
        const diffTime = Math.abs(now.getTime() - earliestDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const chartLength = Math.max(14, diffDays);

        return Array.from({ length: chartLength }, (_, i) => {
            const d = new Date(now);
            d.setDate(d.getDate() - ((chartLength - 1) - i));
            d.setHours(23, 59, 59, 999);
            const dayStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            const scope = projTasks.filter(t => new Date(t.created_at) <= d).length;
            const done = projTasks.filter(t => t.status === 'Done' && t.completed_at && new Date(t.completed_at) <= d).length;

            return { day: dayStr, scope, completed: done };
        });
    }, [projTasks]);

    const { activity, activeDays, streak } = useMemo(() => {
        const act = Array(28).fill(0);
        let aDays = 0, cStreak = 0;
        const now = new Date(); now.setHours(23, 59, 59, 999);
        for (let i = 27; i >= 0; i--) {
            const dStart = new Date(now); dStart.setDate(now.getDate() - i); dStart.setHours(0, 0, 0, 0);
            const dEnd = new Date(dStart); dEnd.setHours(23, 59, 59, 999);
            const doneCnt = projTasks.filter(t => t.status === 'Done' && t.completed_at && new Date(t.completed_at) >= dStart && new Date(t.completed_at) <= dEnd).length;
            act[27 - i] = Math.min(doneCnt, 4);
            if (doneCnt > 0) aDays++;
        }
        for (let j = 27; j >= 0; j--) {
            if (act[j] > 0) cStreak++;
            else if (j < 27) break;
        }
        return { activity: act, activeDays: aDays, streak: cStreak };
    }, [projTasks]);

    const velocityData = useMemo(() => {
        const data = Array.from({ length: 8 }, (_, i) => {
            const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() - ((7 - i) * 7));
            const weekStart = new Date(weekEnd); weekStart.setDate(weekStart.getDate() - 7);
            const doneWeek = projTasks.filter(t => t.status === 'Done' && t.completed_at && new Date(t.completed_at) > weekStart && new Date(t.completed_at) <= weekEnd).length;
            return { week: `W${i + 1}`, tasks: doneWeek, avg: doneWeek };
        });

        // Compute rolling avg for sequence
        let runningTotal = 0;
        data.forEach((v, i) => {
            runningTotal += v.tasks;
            v.avg = Math.round(runningTotal / (i + 1));
        });

        return data;
    }, [projTasks]);

    const nextUp = useMemo(() => projTasks
        .filter(t => t.status !== 'Done' && t.due_date)
        .sort((a, b) => {
            const dateA = a.due_date!.split('T')[0];
            const dateB = b.due_date!.split('T')[0];
            return new Date(`${dateA}T12:00:00`).getTime() - new Date(`${dateB}T12:00:00`).getTime();
        })
        .slice(0, 3)
        .map(t => {
            const dInfo = processTaskDate(t.due_date);
            const parentSection = t.section_id ? sections.find(s => s.id === t.section_id)?.name : undefined;
            return {
                id: t.id, name: t.name,
                due: dInfo?.formatted || '',
                overdue: dInfo?.isOverdue || false,
                isToday: dInfo?.isToday || false,
                daysUntilDue: dInfo?.daysUntilDue || 0,
                sectionName: parentSection
            };
        }), [projTasks, sections]);

    const mappedSections = useMemo(() => {
        const mapped = projSections.map(s => {
            const sTasks = projTasks.filter(t => t.section_id === s.id);
            const doneTasks = sTasks.filter(t => t.status === 'Done').length;
            const activeTasks = sTasks.length - doneTasks;

            let sectionTimeline = null;
            const dates = sTasks.map(t => processTaskDate(t.due_date)).filter((d): d is NonNullable<typeof d> => d !== null);
            if (dates.length > 0) {
                const minStamp = Math.min(...dates.map(d => d.rawTimestamp));
                const maxStamp = Math.max(...dates.map(d => d.rawTimestamp));
                if (minStamp === maxStamp) {
                    sectionTimeline = dates.find(d => d.rawTimestamp === minStamp)?.formatted;
                } else {
                    const minD = new Date(minStamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const maxD = new Date(maxStamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    sectionTimeline = `${minD} - ${maxD}`;
                }
            }

            return {
                id: s.id, name: s.name, total: sTasks.length, done: doneTasks, active: activeTasks,
                timeline: sectionTimeline,
                tasks: sTasks.map(t => ({
                    ...t, id: t.id, name: t.name, done: t.status === 'Done',
                    dateInfo: processTaskDate(t.due_date)
                }))
            };
        });

        const unsectionedTasks = projTasks.filter(t => !t.section_id);
        if (unsectionedTasks.length > 0) {
            const doneUnsectioned = unsectionedTasks.filter(t => t.status === 'Done').length;

            let sectionTimeline = null;
            const dates = unsectionedTasks.map(t => processTaskDate(t.due_date)).filter((d): d is NonNullable<typeof d> => d !== null);
            if (dates.length > 0) {
                const minStamp = Math.min(...dates.map(d => d.rawTimestamp));
                const maxStamp = Math.max(...dates.map(d => d.rawTimestamp));
                if (minStamp === maxStamp) {
                    sectionTimeline = dates.find(d => d.rawTimestamp === minStamp)?.formatted;
                } else {
                    const minD = new Date(minStamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const maxD = new Date(maxStamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    sectionTimeline = `${minD} - ${maxD}`;
                }
            }

            mapped.push({
                id: 'unsectioned', name: 'General', total: unsectionedTasks.length, done: doneUnsectioned, active: unsectionedTasks.length - doneUnsectioned,
                timeline: sectionTimeline,
                tasks: unsectionedTasks.map(t => ({
                    ...t, id: t.id, name: t.name, done: t.status === 'Done',
                    dateInfo: processTaskDate(t.due_date)
                }))
            });
        }

        // Sort: Sections WITH active tasks first, then by original order
        mapped.sort((a, b) => {
            const aHasActive = a.active > 0;
            const bHasActive = b.active > 0;
            if (aHasActive && !bHasActive) return -1;
            if (!aHasActive && bHasActive) return 1;
            return 0; // maintain relative order otherwise
        });

        return mapped;
    }, [projTasks, projSections]);

    // --- Early returns (AFTER all hooks) ---
    if (loading) {
        return <div className="h-64 flex items-center justify-center text-athena-text-muted"><Loader2 className="animate-spin w-8 h-8" /></div>;
    }

    if (filteredProjects.length === 0) {
        return (
            <>
                <div className="text-center h-[60vh] flex flex-col items-center justify-center space-y-6 text-athena-text-muted">
                    <Folder className="w-16 h-16 opacity-20 text-athena-gold" />
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-athena-gold">Your Projects</h3>
                        <p className="text-sm max-w-xs mx-auto">Organize work into projects with tasks and deadlines. Use the AI Planner to break down ideas into structured plans.</p>
                    </div>
                    {showManualCreate ? (
                        <ManualProjectForm
                            onCreate={async (name, description) => {
                                const { error } = await supabase.from('projects').insert({
                                    name,
                                    overview: description || null,
                                    status: 'In Progress',
                                });
                                if (error) {
                                    console.error('Error creating project:', error);
                                    return;
                                }
                                setShowManualCreate(false);
                                fetchData(false);
                            }}
                            onCancel={() => setShowManualCreate(false)}
                        />
                    ) : (
                        <div className="flex gap-3">
                            <Button onClick={() => setIsPlannerOpen(true)} className="bg-athena-gold hover:bg-athena-gold-bright text-black font-serif font-bold shadow-[0_0_15px_rgb(var(--athena-gold)/0.3)] border-0 tracking-wide min-h-[44px]">
                                <Brain className="w-4 h-4 mr-2" /> Use AI Planner
                            </Button>
                            <Button
                                onClick={() => setShowManualCreate(true)}
                                variant="outline"
                                className="border-athena-border text-athena-text-primary hover:bg-white/5 font-serif font-bold tracking-wide min-h-[44px]"
                            >
                                <Plus className="w-4 h-4 mr-2" /> Create Manually
                            </Button>
                        </div>
                    )}
                </div>
                <AthenaPlanner isOpen={isPlannerOpen} onClose={() => setIsPlannerOpen(false)} onTasksCreated={fetchData} />
            </>
        );
    }

    const { icon: ProjIcon, color: projColor, accent: projAccent } = getProjectStyles(proj.name, proj.emoji, proj.color);

    const handleUpdateDesc = async () => {
        setIsEditingDesc(false);
        if (!proj) return;
        if (descValue === proj.description) return;

        setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, description: descValue } : p));
        const { error } = await supabase.from('projects').update({ description: descValue }).eq('id', proj.id);
        if (error) { toast.error('Failed to update description'); fetchData(); }
    };

    const handleUpdateSectionName = async (sectionId: string) => {
        setEditingSectionId(null);
        if (!editingSectionName.trim()) return;

        const targetSection = sections.find(s => s.id === sectionId);
        if (targetSection && targetSection.name === editingSectionName.trim()) return;

        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, name: editingSectionName.trim() } : s));
        const { error } = await supabase.from('sections').update({ name: editingSectionName.trim() }).eq('id', sectionId);
        if (error) { toast.error('Failed to update section name'); fetchData(); }
    };

    return (
        <div data-onboarding="projects-workspace">
        {/* ==================== MOBILE LAYOUT ==================== */}
        <div className="md:hidden px-3 py-4 space-y-4 pb-20">
            {/* Mobile Project Tabs - horizontal scroll */}
            <div className="overflow-x-auto -mx-3 px-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="flex gap-1.5 min-w-max pb-1">
                    {filteredProjects.map((p, i) => {
                        const { icon: PIcon, color: PColor } = getProjectStyles(p.name, p.emoji, p.color);
                        return (
                            <button key={p.id} onClick={() => { setActiveIdx(i); setSectionPage(0); setSearchQuery(""); }}
                                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all border whitespace-nowrap min-h-[44px]",
                                    i === safeActiveIdx ? `${PColor} bg-white/10 border-current/20 shadow-lg` : "text-athena-text-muted border-transparent hover:bg-white/5"
                                )}>
                                <PIcon size={14} /> {p.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Mobile Charts - 2 column */}
            <div className="grid grid-cols-2 gap-2 [&>*]:h-[120px]">
                <Card className="bg-athena-panel/60 border-athena-border/50 p-2 flex flex-col backdrop-blur-sm overflow-hidden">
                    <div className="flex justify-between items-center mb-1">
                        <div className="text-[10px] text-athena-text-muted uppercase tracking-wider font-bold">Burnup</div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xs font-serif font-bold" style={{ color: projAccent }}>{totalDone}</span>
                            <span className="text-[10px] text-athena-text-muted/50">/{totalAll}</span>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={burnupData} margin={{ top: 2, right: 0, bottom: -10, left: -20 }}>
                                <defs><linearGradient id={`mbFill${activeIdx}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={projAccent} stopOpacity={0.3} /><stop offset="100%" stopColor={projAccent} stopOpacity={0.02} /></linearGradient></defs>
                                <XAxis dataKey="day" tick={false} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, totalAll > 0 ? totalAll : 10]} tick={{ fontSize: 8, fill: '#4a4238' }} axisLine={false} tickLine={false} width={20} />
                                <Area type="monotone" dataKey="scope" stroke="rgba(74,66,56,0.4)" strokeDasharray="4 4" fill="none" name="Scope" />
                                <Area type="monotone" dataKey="completed" stroke={projAccent} strokeWidth={2} fill={`url(#mbFill${activeIdx})`} name="Done" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
                <Card className="bg-athena-panel/60 border-athena-border/50 p-2 flex flex-col backdrop-blur-sm overflow-hidden">
                    <div className="flex justify-between items-center mb-1">
                        <div className="text-[10px] text-athena-text-muted uppercase tracking-wider font-bold">Activity</div>
                        <span className="text-xs font-serif font-bold" style={{ color: projAccent }}>{streak}<span className="text-[10px] text-athena-text-muted/50 ml-0.5">streak</span></span>
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col justify-center">
                        <div className="grid grid-cols-7 gap-[2px]">
                            {activity.map((a, i) => (
                                <div key={i} className="w-full h-2.5 rounded-[1px]" style={{ background: a === 0 ? 'rgba(255,255,255,0.03)' : `${projAccent}${['', '30', '50', '80', 'ff'][a]}` }} />
                            ))}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Mobile Project Card */}
            <Card className="bg-athena-panel/60 border-athena-border/50 overflow-hidden backdrop-blur-sm">
                <div className="p-3 pb-2">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 bg-white/5 rounded-xl border border-white/5 shrink-0", projColor)}>
                            <ProjIcon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-serif font-bold text-athena-text-primary truncate">{proj.name}</h3>
                            <p className="text-[11px] text-athena-text-muted truncate">{proj.description || proj.overview || ''}</p>
                        </div>
                        <GlowRing pct={pct} size={44} strokeWidth={3} color={projColor}>
                            <span className="text-[10px] font-bold font-serif" style={{ color: projAccent }}>{Math.round(pct * 100)}%</span>
                        </GlowRing>
                    </div>
                    {proj.deadline && (() => {
                        const deadlineDate = parseISO(proj.deadline);
                        const today = new Date(); today.setHours(0, 0, 0, 0); deadlineDate.setHours(0, 0, 0, 0);
                        const daysLeft = differenceInDays(deadlineDate, today);
                        const badgeColor = daysLeft < 0 ? 'text-red-400 bg-red-400/10 border-red-400/20' : daysLeft <= 7 ? 'text-athena-gold bg-athena-gold/10 border-athena-gold/20' : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
                        const badgeLabel = daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`;
                        return (<div className={cn("mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md border", badgeColor)}><Target size={9} />{badgeLabel}</div>);
                    })()}
                </div>

                {/* Mobile Task List */}
                <div className="border-t border-athena-border/30 px-3 py-3 space-y-2">
                    {/* Search */}
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-athena-text-muted/50" />
                        <input ref={searchInputRef} type="text" placeholder="Search tasks..." value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setSectionPage(0); }}
                            className="w-full bg-white/5 border border-athena-border/50 rounded-lg pl-9 pr-8 py-2.5 text-sm placeholder:text-athena-text-muted/40 outline-none focus:border-athena-gold/40 min-h-[44px]" />
                        {searchQuery && (<button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-athena-text-muted/50 p-1"><X size={14} /></button>)}
                    </div>
                    {/* Next Up */}
                    {nextUp.length > 0 && (
                        <div className="mb-2">
                            <span className="text-[10px] text-athena-text-muted uppercase tracking-wider font-bold">Next Up</span>
                            {nextUp.map(t => (
                                <div key={t.id} onClick={() => handleToggleTask(t.id, 'To Do')}
                                    className="flex items-center gap-2.5 px-3 py-2.5 mb-1 rounded-lg bg-white/[0.015] border border-athena-border/30 cursor-pointer min-h-[48px]">
                                    <div className={cn("w-5 h-5 rounded border flex-shrink-0", t.overdue ? "border-red-400/50" : t.isToday ? "border-orange-400/50" : "border-athena-border/50")} />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs text-athena-text-primary truncate block">{t.name}</span>
                                        <span className={cn("text-[10px]", t.overdue ? "text-red-400" : t.isToday ? "text-orange-400" : "text-athena-text-muted")}>{t.due}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Sections */}
                    {(() => {
                        const query = searchQuery.toLowerCase().trim();
                        const displaySections = query
                            ? mappedSections.map(sec => ({ ...sec, tasks: sec.tasks.filter(t => t.name.toLowerCase().includes(query)) })).filter(sec => sec.tasks.length > 0)
                            : mappedSections;
                        if (query && displaySections.length === 0) return <div className="text-center py-6 text-athena-text-muted/60 text-sm">No tasks matching &ldquo;{searchQuery}&rdquo;</div>;
                        return displaySections.map(sec => {
                            const sp = sec.total > 0 ? sec.done / sec.total : 0;
                            const isDone = sec.total > 0 && sec.done === sec.total;
                            const isShowingCompleted = showCompleted[sec.id] || false;
                            const visibleTasks = query ? sec.tasks : sec.tasks.filter(t => isShowingCompleted || !t.done);
                            return (
                                <div key={sec.id} className="rounded-lg border border-athena-border/30 bg-white/[0.015] overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2.5 min-h-[44px]"
                                        onClick={isDone ? () => setShowCompleted(prev => ({ ...prev, [sec.id]: !prev[sec.id] })) : undefined}>
                                        <ChevronRight size={12} className={cn("text-athena-text-muted transition-transform flex-shrink-0", isDone && isShowingCompleted && "rotate-90")} />
                                        <span className={cn("text-sm font-semibold flex-1 truncate", isDone ? "text-athena-text-muted line-through opacity-60" : "text-athena-text-primary")}>{sec.name}</span>
                                        <span className="text-[10px] text-athena-text-muted/50 font-mono">{sec.done}/{sec.total}</span>
                                        <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${sp * 100}%`, backgroundColor: projAccent }} /></div>
                                    </div>
                                    {(!isDone || isShowingCompleted) && visibleTasks.length > 0 && (
                                        <div className="px-2 pb-2 space-y-0.5">
                                            {visibleTasks.map(t => (
                                                <div key={t.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors min-h-[44px]"
                                                    onClick={() => handleToggleTask(t.id, t.done ? 'Done' : 'To Do')}>
                                                    <div className={cn("w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center",
                                                        t.done ? "bg-emerald-500/20 border-emerald-500/40" : "border-athena-border/50")}>
                                                        {t.done && <Check size={10} className="text-emerald-400" />}
                                                    </div>
                                                    <span className={cn("text-[12px] flex-1 truncate", t.done ? "line-through text-athena-text-muted/50" : "text-athena-text-primary")}>{t.name}</span>
                                                    {!t.done && t.dateInfo && <span className={cn("text-[10px] shrink-0", t.dateInfo.isOverdue ? "text-red-400" : "text-athena-text-muted/50")}>{t.dateInfo.formatted}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        });
                    })()}
                    {/* Add Task Button */}
                    <button onClick={() => setIsTaskModalOpen(true)}
                        className="w-full py-2.5 border border-dashed border-athena-border/30 rounded-lg text-[11px] text-athena-text-muted hover:text-athena-gold flex items-center justify-center gap-1.5 min-h-[48px]">
                        <Plus size={12} /> Add Task
                    </button>
                </div>
            </Card>

            {/* Floating Planner Button (desktop only -- mobile uses bottom bar) */}
            <button
                onClick={() => setIsPlannerOpen(true)}
                className="fixed bottom-6 right-4 z-50 hidden md:flex items-center gap-2 px-4 py-3 rounded-full bg-athena-gold text-athena-bg font-semibold text-sm shadow-lg shadow-athena-gold/20 active:scale-95 transition-transform"
            >
                <Sparkles size={16} /> Planner
            </button>
        </div>

        {/* ==================== DESKTOP LAYOUT ==================== */}
        <div className="hidden md:block space-y-6">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => {
                        setShowAllProjects(!showAllProjects);
                        setActiveIdx(0);
                    }}
                    className={cn(
                        "text-[10px] uppercase tracking-[0.3em] font-semibold font-sans transition-colors outline-none",
                        showAllProjects ? "text-athena-gold" : "text-athena-text-muted hover:text-white"
                    )}
                >
                    PROJECTS
                </button>
            </div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 flex-nowrap md:flex-wrap overflow-x-auto md:overflow-x-visible pb-2 border-b border-white/5 hide-scrollbar">
                {filteredProjects.map((p, i) => {
                    const { icon: PIcon, color: PColor } = getProjectStyles(p.name, p.emoji, p.color);
                    return (
                        <button
                            key={p.id}
                            draggable
                            onDragStart={(e) => {
                                setDragIdx(i);
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                setDragOverIdx(i);
                            }}
                            onDragLeave={() => setDragOverIdx(null)}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (dragIdx !== null) handleReorder(dragIdx, i);
                                setDragIdx(null);
                                setDragOverIdx(null);
                            }}
                            onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                            onClick={() => { setActiveIdx(i); setSectionPage(0); setSearchQuery(""); }}
                            className={cn(
                                "flex items-center gap-1.5 md:gap-2 px-1.5 py-1 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold transition-all border cursor-grab active:cursor-grabbing select-none whitespace-nowrap",
                                i === safeActiveIdx ? `${PColor} bg-white/10 border-current/20 shadow-lg` : "text-athena-text-muted border-transparent hover:bg-white/5",
                                dragIdx === i && "opacity-40",
                                dragOverIdx === i && dragIdx !== i && "ring-1 ring-athena-gold/50"
                            )}
                        >
                            <GripVertical size={12} className="text-white/20 hidden md:block" />
                            <PIcon size={14} /> <span className="hidden md:inline">{p.name}</span>
                        </button>
                    );
                })}
                <button data-onboarding="planner-button" onClick={() => setIsPlannerOpen(true)} className="ml-auto hidden md:flex items-center gap-2 px-4 py-2 rounded-xl text-xs text-athena-gold border border-athena-gold/30 hover:bg-athena-gold/10 hover:border-athena-gold/50 transition-all whitespace-nowrap shrink-0">
                    <Sparkles size={12} /> Athena Planner
                </button>
            </motion.div>

            {/* 3 Charts */}
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 md:h-36 [&>*]:h-[120px] [&>*]:md:h-auto">
                <Card className="bg-athena-panel/60 border-athena-border/50 p-3 flex flex-col backdrop-blur-sm overflow-hidden">
                    <div className="flex justify-between items-center mb-2">
                        <div className="text-[10px] text-athena-text-muted uppercase tracking-[0.2em] font-bold">Burnup</div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-serif font-bold" style={{ color: projAccent }}>{totalDone}</span>
                            <span className="text-[10px] text-athena-text-muted/50">/ {totalAll}</span>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 w-full mt-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={burnupData} margin={{ top: 4, right: 0, bottom: -10, left: -20 }}>
                                <defs><linearGradient id={`bFill${activeIdx}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={projAccent} stopOpacity={0.3} /><stop offset="100%" stopColor={projAccent} stopOpacity={0.02} /></linearGradient></defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis dataKey="day" tickFormatter={(val) => val.split(' ')[0]} tick={{ fontSize: 9, fill: '#4a4238' }} axisLine={false} tickLine={false} minTickGap={20} />
                                <YAxis domain={[0, totalAll > 0 ? totalAll : 10]} tick={{ fontSize: 9, fill: '#4a4238' }} axisLine={false} tickLine={false} width={28} />
                                <Tooltip contentStyle={TT} />
                                <Area type="monotone" dataKey="scope" stroke="rgba(74,66,56,0.4)" strokeDasharray="4 4" fill="none" name="Scope" />
                                <Area type="monotone" dataKey="completed" stroke={projAccent} strokeWidth={2} fill={`url(#bFill${activeIdx})`} name="Done" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card className="bg-athena-panel/60 border-athena-border/50 p-3 flex flex-col backdrop-blur-sm overflow-hidden">
                    <div className="flex justify-between items-center mb-2">
                        <div className="text-[10px] text-athena-text-muted uppercase tracking-[0.2em] font-bold">Activity (28d)</div>
                        <div className="flex gap-3">
                            <div><span className="text-sm font-serif font-bold" style={{ color: projAccent }}>{activeDays}</span><span className="text-[10px] text-athena-text-muted/50 ml-1">active</span></div>
                            <div><span className="text-sm font-serif font-bold" style={{ color: projAccent }}>{streak}</span><span className="text-[10px] text-athena-text-muted/50 ml-1">streak</span></div>
                        </div>
                    </div>
                    <div className="mb-1.5 w-full flex-1 min-h-0 flex flex-col justify-center">
                        <div className="grid grid-cols-7 gap-[3px] mb-0.5">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                <div key={i} className="text-[6px] text-center text-athena-text-muted/50 font-bold">{d}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-[3px]">
                            {activity.map((a, i) => (
                                <div key={i} className="w-full h-3 rounded-[2px]" style={{ background: a === 0 ? 'rgba(255,255,255,0.03)' : `${projAccent}${['', '30', '50', '80', 'ff'][a]}` }} />
                            ))}
                        </div>
                    </div>
                </Card>

                <Card className="bg-athena-panel/60 border-athena-border/50 p-3 flex flex-col backdrop-blur-sm overflow-hidden">
                    <div className="text-[10px] text-athena-text-muted uppercase tracking-[0.2em] font-bold mb-2">Velocity (8 Weeks)</div>
                    <div className="flex-1 min-h-0 w-full mt-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={velocityData} margin={{ top: 4, right: 0, bottom: -10, left: -20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#4a4238' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: '#4a4238' }} axisLine={false} tickLine={false} width={28} />
                                <Tooltip contentStyle={TT} />
                                <Bar dataKey="tasks" fill={projAccent} fillOpacity={0.4} radius={[2, 2, 0, 0]} name="Tasks" />
                                <Line type="monotone" dataKey="avg" stroke={projAccent} strokeWidth={2} dot={{ fill: projAccent, r: 2, strokeWidth: 0 }} name="Avg" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </motion.div>

            {/* Active Project Card */}
            <motion.div key={proj.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <Card className="bg-athena-panel/60 border-athena-border/50 overflow-hidden backdrop-blur-sm">
                    <div className="p-3 md:p-6 pb-2 md:pb-4">
                        <div className="flex flex-col md:flex-row items-start justify-between gap-3">
                            <div className="flex items-start gap-3 md:gap-4 min-w-0">
                                {/* Clickable Icon with Color/Icon Picker */}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button className={cn("p-2 md:p-3 bg-white/5 rounded-xl border border-white/5 shrink-0 hover:bg-white/10 transition-colors cursor-pointer", projColor)} title="Change icon & color">
                                            <ProjIcon size={20} />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-48 md:w-56 bg-athena-panel border border-athena-border backdrop-blur-xl p-3" side="bottom" align="start">
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-athena-text-muted font-bold mb-2">Icon</p>
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {[
                                                        { key: 'brain', icon: <Brain size={18} /> },
                                                        { key: 'rocket', icon: <Rocket size={18} /> },
                                                        { key: 'target', icon: <Target size={18} /> },
                                                        { key: 'zap', icon: <Zap size={18} /> },
                                                        { key: 'cpu', icon: <Activity size={18} /> },
                                                        { key: 'code', icon: <FileText size={18} /> },
                                                        { key: 'briefcase', icon: <Layers size={18} /> },
                                                        { key: 'folder', icon: <BookOpen size={18} /> },
                                                    ].map(item => (
                                                        <button
                                                            key={item.key}
                                                            onClick={async () => {
                                                                setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, emoji: item.key } : p));
                                                                const { error } = await supabase.from('projects').update({ emoji: item.key }).eq('id', proj.id);
                                                                if (error) { console.error('Failed to update icon:', error); toast.error('Failed to update icon'); }
                                                            }}
                                                            className={cn(
                                                                "p-2 rounded-lg border transition-all flex items-center justify-center",
                                                                proj.emoji === item.key
                                                                    ? "border-athena-gold/50 bg-athena-gold/10 text-athena-gold"
                                                                    : "border-athena-border/30 text-athena-text-muted hover:text-white hover:border-athena-border"
                                                            )}
                                                        >
                                                            {item.icon}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-athena-text-muted font-bold mb-2">Color</p>
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {['blue', 'purple', 'green', 'orange', 'red', 'gold', 'teal', 'slate'].map(colorName => {
                                                        const colorBg: Record<string, string> = { blue: 'bg-blue-500', purple: 'bg-purple-500', green: 'bg-green-500', orange: 'bg-orange-500', red: 'bg-red-500', gold: 'bg-athena-gold', teal: 'bg-teal-500', slate: 'bg-slate-500' };
                                                        return (
                                                            <button
                                                                key={colorName}
                                                                onClick={async () => {
                                                                    setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, color: colorName } : p));
                                                                    const { error } = await supabase.from('projects').update({ color: colorName }).eq('id', proj.id);
                                                                    if (error) { console.error('Failed to update color:', error); toast.error('Failed to update color'); }
                                                                }}
                                                                className={cn(
                                                                    "w-full h-7 rounded-lg border transition-all",
                                                                    colorBg[colorName] || 'bg-zinc-500',
                                                                    proj.color === colorName
                                                                        ? "border-white/60 ring-1 ring-white/30"
                                                                        : "border-transparent opacity-60 hover:opacity-100"
                                                                )}
                                                                title={colorName}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                <div>
                                    <div className="flex items-center gap-3">
                                        {/* Clickable Project Name */}
                                        {isEditingProjName ? (
                                            <input
                                                value={projNameValue}
                                                onChange={(e) => setProjNameValue(e.target.value)}
                                                onBlur={async () => {
                                                    setIsEditingProjName(false);
                                                    if (projNameValue.trim() && projNameValue.trim() !== proj.name) {
                                                        setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, name: projNameValue.trim() } : p));
                                                        await supabase.from('projects').update({ name: projNameValue.trim() }).eq('id', proj.id);
                                                    }
                                                }}
                                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                className="text-lg md:text-xl font-serif font-bold text-athena-text-primary bg-transparent border-b border-athena-gold/30 outline-none px-0 py-0.5"
                                                autoFocus
                                            />
                                        ) : (
                                            <h3
                                                className="text-lg md:text-xl font-serif font-bold text-athena-text-primary cursor-pointer hover:text-athena-gold transition-colors"
                                                onClick={() => { setIsEditingProjName(true); setProjNameValue(proj.name); }}
                                            >
                                                {proj.name}
                                            </h3>
                                        )}
                                        <button
                                            onClick={handleToggleProjectStatus}
                                            className={cn("text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold transition-colors cursor-pointer hover:opacity-80",
                                                proj.status === 'In Progress' ? "bg-white/10 border border-current/20" : "bg-white/5 text-athena-text-muted border border-athena-border",
                                                proj.status === 'In Progress' && projColor
                                            )}
                                            style={proj.status === 'In Progress' ? { color: projAccent } : {}}
                                            title="Click to toggle status"
                                        >
                                            {proj.status}
                                        </button>
                                    </div>
                                    {isEditingDesc ? (
                                        <textarea
                                            autoFocus
                                            className="w-full mt-2 bg-black/20 border rounded-lg p-3 text-sm text-athena-text-primary resize-none focus:outline-none"
                                            style={{ borderColor: `${projAccent}40` }}
                                            rows={2}
                                            value={descValue}
                                            onChange={(e) => setDescValue(e.target.value)}
                                            onBlur={handleUpdateDesc}
                                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUpdateDesc(); } }}
                                        />
                                    ) : (
                                        <p
                                            onClick={() => { setDescValue(proj.description || ""); setIsEditingDesc(true); }}
                                            className="text-sm text-athena-text-muted mt-0.5 md:mt-1 max-w-xl cursor-text hover:text-athena-text-primary transition-colors hover:bg-white/5 p-1 -ml-1 rounded"
                                        >
                                            {proj.description || proj.overview || "Click to add an overview..."}
                                        </p>
                                    )}
                                    {/* Deadline Badge */}
                                    {proj.deadline && (() => {
                                        const deadlineDate = parseISO(proj.deadline);
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        deadlineDate.setHours(0, 0, 0, 0);
                                        const daysLeft = differenceInDays(deadlineDate, today);

                                        let badgeColor = 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
                                        let badgeLabel = `Due ${format(deadlineDate, 'MMM d')}`;

                                        if (daysLeft < 0) {
                                            badgeColor = 'text-red-400 bg-red-400/10 border-red-400/20';
                                            badgeLabel = `${Math.abs(daysLeft)}d overdue`;
                                        } else if (daysLeft === 0) {
                                            badgeColor = 'text-red-400 bg-red-400/10 border-red-400/20';
                                            badgeLabel = 'Due today';
                                        } else if (daysLeft <= 7) {
                                            badgeColor = 'text-athena-gold bg-athena-gold/10 border-athena-gold/20';
                                            badgeLabel = `${daysLeft}d left`;
                                        }

                                        return (
                                            <div className={cn("mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-md border", badgeColor)}>
                                                <Target size={10} />
                                                {badgeLabel}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-xs text-athena-text-muted font-mono">{totalDone}/{totalAll}</div>
                                    <div className="w-28 h-1.5 bg-white/5 rounded-full overflow-hidden mt-1">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, backgroundColor: projAccent }} />
                                    </div>
                                </div>
                                <GlowRing pct={pct} size={52} strokeWidth={3.5} color={projColor}>
                                    <span className="text-[11px] font-bold font-serif" style={{ color: projAccent }}>{Math.round(pct * 100)}%</span>
                                </GlowRing>
                            </div>
                        </div>
                    </div>
                    {/* Linked Learning Resources */}
                    {(() => {
                        const projResources = linkedResources.filter(r => r.project_id === proj.id);
                        if (projResources.length === 0) return null;
                        return (
                            <div className="border-t border-athena-border/30 px-4 md:px-6 py-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <BookOpen size={12} className="text-athena-text-muted" />
                                    <span className="text-[10px] text-athena-text-muted uppercase tracking-[0.2em] font-bold">Linked Resources ({projResources.length})</span>
                                </div>
                                <div className="flex overflow-x-auto gap-2 hide-scrollbar md:flex-wrap md:overflow-visible">
                                    {projResources.map(r => (
                                        <a
                                            key={r.id}
                                            href={r.url || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-athena-border/30 hover:bg-white/[0.06] transition-colors group"
                                        >
                                            <Video size={12} className="text-athena-gold/70 group-hover:text-athena-gold" />
                                            <span className="text-xs text-athena-text-muted group-hover:text-athena-text-primary transition-colors truncate max-w-[120px] md:max-w-[200px]">
                                                {r.title}
                                            </span>
                                            <ExternalLink size={10} className="text-athena-text-muted/30 group-hover:text-athena-text-muted/60 flex-shrink-0" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    <div className="border-t border-athena-border/30 px-4 md:px-6 py-4 space-y-3">
                        {nextUp.length > 0 && (
                            <div className="mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Clock size={12} className="text-athena-text-muted" />
                                    <span className="text-[10px] text-athena-text-muted uppercase tracking-[0.2em] font-bold">Next Up</span>
                                </div>
                                {nextUp.map(t => (
                                    <ContextMenu key={t.id}>
                                        <ContextMenuTrigger asChild>
                                            <div onClick={() => handleToggleTask(t.id, 'To Do')} className="flex items-center gap-2.5 px-3.5 py-2 mb-1 rounded-lg bg-white/[0.015] border border-athena-border/30 cursor-pointer hover:bg-white/5 transition-colors">
                                                <div className={cn("w-5 h-5 md:w-3.5 md:h-3.5 rounded border flex-shrink-0",
                                                    t.overdue ? "border-red-400/50" :
                                                        t.isToday ? "border-orange-400/50" :
                                                            "border-athena-border/50"
                                                )} />
                                                <div className="flex items-center gap-1.5 flex-1">
                                                    <span className="text-xs text-athena-text-primary">{t.name}</span>
                                                    {t.sectionName && (
                                                        <span className="hidden md:inline text-xs font-medium" style={{ color: projAccent }}>
                                                            - {t.sectionName}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("text-[10px]",
                                                        t.overdue ? "text-red-400 font-semibold" :
                                                            t.isToday ? "text-orange-400 font-semibold" :
                                                                "text-athena-text-muted"
                                                    )}>
                                                        {t.due}
                                                        {t.overdue ? " · Overdue" :
                                                            t.isToday ? " · Due Today" :
                                                                ` · In ${t.daysUntilDue}d`}
                                                    </span>
                                                </div>
                                            </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent className="bg-[#1A1816]/95 border-white/10 backdrop-blur-md w-48 overflow-hidden rounded-xl shadow-2xl p-1">
                                            <ContextMenuItem
                                                className="gap-2 text-xs font-semibold text-red-400 focus:bg-red-400/10 focus:text-red-400 cursor-pointer p-2 rounded-lg"
                                                onClick={(e) => handleDeleteTask(e as unknown as React.MouseEvent, t.id)}
                                            >
                                                Delete Task
                                            </ContextMenuItem>
                                        </ContextMenuContent>
                                    </ContextMenu>
                                ))}
                            </div>
                        )}
                        {/* Task Search */}
                        <div className="relative mb-3">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-athena-text-muted/50" />
                            <input
                                type="text"
                                placeholder="Search tasks..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setSectionPage(0); }}
                                className="w-full bg-white/5 border border-athena-border/50 rounded-lg pl-9 pr-8 py-2 text-base md:text-sm text-white placeholder:text-athena-text-muted/40 outline-none focus:border-athena-gold/40 transition-colors"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-athena-text-muted/50 hover:text-white transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {(() => {
                            const query = searchQuery.toLowerCase().trim();
                            const displaySections = query
                                ? mappedSections
                                    .map(sec => ({
                                        ...sec,
                                        tasks: sec.tasks.filter(t => t.name.toLowerCase().includes(query))
                                    }))
                                    .filter(sec => sec.tasks.length > 0)
                                : mappedSections;

                            if (query && displaySections.length === 0) {
                                return (
                                    <div className="text-center py-8 text-athena-text-muted/60 text-sm">
                                        No tasks matching &ldquo;{searchQuery}&rdquo;
                                    </div>
                                );
                            }

                            return (<>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <Layers size={12} className="text-athena-text-muted" />
                                <span className="text-[10px] text-athena-text-muted uppercase tracking-[0.2em] font-bold">Sections ({displaySections.length})</span>
                            </div>
                            {displaySections.length > 5 && (
                                <div className="flex items-center gap-1">
                                    <button
                                        disabled={sectionPage === 0}
                                        onClick={() => setSectionPage(p => Math.max(0, p - 1))}
                                        className="text-athena-text-muted hover:text-white disabled:opacity-30 disabled:hover:text-athena-text-muted transition-colors p-1"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <button
                                        disabled={sectionPage >= Math.ceil(displaySections.length / 5) - 1}
                                        onClick={() => setSectionPage(p => p + 1)}
                                        className="text-athena-text-muted hover:text-white disabled:opacity-30 disabled:hover:text-athena-text-muted transition-colors p-1"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                        {displaySections.slice(sectionPage * 5, (sectionPage + 1) * 5).map(sec => {
                            const sp = sec.total > 0 ? sec.done / sec.total : 0;
                            const isDone = sec.total > 0 && sec.done === sec.total;
                            const isShowingCompleted = showCompleted[sec.id] || false;

                            // Filter tasks based on toggle (show all when searching)
                            const visibleTasks = query
                                ? sec.tasks
                                : sec.tasks.filter(t => isShowingCompleted || !t.done);
                            const hiddenDoneCount = sec.done;

                            const headerProps = isDone ? {
                                onClick: () => setShowCompleted(prev => ({ ...prev, [sec.id]: !prev[sec.id] })),
                                className: "flex items-center gap-3 px-2 py-1.5 md:px-4 md:py-3 cursor-pointer select-none group/header"
                            } : {
                                className: "flex items-center gap-3 px-2 py-1.5 md:px-4 md:py-3"
                            };

                            return (
                                <ContextMenu key={sec.id}>
                                    <ContextMenuTrigger asChild>
                                        <div className="rounded-lg border border-athena-border/30 bg-white/[0.015] hover:bg-white/[0.03] transition-colors overflow-hidden flex flex-col h-full">
                                            <div {...headerProps}>
                                                <ChevronRight size={14} className={cn("text-athena-text-muted transition-transform duration-200 flex-shrink-0", isDone && isShowingCompleted && "rotate-90", isDone && "group-hover/header:text-athena-text-primary")} />
                                                <div className="flex items-center gap-2 flex-1">
                                                    {editingSectionId === sec.id ? (
                                                        <input
                                                            autoFocus
                                                            className="text-sm font-semibold bg-transparent border-b outline-none text-athena-text-primary px-1 -ml-1 w-full max-w-[200px]"
                                                            style={{ borderColor: projAccent }}
                                                            value={editingSectionName}
                                                            onChange={(e) => setEditingSectionName(e.target.value)}
                                                            onBlur={() => handleUpdateSectionName(sec.id)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleUpdateSectionName(sec.id);
                                                                if (e.key === 'Escape') setEditingSectionId(null);
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <span
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (sec.id !== 'unsectioned') {
                                                                    setEditingSectionName(sec.name);
                                                                    setEditingSectionId(sec.id);
                                                                }
                                                            }}
                                                            className={cn("text-sm md:text-base font-semibold transition-colors truncate", sec.id !== 'unsectioned' && "cursor-text hover:opacity-80", isDone ? "text-athena-text-muted line-through opacity-60 group-hover/header:opacity-80 group-hover/header:text-athena-text-primary" : "text-athena-text-primary")}
                                                        >
                                                            {sec.name}
                                                        </span>
                                                    )}

                                                    {sec.timeline && (
                                                        <span className="hidden md:inline text-[10px] text-athena-text-muted/60 font-medium ml-2 border border-athena-border/30 px-1.5 py-0.5 rounded bg-white/[0.02]">
                                                            {sec.timeline}
                                                        </span>
                                                    )}

                                                    {/* Header + Add Task Trigger */}
                                                    <button
                                                        type="button"
                                                        onPointerDown={(e) => { e.stopPropagation(); }}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setActiveSectionId(sec.id);
                                                            setNewStartDate(new Date());
                                                            setNewTaskDate(new Date());
                                                            setNewTaskName("");
                                                            setIsTaskModalOpen(true);
                                                        }}
                                                        className="text-athena-text-muted/30 hover:text-athena-text-primary transition-colors focus:outline-none flex-shrink-0"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                                        <div className={cn("h-full rounded-full transition-all", isDone ? "bg-emerald-400" : "bg-athena-gold")} style={{ width: `${sp * 100}%` }} />
                                                    </div>
                                                    <span className={cn("text-[10px] font-mono min-w-[32px] text-right", isDone ? "text-emerald-400" : "text-athena-text-muted")}>{sec.done}/{sec.total}</span>
                                                </div>
                                            </div>

                                            {visibleTasks.length > 0 && (
                                                <div className="px-4 pb-2 pl-10 space-y-0.5 md:space-y-1">
                                                    {visibleTasks.map(t => (
                                                        <ContextMenu key={t.id}>
                                                            <ContextMenuTrigger asChild>
                                                                <div onClick={() => handleToggleTask(t.id, t.done ? 'Done' : 'To Do')} className="flex items-center gap-2.5 py-1 group/task cursor-pointer">
                                                                    <div className={cn("w-5 h-5 md:w-3.5 md:h-3.5 rounded flex-shrink-0 flex items-center justify-center transition-colors", t.done ? "bg-emerald-400/20 border border-emerald-400/40" : "border border-athena-border/50 group-hover/task:border-athena-gold/50")}>
                                                                        {t.done && <Check size={8} className="text-emerald-400" />}
                                                                    </div>
                                                                    <span className={cn("text-[13px] flex-1 transition-colors truncate max-w-[200px] md:max-w-none md:overflow-visible md:whitespace-normal", t.done ? "text-athena-text-muted/50 line-through" : "text-athena-text-muted group-hover/task:text-athena-text-primary")}>{t.name}</span>

                                                                    {!t.done && t.dateInfo && (
                                                                        <span className={cn("text-[10px]",
                                                                            t.dateInfo.isOverdue ? "text-red-400 font-semibold" :
                                                                                t.dateInfo.isToday ? "text-orange-400 font-semibold" :
                                                                                    "text-athena-text-muted/70 group-hover/task:text-athena-text-muted"
                                                                        )}>
                                                                            {t.dateInfo.formatted}
                                                                            {t.dateInfo.isOverdue ? " · Overdue" :
                                                                                t.dateInfo.isToday ? " · Due Today" :
                                                                                    ` · In ${t.dateInfo.daysUntilDue}d`}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </ContextMenuTrigger>
                                                            <ContextMenuContent className="bg-[#1A1816]/95 border-white/10 backdrop-blur-md w-48 overflow-hidden rounded-xl shadow-2xl p-1">
                                                                <ContextMenuItem
                                                                    className="gap-2 text-xs font-semibold text-red-400 focus:bg-red-400/10 focus:text-red-400 cursor-pointer p-2 rounded-lg"
                                                                    onClick={(e) => handleDeleteTask(e as unknown as React.MouseEvent, t.id)}
                                                                >
                                                                    Delete Task
                                                                </ContextMenuItem>
                                                            </ContextMenuContent>
                                                        </ContextMenu>
                                                    ))}
                                                </div>
                                            )}
                                            {!isDone && hiddenDoneCount > 0 && (
                                                <div className="px-4 pb-3 pl-10">
                                                    <button
                                                        onClick={() => setShowCompleted(prev => ({ ...prev, [sec.id]: !prev[sec.id] }))}
                                                        className="text-[10px] text-athena-text-muted/70 hover:text-athena-text-primary transition-colors flex items-center gap-1.5 py-1"
                                                    >
                                                        {isShowingCompleted ? "Hide completed tasks" : `Show ${hiddenDoneCount} completed tasks`}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent className="bg-[#1A1816]/95 border-white/10 backdrop-blur-md w-48 overflow-hidden rounded-xl shadow-2xl p-1">
                                        <ContextMenuItem
                                            className="gap-2 text-xs font-semibold text-red-400 focus:bg-red-400/10 focus:text-red-400 cursor-pointer p-2 rounded-lg"
                                            onClick={(e) => handleDeleteSection(e as unknown as React.MouseEvent, sec.id)}
                                        >
                                            Delete Section
                                        </ContextMenuItem>
                                    </ContextMenuContent>
                                </ContextMenu>
                            );
                        })}

                        {/* Add Section Button */}
                        <div className="pt-2">
                            {isAddingSection ? (
                                <input
                                    autoFocus
                                    className="w-full bg-black/20 border"
                                    style={{ borderColor: `${projAccent}30` }}
                                    placeholder="Section name..."
                                    value={newSectionName}
                                    onChange={(e) => setNewSectionName(e.target.value)}
                                    onBlur={handleAddSection}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSection(); } }}
                                />
                            ) : (
                                <button
                                    onClick={() => setIsAddingSection(true)}
                                    className="w-full md:w-auto flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-white/10 text-xs font-semibold text-athena-text-muted/50 hover:text-athena-text-primary hover:bg-white/5 hover:border-white/20 transition-all"
                                >
                                    <Plus size={14} /> Add New Section
                                </button>
                            )}
                        </div>
                            </>);
                        })()}
                    </div>

                    {/* Burndown Projection */}
                    {projTasks.length >= 5 && (
                        <div className="hidden md:block border-t border-athena-border/30 px-4 md:px-6 py-4">
                            <h3 className="text-lg font-serif text-athena-gold mb-3">Projection</h3>
                            <div className="bg-white/[0.02] border border-athena-border rounded-xl p-4">
                                <BurndownPrediction tasks={projTasks} projectCreatedAt={proj.created_at} deadline={proj.deadline} compact={false} />
                            </div>
                        </div>
                    )}
                </Card >
            </motion.div >

            <BrainDumpModal isOpen={isBrainDumpOpen} onClose={() => setIsBrainDumpOpen(false)} projects={projects} sections={sections} onRefresh={fetchData} />
            <AthenaPlanner isOpen={isPlannerOpen} onClose={() => setIsPlannerOpen(false)} onTasksCreated={fetchData} />

            {/* Task Creation Modal */}
            <Dialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
                <DialogContent className="sm:max-w-[425px] bg-[#0e0c0a] border-white/10 text-athena-text-primary max-h-[60vh] sm:h-auto overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Add New Task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        {/* Project selector */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-athena-text-muted">Project</label>
                            <select
                                value={proj?.id || ''}
                                onChange={(e) => {
                                    const targetProj = projects.find(p => p.id === e.target.value);
                                    if (targetProj) {
                                        setActiveIdx(projects.indexOf(targetProj));
                                        const projSecs = sections.filter(s => s.project_id === targetProj.id);
                                        if (projSecs.length > 0) setActiveSectionId(projSecs[0].id);
                                    }
                                }}
                                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl min-h-[44px] text-sm text-athena-text-primary px-3 focus:outline-none focus:border-athena-gold/50"
                            >
                                {projects.map(p => (
                                    <option key={p.id} value={p.id} className="bg-[#0e0c0a]">{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-athena-text-muted">Task Name</label>
                            <Input
                                value={newTaskName}
                                onChange={(e) => setNewTaskName(e.target.value)}
                                placeholder="What needs to be done?"
                                className="bg-black/20 border-white/10 text-white"
                                style={{ borderColor: projAccent }}
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-3">
                                <label className="text-sm font-medium text-athena-text-muted">Start Date</label>
                                <Popover open={startCalendarOpen} onOpenChange={setStartCalendarOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-full justify-start text-left font-normal bg-black/20 border-white/10 text-white hover:bg-white/5 hover:text-white",
                                                !newStartDate && "text-muted-foreground"
                                            )}
                                            style={{ borderColor: projAccent }}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {newStartDate ? format(newStartDate, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 bg-[#0e0c0a] border-white/10" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={newStartDate}
                                            onSelect={(date) => {
                                                setNewStartDate(date);
                                                setStartCalendarOpen(false);
                                                if (date) {
                                                    // Auto-advance due date to match if it was before the new start date
                                                    if (newTaskDate && date > newTaskDate) setNewTaskDate(date);
                                                    setEndCalendarOpen(true);
                                                }
                                            }}
                                            initialFocus
                                            className="bg-[#0e0c0a] text-white"
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="flex flex-col gap-3">
                                <label className="text-sm font-medium text-athena-text-muted">Due Date</label>
                                <Popover open={endCalendarOpen} onOpenChange={setEndCalendarOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-full justify-start text-left font-normal bg-black/20 border-white/10 text-white hover:bg-white/5 hover:text-white",
                                                !newTaskDate && "text-muted-foreground"
                                            )}
                                            style={{ borderColor: projAccent }}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {newTaskDate ? format(newTaskDate, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 bg-[#0e0c0a] border-white/10" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={newTaskDate}
                                            disabled={newStartDate ? { before: newStartDate } : undefined}
                                            onSelect={(date) => {
                                                setNewTaskDate(date);
                                                setEndCalendarOpen(false);
                                            }}
                                            className="bg-[#0e0c0a] text-white"
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="mt-2">
                        <Button variant="outline" onClick={() => setIsTaskModalOpen(false)} className="border-white/10 text-white hover:bg-white/5">
                            Cancel
                        </Button>
                        <Button onClick={handleAddTask} disabled={!newTaskName.trim()} className="bg-athena-gold text-black hover:bg-athena-gold/90">
                            Add Task
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div >

        {/* Mobile contextual action bar */}
        <div className="fixed bottom-0 left-0 right-0 md:hidden bg-athena-bg/90 backdrop-blur-sm border-t border-athena-border z-40 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-around h-14">
                <button onClick={() => setIsPlannerOpen(true)} className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center">
                    <Sparkles size={18} className="text-white/25" />
                    <span className="text-[10px] text-white/25 uppercase tracking-widest">Planner</span>
                </button>
                <button onClick={() => {
                    if (projects.length === 0) return;
                    const todayStr = format(new Date(), 'yyyy-MM-dd');
                    setMobileTaskDraft({
                        id: 'new',
                        name: '',
                        description: '',
                        status: 'To Do',
                        priority: 'Medium',
                        start_date: todayStr,
                        due_date: todayStr,
                        project_id: proj?.id || projects[0]?.id || '',
                        created_at: new Date().toISOString(),
                    } as Task);
                }} className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center">
                    <Plus size={18} className="text-white/25" />
                    <span className="text-[10px] text-white/25 uppercase tracking-widest">Add Task</span>
                </button>
                <button onClick={() => { searchInputRef.current?.focus(); searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center">
                    <Search size={18} className="text-white/25" />
                    <span className="text-[10px] text-white/25 uppercase tracking-widest">Search</span>
                </button>
            </div>
        </div>

        {/* Mobile Task Editor (reuses Calendar's bottom sheet) */}
        <MobileTaskEditor
            task={mobileTaskDraft}
            open={!!mobileTaskDraft}
            onClose={() => setMobileTaskDraft(null)}
            projects={projects}
            sections={sections}
            onUpdate={() => fetchData(false)}
            onDelete={async (taskId) => {
                await supabase.from('tasks').delete().eq('id', taskId);
                fetchData(false);
            }}
            onCreate={(newTask) => {
                setTasks(prev => [...prev, newTask]);
                fetchData(false);
            }}
            onDraftChange={setMobileTaskDraft}
        />

        </div>
    );
}
