"use client";

import { useMemo, useState, useRef, useEffect } from 'react';
import { Project, Task, Section, Milestone } from '@/types/productivity';
import { Card } from '@/components/ui/card';
import { ActivityHeatmap } from './charts/ActivityHeatmap';
import { MomentumGauge } from './charts/MomentumGauge';
import { BurndownPrediction } from './charts/BurndownPrediction';
import { ChevronDown, ChevronRight, Clock, Plus, X, Brain, Rocket, Folder, Target, Zap, Cpu, Code, Briefcase, CalendarIcon, Flag, CheckCircle2, TrendingUp, AlertCircle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, isBefore, parseISO, differenceInDays, addWeeks } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

function getDeadlineInfo(deadline: string) {
    const deadlineDate = parseISO(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadlineDate.setHours(0, 0, 0, 0);
    const daysLeft = differenceInDays(deadlineDate, today);

    let color = 'text-green-400 bg-green-400/10 border-green-400/20';
    let label = '';

    if (daysLeft < 0) {
        color = 'text-red-400 bg-red-400/10 border-red-400/20';
        label = `${Math.abs(daysLeft)}d overdue`;
    } else if (daysLeft === 0) {
        color = 'text-red-400 bg-red-400/10 border-red-400/20';
        label = 'Due today';
    } else if (daysLeft <= 7) {
        color = 'text-athena-gold bg-athena-gold/10 border-athena-gold/20';
        label = `${daysLeft}d left`;
    } else {
        label = `Due ${format(parseISO(deadline), 'MMM d')}`;
    }

    return { color, label, daysLeft };
}

interface ProjectCardProps {
    project: Project;
    tasks: Task[];
    sections: Section[];
    onToggleTask: (task: Task) => void;
    onCompleteProject: (projectId: string) => void;
    onEditTask: (task: Task) => void;
    onUpdateProject: (project: Partial<Project> & { id: string }) => void;
    onUpdateSection: (section: Partial<Section> & { id: string }) => void;
    onAddSection: (section: Section) => void;
    onDeleteSection: (sectionId: string) => void;
    onDeleteProject: (projectId: string) => void;
    onAddTask: (task: Task) => void;
}

export function ProjectCard({ project, tasks, sections, onToggleTask, onCompleteProject, onDeleteProject, onEditTask, onUpdateProject, onUpdateSection, onAddSection, onDeleteSection, onAddTask }: ProjectCardProps) {
    const supabase = createClient();
    const isMobile = useIsMobile();
    const [mobileChartsOpen, setMobileChartsOpen] = useState(false);

    const [editingName, setEditingName] = useState(false);
    const [editingDesc, setEditingDesc] = useState(false);
    const [nameValue, setNameValue] = useState(project.name);
    const [descValue, setDescValue] = useState(project.overview || '');
    const [isDeleting, setIsDeleting] = useState(false); // Confirmation state

    // Deadline & Milestone state
    const [editingDeadline, setEditingDeadline] = useState(false);
    const [deadlineValue, setDeadlineValue] = useState(project.deadline || '');
    const [milestones, setMilestones] = useState<Milestone[]>(project.milestones || []);
    const [showMilestones, setShowMilestones] = useState(false);
    const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
    const [newMilestoneDate, setNewMilestoneDate] = useState('');

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'Done').length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    const orderedSections = [...sections].sort((a, b) => a.order - b.order);

    // Sort tasks by date: due_date first, then start_date, then name
    const sortByDate = (a: Task, b: Task) => {
        const aDate = a.due_date || a.start_date;
        const bDate = b.due_date || b.start_date;
        if (!aDate && !bDate) return a.name.localeCompare(b.name);
        if (!aDate) return 1; // Tasks without dates go to bottom
        if (!bDate) return -1;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
    };

    const unsectionedTasks = useMemo(() =>
        tasks.filter(t => !t.section_id).sort(sortByDate)
        , [tasks]);

    const upcomingTasks = useMemo(() => {
        return tasks
            .filter(t => t.status !== 'Done' && t.due_date)
            .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
            .slice(0, 3);
    }, [tasks]);

    // Velocity calculation
    const velocityInfo = useMemo(() => {
        const now = new Date();
        const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

        // Count tasks completed in the last 4 weeks
        const recentlyCompleted = tasks.filter(t => {
            if (t.status !== 'Done') return false;
            // Use completed_at if available, otherwise we can't determine when it was completed
            if (t.completed_at) {
                const completedDate = parseISO(t.completed_at);
                return completedDate >= fourWeeksAgo && completedDate <= now;
            }
            return false;
        });

        const velocity = recentlyCompleted.length / 4; // tasks per week
        const remaining = totalTasks - completedTasks;

        if (completedTasks === totalTasks && totalTasks > 0) {
            return { velocity, label: 'Complete', projected: null, hasActivity: true };
        }

        if (velocity === 0) {
            // Fallback: if we have no completed_at data but have done tasks, indicate unknown velocity
            const hasDoneTasks = tasks.some(t => t.status === 'Done');
            if (hasDoneTasks && recentlyCompleted.length === 0) {
                return { velocity: 0, label: 'No recent activity', projected: null, hasActivity: false };
            }
            return { velocity: 0, label: 'No recent activity', projected: null, hasActivity: false };
        }

        const weeksRemaining = remaining / velocity;
        const projectedDate = addWeeks(now, weeksRemaining);
        const roundedWeeks = Math.ceil(weeksRemaining);

        let label: string;
        if (roundedWeeks <= 1) {
            label = '~1 week to complete';
        } else if (roundedWeeks <= 12) {
            label = `~${roundedWeeks} weeks to complete`;
        } else {
            label = `Est. ${format(projectedDate, 'MMM d, yyyy')}`;
        }

        return { velocity, label, projected: projectedDate, hasActivity: true };
    }, [tasks, totalTasks, completedTasks]);

    const colorMap: Record<string, string> = {
        blue: 'text-blue-400 bg-blue-500',
        purple: 'text-purple-400 bg-purple-500',
        green: 'text-green-400 bg-green-500',
        slate: 'text-slate-400 bg-slate-500',
        orange: 'text-orange-400 bg-orange-500',
        red: 'text-red-400 bg-red-500',
        gold: 'text-athena-gold bg-athena-gold',
        teal: 'text-teal-400 bg-teal-500',
        default: 'text-zinc-400 bg-zinc-500'
    };
    const colorKey = project.color || 'default';
    const accentBg = colorMap[colorKey]?.split(' ')[1] || 'bg-zinc-500';

    // Inline save handlers
    const saveProjectName = async () => {
        if (nameValue.trim() && nameValue !== project.name) {
            const newName = nameValue.trim();
            onUpdateProject({ id: project.id, name: newName });
            await supabase.from('projects').update({ name: newName }).eq('id', project.id);
            toast.success('Project name updated');
        }
        setEditingName(false);
    };

    const saveProjectDesc = async () => {
        if (descValue !== (project.overview || '')) {
            const newDesc = descValue.trim() || undefined;
            onUpdateProject({ id: project.id, overview: newDesc });
            await supabase.from('projects').update({ overview: newDesc }).eq('id', project.id);
            toast.success('Description updated');
        }
        setEditingDesc(false);
    };

    const handleDeleteClick = () => {
        if (isDeleting) {
            onDeleteProject(project.id);
        } else {
            setIsDeleting(true);
            setTimeout(() => setIsDeleting(false), 3000); // Reset after 3s
        }
    };

    const saveDeadline = async () => {
        setEditingDeadline(false);
        const newDeadline = deadlineValue || null;
        onUpdateProject({ id: project.id, deadline: newDeadline as string | undefined });
        await supabase.from('projects').update({ deadline: newDeadline }).eq('id', project.id);
        toast.success(newDeadline ? 'Deadline updated' : 'Deadline removed');
    };

    const clearDeadline = async () => {
        setDeadlineValue('');
        setEditingDeadline(false);
        onUpdateProject({ id: project.id, deadline: undefined });
        await supabase.from('projects').update({ deadline: null }).eq('id', project.id);
        toast.success('Deadline removed');
    };

    const addMilestone = async () => {
        if (!newMilestoneTitle.trim() || !newMilestoneDate) return;
        const newMilestone: Milestone = {
            title: newMilestoneTitle.trim(),
            target_date: newMilestoneDate,
            completed: false,
        };
        const updated = [...milestones, newMilestone];
        setMilestones(updated);
        setNewMilestoneTitle('');
        setNewMilestoneDate('');
        onUpdateProject({ id: project.id, milestones: updated });
        await supabase.from('projects').update({ milestones: updated }).eq('id', project.id);
        toast.success('Milestone added');
    };

    const toggleMilestone = async (index: number) => {
        const updated = milestones.map((m, i) =>
            i === index ? { ...m, completed: !m.completed } : m
        );
        setMilestones(updated);
        onUpdateProject({ id: project.id, milestones: updated });
        await supabase.from('projects').update({ milestones: updated }).eq('id', project.id);
    };

    const removeMilestone = async (index: number) => {
        const updated = milestones.filter((_, i) => i !== index);
        setMilestones(updated);
        onUpdateProject({ id: project.id, milestones: updated });
        await supabase.from('projects').update({ milestones: updated }).eq('id', project.id);
        toast.success('Milestone removed');
    };

    const ITEMS_PER_PAGE = 5;
    const [page, setPage] = useState(1);
    const totalPages = Math.ceil(orderedSections.length / ITEMS_PER_PAGE);

    // Reset page if sections change significantly (optional, but good UX)
    useEffect(() => {
        if (page > totalPages && totalPages > 0) {
            setPage(totalPages);
        }
    }, [orderedSections.length, totalPages, page]);

    const paginatedSections = orderedSections.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    return (
        <Card className="group bg-card/40 backdrop-blur-md border-white/5 overflow-hidden transition-all hover:bg-card/50">
            {/* Header */}
            <div className="p-4 md:p-6 border-b border-white/5 space-y-3 md:space-y-4">
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        {/* Editable Project Name + Icon/Color */}
                        <div className="flex items-center gap-2 md:gap-3">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button className="hover:scale-110 transition-transform focus:outline-none shrink-0" title="Change icon & color">
                                        {(() => {
                                            const iconSize = isMobile ? "w-6 h-6" : "w-8 h-8";
                                            const iconMap: Record<string, React.ReactNode> = {
                                                brain: <Brain className={iconSize} />,
                                                rocket: <Rocket className={iconSize} />,
                                                target: <Target className={iconSize} />,
                                                zap: <Zap className={iconSize} />,
                                                cpu: <Cpu className={iconSize} />,
                                                code: <Code className={iconSize} />,
                                                briefcase: <Briefcase className={iconSize} />,
                                                folder: <Folder className={iconSize} />,
                                            };
                                            const icon = iconMap[project.emoji || ''];
                                            if (icon) return <span className={colorMap[project.color || 'purple']?.split(' ')[0]}>{icon}</span>;
                                            return <span className="text-2xl md:text-3xl">{project.emoji || '📁'}</span>;
                                        })()}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 bg-athena-panel border border-athena-border backdrop-blur-xl p-3" side="bottom" align="start">
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-[9px] uppercase tracking-widest text-athena-text-muted font-bold mb-2">Icon</p>
                                            <div className="grid grid-cols-4 gap-1.5">
                                                {[
                                                    { key: 'brain', icon: <Brain size={18} /> },
                                                    { key: 'rocket', icon: <Rocket size={18} /> },
                                                    { key: 'target', icon: <Target size={18} /> },
                                                    { key: 'zap', icon: <Zap size={18} /> },
                                                    { key: 'cpu', icon: <Cpu size={18} /> },
                                                    { key: 'code', icon: <Code size={18} /> },
                                                    { key: 'briefcase', icon: <Briefcase size={18} /> },
                                                    { key: 'folder', icon: <Folder size={18} /> },
                                                ].map(item => (
                                                    <button
                                                        key={item.key}
                                                        onClick={() => onUpdateProject({ id: project.id, emoji: item.key })}
                                                        className={cn(
                                                            "p-2 rounded-lg border transition-all flex items-center justify-center",
                                                            project.emoji === item.key
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
                                            <p className="text-[9px] uppercase tracking-widest text-athena-text-muted font-bold mb-2">Color</p>
                                            <div className="grid grid-cols-4 gap-1.5">
                                                {Object.entries(colorMap).filter(([k]) => k !== 'default').map(([colorName, classes]) => (
                                                    <button
                                                        key={colorName}
                                                        onClick={() => onUpdateProject({ id: project.id, color: colorName })}
                                                        className={cn(
                                                            "w-full h-7 rounded-lg border transition-all",
                                                            classes.split(' ')[1],
                                                            project.color === colorName
                                                                ? "border-white/60 ring-1 ring-white/30"
                                                                : "border-transparent opacity-60 hover:opacity-100"
                                                        )}
                                                        title={colorName}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            {editingName ? (
                                <Input
                                    value={nameValue}
                                    onChange={(e) => setNameValue(e.target.value)}
                                    onBlur={saveProjectName}
                                    onKeyDown={(e) => e.key === 'Enter' && saveProjectName()}
                                    className="text-lg md:text-2xl font-bold bg-transparent border-white/20 h-auto py-1 px-2"
                                    autoFocus
                                />
                            ) : (
                                <h3
                                    className="text-lg md:text-2xl font-bold tracking-tight cursor-pointer hover:text-white/80 transition-colors truncate"
                                    onClick={() => setEditingName(true)}
                                >
                                    {project.name}
                                </h3>
                            )}
                        </div>
                        {/* Editable Description */}
                        {editingDesc ? (
                            <Input
                                value={descValue}
                                onChange={(e) => setDescValue(e.target.value)}
                                onBlur={saveProjectDesc}
                                onKeyDown={(e) => e.key === 'Enter' && saveProjectDesc()}
                                placeholder="Add a description..."
                                className="mt-2 text-sm bg-transparent border-white/20 text-muted-foreground"
                                autoFocus
                            />
                        ) : (
                            <p
                                className="text-sm text-muted-foreground mt-1 max-w-2xl cursor-pointer hover:text-white/60 transition-colors"
                                onClick={() => setEditingDesc(true)}
                            >
                                {project.overview || 'Add a description...'}
                            </p>
                        )}

                        {/* Deadline Display */}
                        <div className="mt-2 flex items-center gap-2">
                            {editingDeadline ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={deadlineValue}
                                        onChange={(e) => setDeadlineValue(e.target.value)}
                                        className="text-xs bg-black/30 border border-white/20 rounded px-2 py-1 text-white outline-none"
                                        autoFocus
                                    />
                                    <Button size="sm" variant="ghost" onClick={saveDeadline} className="h-6 px-2 text-xs text-green-400 hover:bg-green-400/10">
                                        Save
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setEditingDeadline(false); setDeadlineValue(project.deadline || ''); }} className="h-6 px-2 text-xs text-zinc-400">
                                        Cancel
                                    </Button>
                                    {project.deadline && (
                                        <Button size="sm" variant="ghost" onClick={clearDeadline} className="h-6 px-2 text-xs text-red-400 hover:bg-red-400/10">
                                            Remove
                                        </Button>
                                    )}
                                </div>
                            ) : project.deadline ? (
                                (() => {
                                    const info = getDeadlineInfo(project.deadline);
                                    return (
                                        <button
                                            onClick={() => setEditingDeadline(true)}
                                            className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors hover:opacity-80", info.color)}
                                        >
                                            <Flag className="w-3 h-3" />
                                            {info.label}
                                        </button>
                                    );
                                })()
                            ) : (
                                <button
                                    onClick={() => setEditingDeadline(true)}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white/60 transition-colors"
                                >
                                    <Flag className="w-3 h-3" />
                                    Set deadline
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Progress Stats & Delete */}
                    <div className="hidden md:flex flex-col items-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDeleteClick}
                            className={cn(
                                "h-6 px-2 text-xs transition-all",
                                isDeleting ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 w-auto" : "text-zinc-500 hover:text-zinc-400 w-6 opacity-0 group-hover:opacity-100"
                            )}
                            title={isDeleting ? "Click again to confirm" : "Delete Project"}
                        >
                            {isDeleting ? "Confirm Delete" : <X className="w-4 h-4" />}
                        </Button>

                        {/* Progress Bar (Wrapped) */}
                        <div className="text-right min-w-[200px]">
                            <div className="flex items-center justify-end gap-2 text-sm font-mono text-muted-foreground mb-2">
                                <span className="font-bold text-white">{Math.round(progress)}% Complete</span>
                                <span>{completedTasks} / {totalTasks}</span>
                            </div>
                            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className={cn("h-full transition-all duration-500 rounded-full", accentBg)}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>

                            {/* Velocity & Projected Completion */}
                            <div className="flex items-center justify-end gap-3 mt-2">
                                {velocityInfo.hasActivity ? (
                                    <>
                                        <span className="flex items-center gap-1 text-[11px] text-emerald-400/80 font-mono">
                                            <TrendingUp className="w-3 h-3" />
                                            {velocityInfo.velocity.toFixed(1)} tasks/wk
                                        </span>
                                        {velocityInfo.label !== 'Complete' && (
                                            <span className="text-[11px] text-muted-foreground font-mono">
                                                {velocityInfo.label}
                                            </span>
                                        )}
                                        {velocityInfo.label === 'Complete' && (
                                            <span className="text-[11px] text-emerald-400/80 font-mono">
                                                All done
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <span className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
                                        <AlertCircle className="w-3 h-3" />
                                        {velocityInfo.label}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile: Compact progress bar + stats */}
                {isMobile && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className={cn("h-full transition-all duration-500 rounded-full", accentBg)}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <span className="text-xs font-mono text-white/70 shrink-0">{Math.round(progress)}%</span>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">{completedTasks}/{totalTasks}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {velocityInfo.hasActivity ? (
                                    <span className="flex items-center gap-1 text-[10px] text-emerald-400/80 font-mono">
                                        <TrendingUp className="w-3 h-3" />
                                        {velocityInfo.velocity.toFixed(1)}/wk
                                        {velocityInfo.label !== 'Complete' && <span className="text-muted-foreground ml-1">{velocityInfo.label}</span>}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-zinc-500 font-mono">{velocityInfo.label}</span>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDeleteClick}
                                className={cn(
                                    "h-7 px-2 text-xs transition-all",
                                    isDeleting ? "bg-red-500/20 text-red-400 w-auto" : "text-zinc-500 w-7"
                                )}
                            >
                                {isDeleting ? "Delete?" : <X className="w-3.5 h-3.5" />}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Charts Row — Desktop: always visible, Mobile: collapsible */}
            {isMobile ? (
                <div className="border-y border-white/5">
                    <button
                        onClick={() => setMobileChartsOpen(!mobileChartsOpen)}
                        className="w-full flex items-center gap-2 px-4 py-3 bg-black/20 active:bg-black/30 transition-colors"
                    >
                        <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold flex-1 text-left">Charts & Analytics</span>
                        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", mobileChartsOpen && "rotate-180")} />
                    </button>
                    {mobileChartsOpen && (
                        <div className="grid grid-cols-1 gap-3 p-3 bg-black/30">
                            <div className="bg-gradient-to-br from-white/[0.03] to-transparent rounded-xl p-3 h-40 border border-white/5">
                                <BurndownPrediction tasks={tasks} projectCreatedAt={project.created_at} deadline={project.deadline} compact={true} />
                            </div>
                            <div className="bg-gradient-to-br from-white/[0.03] to-transparent rounded-xl p-3 h-40 border border-white/5">
                                <ActivityHeatmap tasks={tasks} color={project.color} />
                            </div>
                            <div className="bg-gradient-to-br from-white/[0.03] to-transparent rounded-xl p-3 h-40 border border-white/5">
                                <MomentumGauge tasks={tasks} />
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-black/30 border-y border-white/5">
                    <div className="bg-gradient-to-br from-white/[0.03] to-transparent rounded-xl p-4 h-44 border border-white/5">
                        <BurndownPrediction tasks={tasks} projectCreatedAt={project.created_at} deadline={project.deadline} compact={true} />
                    </div>
                    <div className="bg-gradient-to-br from-white/[0.03] to-transparent rounded-xl p-4 h-44 border border-white/5">
                        <ActivityHeatmap tasks={tasks} color={project.color} />
                    </div>
                    <div className="bg-gradient-to-br from-white/[0.03] to-transparent rounded-xl p-4 h-44 border border-white/5">
                        <MomentumGauge tasks={tasks} />
                    </div>
                </div>
            )}

            {/* Milestones */}
            <div className="px-4 md:px-6 pt-3 md:pt-4 border-t border-white/5">
                <button
                    onClick={() => setShowMilestones(!showMilestones)}
                    className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground hover:text-white transition-colors mb-2"
                >
                    {showMilestones ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <Flag className="w-3 h-3" />
                    Milestones ({milestones.filter(m => m.completed).length}/{milestones.length})
                </button>

                {showMilestones && (
                    <div className="space-y-2 pb-3">
                        {milestones
                            .sort((a, b) => new Date(a.target_date).getTime() - new Date(b.target_date).getTime())
                            .map((milestone, index) => {
                                const msDeadline = getDeadlineInfo(milestone.target_date);
                                return (
                                    <div key={index} className="flex items-center gap-3 py-1.5 px-3 rounded-md hover:bg-white/5 group transition-all">
                                        <Checkbox
                                            checked={milestone.completed}
                                            onCheckedChange={() => toggleMilestone(index)}
                                            className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 border-white/20"
                                        />
                                        <span className={cn(
                                            "text-sm flex-1 transition-all",
                                            milestone.completed ? "text-muted-foreground line-through opacity-50" : "text-zinc-200"
                                        )}>
                                            {milestone.title}
                                        </span>
                                        {!milestone.completed && (
                                            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded border", msDeadline.color)}>
                                                {msDeadline.label}
                                            </span>
                                        )}
                                        {milestone.completed && (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500/50" />
                                        )}
                                        <button
                                            onClick={() => removeMilestone(index)}
                                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-400/10 p-1 rounded transition-all"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                );
                            })}

                        {/* Add milestone form */}
                        <div className="flex items-center gap-2 pt-1">
                            <Input
                                value={newMilestoneTitle}
                                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                                placeholder="Milestone title..."
                                className="h-7 text-xs bg-transparent border-white/10 flex-1"
                                onKeyDown={(e) => e.key === 'Enter' && addMilestone()}
                            />
                            <input
                                type="date"
                                value={newMilestoneDate}
                                onChange={(e) => setNewMilestoneDate(e.target.value)}
                                className="h-7 text-xs bg-transparent border border-white/10 rounded px-2 text-white outline-none"
                            />
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={addMilestone}
                                disabled={!newMilestoneTitle.trim() || !newMilestoneDate}
                                className="h-7 px-2 text-xs hover:bg-white/10"
                            >
                                <Plus className="w-3 h-3" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Body */}
            <div className="p-4 md:p-6 border-t border-white/5 space-y-4 md:space-y-6">
                {/* Next Up */}
                {upcomingTasks.length > 0 && (
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                            <Clock className="w-3 h-3" /> Next Up
                        </h4>
                        <div className="space-y-1">
                            {upcomingTasks.map(task => (
                                <TaskRow key={task.id} task={task} onToggle={onToggleTask} onEdit={onEditTask} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Uncategorized Tasks with AI Organize Button */}
                {unsectionedTasks.length > 0 && (
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-2 px-2">
                            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-[10px]">
                                Uncategorized ({unsectionedTasks.length})
                            </h4>
                            {sections.length > 0 && null}
                        </div>
                        <div className="space-y-1">
                            {unsectionedTasks.map(task => (
                                <TaskRow key={task.id} task={task} onToggle={onToggleTask} onEdit={onEditTask} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Sections List */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between px-2 pt-2 pb-1 border-t border-white/5 mt-4">
                        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-[10px]">
                            Project Sections
                        </h4>
                        <AddSectionRow
                            projectId={project.id}
                            sectionCount={sections.length}
                            onAddSection={onAddSection}
                        />
                    </div>

                    {paginatedSections.map(section => {
                        const sectionTasks = tasks
                            .filter(t => t.section_id === section.id)
                            .sort(sortByDate);
                        return (
                            <SectionRow
                                key={section.id}
                                section={section}
                                tasks={sectionTasks}
                                onToggleTask={onToggleTask}
                                onEditTask={onEditTask}
                                onUpdateSection={onUpdateSection}
                                onDeleteSection={onDeleteSection}
                                onAddTask={onAddTask}
                            />
                        );
                    })}

                    {/* Pagination Controls */}
                    {orderedSections.length > ITEMS_PER_PAGE && (
                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                            <div className="text-xs text-muted-foreground">
                                Showing {((page - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(page * ITEMS_PER_PAGE, orderedSections.length)} of {orderedSections.length}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                >
                                    <ChevronDown className="w-4 h-4 rotate-90" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}

function SectionRow({ section, tasks, onToggleTask, onEditTask, onUpdateSection, onDeleteSection, onAddTask }: {
    section: Section,
    tasks: Task[],
    onToggleTask: (t: Task) => void,
    onEditTask: (t: Task) => void,
    onUpdateSection: (section: Partial<Section> & { id: string }) => void,
    onDeleteSection: (sectionId: string) => void,
    onAddTask: (task: Task) => void
}) {
    const supabase = createClient();
    const [isOpen, setIsOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [nameValue, setNameValue] = useState(section.name);
    const [isAddingTask, setIsAddingTask] = useState(false);
    const [newTaskName, setNewTaskName] = useState('');
    const completed = tasks.filter(t => t.status === 'Done').length;

    const saveName = async () => {
        if (nameValue.trim() && nameValue !== section.name) {
            const newName = nameValue.trim();
            onUpdateSection({ id: section.id, name: newName });
            await supabase.from('sections').update({ name: newName }).eq('id', section.id);
            toast.success('Section renamed');
        }
        setEditing(false);
    };

    const handleDeleteSection = async () => {
        if (confirm('Delete section? Tasks will become uncategorized.')) {
            onDeleteSection(section.id);
            await supabase.from('tasks').update({ section_id: null }).eq('section_id', section.id);
            await supabase.from('sections').delete().eq('id', section.id);
            toast.success('Section deleted');
        }
    };

    const handleAddTask = async () => {
        if (!newTaskName.trim()) return;
        const newTask: Task = {
            id: crypto.randomUUID(),
            name: newTaskName.trim(),
            description: '',
            priority: 'Medium',
            due_date: null,
            project_id: section.project_id,
            section_id: section.id,
            status: 'To Do',
            created_at: new Date().toISOString()
        };
        onAddTask(newTask);
        setNewTaskName('');
        setIsAddingTask(false);
        const { error } = await supabase.from('tasks').insert(newTask);
        if (error) {
            toast.error('Failed to add task');
        } else {
            toast.success('Task added');
        }
    };

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group">
            <div className="flex items-center gap-4 py-3 px-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                <CollapsibleTrigger asChild>
                    <button className="p-1 hover:bg-white/10 rounded text-muted-foreground group-hover:text-white transition-colors">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                </CollapsibleTrigger>

                <div className="flex-1 flex items-center gap-3">
                    {editing ? (
                        <Input
                            value={nameValue}
                            onChange={(e) => setNameValue(e.target.value)}
                            onBlur={saveName}
                            onKeyDown={(e) => { e.key === 'Enter' && saveName(); e.key === 'Escape' && setEditing(false); }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-6 text-sm bg-transparent border-white/20 w-40"
                            autoFocus
                        />
                    ) : (
                        <span
                            className="font-semibold text-sm text-zinc-300 group-hover:text-white transition-colors cursor-text"
                            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                        >
                            {section.name}
                        </span>
                    )}
                    <span className="text-xs text-muted-foreground bg-black/20 px-2 py-0.5 rounded-full border border-white/5">
                        {completed} / {tasks.length}
                    </span>
                    <div className="h-px flex-1 bg-white/5 group-hover:bg-white/10 transition-colors" />
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSection(); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-red-400 transition-all"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            </div>

            <CollapsibleContent className="pl-9 space-y-1 pb-2">
                {tasks.map(task => (
                    <TaskRow key={task.id} task={task} onToggle={onToggleTask} onEdit={onEditTask} />
                ))}

                {/* Add Task Row */}
                {isAddingTask ? (
                    <div className="flex items-center gap-2 py-1">
                        <Input
                            value={newTaskName}
                            onChange={(e) => setNewTaskName(e.target.value)}
                            onBlur={() => { if (!newTaskName) setIsAddingTask(false); }}
                            onKeyDown={(e) => { e.key === 'Enter' && handleAddTask(); e.key === 'Escape' && setIsAddingTask(false); }}
                            placeholder="Task name..."
                            className="h-7 text-sm bg-transparent border-white/20 flex-1"
                            autoFocus
                        />
                        <Button size="sm" onClick={handleAddTask} className="h-7 px-2 text-xs">Add</Button>
                    </div>
                ) : (
                    <button
                        onClick={() => setIsAddingTask(true)}
                        className="text-xs text-muted-foreground hover:text-white flex items-center gap-1 py-2 px-3 hover:bg-white/5 rounded-md transition-colors w-full"
                    >
                        <Plus className="w-3 h-3" /> Add task
                    </button>
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}

function AddSectionRow({ projectId, sectionCount, onAddSection }: { projectId: string, sectionCount: number, onAddSection: (section: Section) => void }) {
    const supabase = createClient();
    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');

    const handleAddSection = async () => {
        if (!name.trim()) return;
        const newSection: Section = {
            id: crypto.randomUUID(),
            name: name.trim(),
            project_id: projectId,
            order: sectionCount,
            created_at: new Date().toISOString()
        };
        onAddSection(newSection);
        setName('');
        setIsAdding(false);
        const { error } = await supabase.from('sections').insert(newSection);
        if (error) {
            toast.error('Failed to add section');
        } else {
            toast.success('Section added');
        }
    };

    if (isAdding) {
        return (
            <div className="flex items-center gap-2">
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => { if (!name) setIsAdding(false); }}
                    onKeyDown={(e) => { e.key === 'Enter' && handleAddSection(); e.key === 'Escape' && setIsAdding(false); }}
                    placeholder="Section name..."
                    className="h-6 w-32 text-xs bg-transparent border-white/20"
                    autoFocus
                />
                <Button size="sm" variant="ghost" onClick={handleAddSection} className="h-6 w-6 p-0 hover:bg-white/10">
                    <Plus className="w-3 h-3" />
                </Button>
            </div>
        );
    }

    return (
        <button
            onClick={() => setIsAdding(true)}
            className="text-xs text-muted-foreground hover:text-white flex items-center gap-1 hover:bg-white/5 rounded px-2 py-1 transition-colors"
        >
            <Plus className="w-3 h-3" /> section
        </button>
    );
}

function TaskRow({ task, onToggle, onEdit }: { task: Task, onToggle: (t: Task) => void, onEdit: (t: Task) => void }) {
    return (
        <div className="flex items-center gap-3 py-2.5 md:py-2 px-3 rounded-md hover:bg-white/5 active:bg-white/5 group transition-all border border-transparent hover:border-white/5 min-h-[44px]">
            <Checkbox
                checked={task.status === 'Done'}
                onCheckedChange={() => onToggle(task)}
                className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 border-white/20 w-5 h-5 md:w-4 md:h-4"
            />

            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(task)}>
                <p className={cn(
                    "text-sm font-mono truncate transition-all",
                    task.status === 'Done' ? "text-muted-foreground line-through opacity-50" : "text-zinc-200 group-hover:text-white"
                )}>
                    {task.name}
                </p>
            </div>

            {(task.due_date || task.start_date) && (
                <div className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono bg-black/20 px-2 py-1 rounded shrink-0 group-hover:bg-black/40 transition-colors">
                    {task.start_date && task.due_date && task.start_date !== task.due_date ? (
                        <>
                            <span className="text-zinc-500">{format(parseISO(task.start_date), 'MMM d')}</span>
                            <span className="text-zinc-600">-</span>
                            <span className={isBefore(parseISO(task.due_date), new Date()) ? 'text-red-400' : 'text-zinc-400'}>
                                {format(parseISO(task.due_date), 'MMM d')}
                            </span>
                        </>
                    ) : (
                        <span className={task.due_date && isBefore(parseISO(task.due_date), new Date()) && task.status !== 'Done' ? 'text-red-400' : ''}>
                            {task.due_date ? format(parseISO(task.due_date), 'MMM d') : (task.start_date ? format(parseISO(task.start_date), 'MMM d') : '')}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
